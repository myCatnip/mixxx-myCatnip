// lib/binding.js — Binding primitive, its colour-scheme
// render path, the snapshot field list, and the transaction
// model for physical button presses.
//
// Loaded after lib/core, lib/timing, lib/schemes. Extends the
// render path with per-scheme perception overrides (v2.1.0):
// every render call threads `perceptionOverride` (from
// scheme.perception) through to ctrl.sendLED, which applies
// mix correction and hands post-perception values to hw.send.
//
// Session-scoped fields (_normalized, _ledObservers, _transaction,
// _togglePressActive, _lastOutKeyValue, _lastCoValue) are set in
// the constructor after _bindingDefaults() — _reset doesn't touch
// them.


// ============================================================
// RESET-ABLE BINDING FIELD FACTORY
// ============================================================
// Every field wiped on _reset (and therefore also set at
// construction). Add a new reset-able field here AND to
// myCatnip._BINDING_FIELDS in core.js (as either snapshot
// or ignored) so the boot-time audit stays clean.
myCatnip._bindingDefaults = function() {
    return {
        group:       undefined,
        inKey:       undefined,
        outKey:      undefined,
        buttonMode:  'toggle',
        softTakeover: false,
        _func:       undefined,
        _funcArgs:   [],
        _usedTokens: [],
        _rawCfg:     null,
        _noLED:      false,
        _csActive:          false,
        _csFailed:          false,
        _csDeviation:       false,
        _csScheme:          null,
        _csSchemeFn:        null,
        _csSchemeMemo:      null,
        _csCompiledMemo:    null,
        _csKnob:            null,
        _csFromStateConn:   null,
        _csOn:              null,
        _valueConn:  null,
        _conns:      [],
        _valueCurve: 1,
        _hotcueColorCO:      undefined,
        _cachedHotcueColor:  undefined,
        _shutdownHoldTimer: null
    };
};

// ============================================================
// BINDING
// ============================================================
myCatnip.Binding = function(name, spec, ctrl) {
    this._name = name;
    this._ctrl = ctrl;
    this.midi = spec.midi;
    this.type = spec.type;
    this.idx = spec.idx;

    var d = myCatnip._bindingDefaults();
    for (var k in d) {
        if (d.hasOwnProperty(k)) this[k] = d[k];
    }
    // Pots want soft-takeover on; buttons don't.
    if (spec.type === 'knob' || spec.type === 'fader') {
        this.softTakeover = true;
    }

    // Session-scoped — survive _reset.
    this._normalized = undefined;
    this._bits = (spec.bits === 14) ? 14 : 7;
    this._ledObservers = [];
    this._togglePressActive = false;
    this._lastOutKeyValue = undefined;
    this._lastCoValue = undefined;

    // Physical-button transaction. Persists across _reset and
    // across rebinds (as "orphaned"). Set on physical press,
    // dispatched on physical release.
    this._transaction = {
        active: false,
        orphaned: false,
        group: undefined,
        inKey: undefined,
        func: undefined,
        funcArgs: [],
        buttonMode: 'toggle'
    };
};

myCatnip.Binding.prototype._scaleValue = function(v) {
    if (this._bits === 14) {
        return (v > 8191) ? (v - 1) / 16382 : v / 16384;
    }
    if (v > 63) return (v - 1) / 126;
    return v / 128;
};

myCatnip.Binding.prototype._isShuttingDown = function() {
    return this._ctrl._shuttingDown === true;
};

myCatnip.Binding.prototype._isNoteOn = function() {
    return (this.midi[0] & 0xF0) === 0x90;
};

// Resolve the channel a compiled scheme's beat block applies to.
// Returns undefined for schemed without a beat block.
myCatnip.Binding.prototype._chFor = function(compiled) {
    if (!compiled || !compiled.beat) return undefined;
    return this._ctrl._resolveDeckRef(compiled.beat.deck);
};

// ============================================================
// TRANSACTION
// ============================================================
myCatnip.Binding.prototype._captureTransaction = function() {
    var t = this._transaction;
    t.active = true;
    t.orphaned = false;
    t.group = this.group;
    t.inKey = this.inKey;
    t.func = this._func;
    t.funcArgs = (this._funcArgs || []).slice();
    t.buttonMode = this.buttonMode;
};

myCatnip.Binding.prototype._dispatchCapturedRelease = function() {
    var t = this._transaction;
    var saved = this._captureCurrentSurface();
    try {
        this._installSurface(t);
        if (t.func) {
            t.func.call(this, t.funcArgs, undefined, undefined, 0, undefined);
        } else {
            this._defaultInput(0, undefined);
        }
    } catch (e) {
        myCatnip._warnOnce('txReleaseThrow:' + this._name,
            'captured release threw on ' + this._name + ': ' +
            (e && e.message ? e.message : e));
    } finally {
        this._installSurface(saved);
    }
};

myCatnip.Binding.prototype._captureCurrentSurface = function() {
    return {
        group:      this.group,
        inKey:      this.inKey,
        func:       this._func,
        funcArgs:   this._funcArgs,
        buttonMode: this.buttonMode
    };
};

myCatnip.Binding.prototype._installSurface = function(s) {
    this.group      = s.group;
    this.inKey      = s.inKey;
    this._func      = s.func;
    this._funcArgs  = s.funcArgs;
    this.buttonMode = s.buttonMode;
};

// ============================================================
// INPUT — physical event dispatch
// ============================================================
myCatnip.Binding.prototype.input = function(ch, cc, v, s) {
    if (this._isShuttingDown()) return;
    if (this._ctrl._onInput) this._ctrl._onInput(this);

    this._readPhysicalInput(v);

    var isPush = (this.type === 'button' && this.buttonMode === 'push');
    var wasActive = this._transaction.active;

    this._maybeOpenTransaction(v, isPush);

    if (v === 0 && this._transaction.active) {
        this._dispatchCapturedRelease();
        this._transaction.active = false;
        this._ctrl._onBindingRelease(this._name);
        this._refreshObservers();
        return;
    }

    if (this._isBounce(v, isPush, wasActive)) return;

    this._dispatchInput(ch, cc, v, s);
    this._postInputRefresh();
};

myCatnip.Binding.prototype._readPhysicalInput = function(v) {
    if (this.type === 'knob' || this.type === 'fader') {
        this._normalized = this._scaleValue(v);
    }
    if (this.type === 'button' && v === 0) {
        this._togglePressActive = false;
    }
};

myCatnip.Binding.prototype._maybeOpenTransaction = function(v, isPush) {
    if (v > 0 && isPush && !this._transaction.active) {
        this._captureTransaction();
        this._ctrl._onBindingPress(this._name);
    }
};

myCatnip.Binding.prototype._isBounce = function(v, isPush, wasActive) {
    if (v > 0 && isPush && wasActive) return true;
    if (this.type === 'button' && !isPush) {
        if (v > 0) {
            if (this._togglePressActive) return true;
            if (this._transaction.active) return true;
            this._togglePressActive = true;
        }
    }
    return false;
};

myCatnip.Binding.prototype._dispatchInput = function(ch, cc, v, s) {
    try {
        var dispatchFn   = this._transaction.active
            ? this._transaction.func
            : this._func;
        var dispatchArgs = this._transaction.active
            ? this._transaction.funcArgs
            : this._funcArgs;
        if (dispatchFn) dispatchFn.call(this, dispatchArgs, ch, cc, v, s);
        else            this._defaultInput(v, s);
    } catch (e) {
        myCatnip._warnOnce('inputThrow:' + this._name,
            'binding func threw on ' + this._name + ': ' +
            (e && e.message ? e.message : e));
    }
};

myCatnip.Binding.prototype._postInputRefresh = function() {
    if ((this.type === 'knob' || this.type === 'fader') &&
        this.group && this.inKey) {
        try { this._lastCoValue = engine.getParameter(this.group, this.inKey); }
        catch (e) { this._lastCoValue = undefined; }
    }
    this._refreshObservers();
};

myCatnip.Binding.prototype._defaultInput = function(v, s) {
    if (!this.group || !this.inKey) return;
    if (this.type === 'button') {
        if (this.buttonMode === 'push') {
            engine.setValue(this.group, this.inKey, v > 0 ? 1 : 0);
        } else if (v > 0) {
            var cur = engine.getValue(this.group, this.inKey);
            engine.setValue(this.group, this.inKey, cur ? 0 : 1);
        }
    } else if (this.type === 'knob' || this.type === 'fader') {
        engine.setParameter(this.group, this.inKey,
            this._applyValueCurve(this._normalized));
    }
};

myCatnip.Binding.prototype._applyValueCurve = function(n) {
    var c = this._valueCurve;
    if (!c || c === 1) return n;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return Math.pow(n, c);
};

myCatnip.Binding.prototype.addObserver = function(led) {
    if (this._ledObservers.indexOf(led) === -1) this._ledObservers.push(led);
};

myCatnip.Binding.prototype.removeObserver = function(led) {
    var i = this._ledObservers.indexOf(led);
    if (i >= 0) this._ledObservers.splice(i, 1);
};

myCatnip.Binding.prototype._refreshObservers = function() {
    for (var i = 0; i < this._ledObservers.length; i++) {
        var obs = this._ledObservers[i];
        try {
            obs._refresh();
        } catch (e) {
            myCatnip._warnOnce('obsRefreshThrow:' + obs._name,
                'observer repaint threw on ' + obs._name + ': ' +
                (e && e.message ? e.message : e));
        }
    }
};

myCatnip.Binding.prototype._reset = function() {
    this._ctrl._detachBeatLed(this);

    if (this._valueConn) { this._valueConn.disconnect(); }
    for (var i = 0; i < this._conns.length; i++) {
        if (this._conns[i]) this._conns[i].disconnect();
    }
    if (this._csFromStateConn) { this._csFromStateConn.disconnect(); }
    if (this._csKnob) { this._csKnob.removeObserver(this); }
    if (this._shutdownHoldTimer) {
        engine.stopTimer(this._shutdownHoldTimer);
    }

    // _transaction is session-scoped — not wiped here.
    var d = myCatnip._bindingDefaults();
    for (var k in d) {
        if (d.hasOwnProperty(k)) this[k] = d[k];
    }
};

myCatnip.Binding.prototype._armOwnConn = function() {
    if (this._valueConn) { this._valueConn.disconnect(); this._valueConn = null; }
    if (this.group === undefined || this.inKey === undefined) return;
    var self = this;
    var isPot = (this.type === 'knob' || this.type === 'fader');
    this._valueConn = engine.makeConnection(this.group, this.inKey, function() {
        if (isPot) {
            try { self._lastCoValue = engine.getParameter(self.group, self.inKey); }
            catch (e) { self._lastCoValue = undefined; }
        }
        self._refreshObservers();
    });
    if (isPot) {
        try { this._lastCoValue = engine.getParameter(this.group, this.inKey); }
        catch (e) { this._lastCoValue = undefined; }
    }
};

// sendLED delegates to hw.send after perception. The idx / noLED /
// shutdown gates live here so every send path goes through them.
myCatnip.Binding.prototype._send = function(r, g, b, hw, perceptionOverride) {
    if (this.idx < 0) return;
    if (this._noLED) return;
    this._ctrl.sendLED(this.idx, r, g, b, hw, perceptionOverride);
};

// ============================================================
// ON-STATE DISPATCH
// ============================================================
myCatnip.Binding.prototype._isOn = function() {
    if (this._csOn !== null && this._csOn !== undefined) {
        if (this._csOn === true)  return 1;
        if (this._csOn === false) return 0;
        return this._evalCsOn(this._csOn);
    }
    if (this.group && this.outKey) {
        if (this._lastOutKeyValue !== undefined) {
            return this._lastOutKeyValue > 0 ? 1 : 0;
        }
        return engine.getValue(this.group, this.outKey) > 0 ? 1 : 0;
    }
    return 0;
};

myCatnip.Binding.prototype._evalCsOn = function(s) {
    if (s.patchActive !== undefined) return this._evalPatchActive(s.patchActive);

    var v;
    if (s.co !== undefined)         v = this._evalOnCoValue(s);
    else if (s.state !== undefined) v = this._evalOnStateValue(s);
    else                            v = undefined;

    return this._matchOnValue(s, v);
};

myCatnip.Binding.prototype._evalPatchActive = function(patchActive) {
    if (!Array.isArray(patchActive)) {
        return this._ctrl._patchActive(patchActive) ? 1 : 0;
    }
    for (var i = 0; i < patchActive.length; i++) {
        if (this._ctrl._patchActive(patchActive[i])) return 1;
    }
    return 0;
};

myCatnip.Binding.prototype._evalOnCoValue = function(s) {
    if (s.group === undefined) return undefined;
    if (s.cachedValue !== undefined) return s.cachedValue;
    return engine.getValue(s.group, s.co);
};

myCatnip.Binding.prototype._evalOnStateValue = function(s) {
    var v = myCatnip.readPath(this._ctrl, s.state);
    if (s.equals === undefined && s.contains === undefined) {
        var truthyByConstruction =
            (typeof v === 'number' && v > 0) ||
            (typeof v === 'string' && v.length > 0);
        if (truthyByConstruction) {
            myCatnip._warnOnce('csOnTruthyState:' + this._name,
                'colorScheme.on.state "' + s.state + '" on ' + this._name +
                ' resolves to a value (' + JSON.stringify(v) + ')' +
                ' that is truthy by construction with no equals — the LED' +
                ' will always be on. Add equals: V for a slot / mode comparison.');
        }
    }
    return v;
};

myCatnip.Binding.prototype._matchOnValue = function(s, v) {
    if (s.equals !== undefined) return (v === s.equals) ? 1 : 0;
    if (s.contains !== undefined) {
        if (Array.isArray(v)) return (v.indexOf(s.contains) !== -1) ? 1 : 0;
        if (typeof v === 'string') return (v.indexOf(s.contains) !== -1) ? 1 : 0;
        return 0;
    }
    return v ? 1 : 0;
};

// ============================================================
// REFRESH / RENDER
// ============================================================
myCatnip.Binding.prototype._refresh = function() {
    if (this.idx < 0) return;
    if (this._noLED) return;
    if (this._isShuttingDown()) return;

    try {
        if (this._csActive) {
            this._refreshColorScheme();
            return;
        }
        this._renderOutKey();
    } catch (e) {
        myCatnip._warnOnce('refreshThrow:' + this._name,
            'refresh threw on ' + this._name + ': ' +
            (e && e.message ? e.message : e));
    }
};

myCatnip.Binding.prototype._renderOutKey = function() {
    if (!this.group || !this.outKey) return;
    var v = engine.getValue(this.group, this.outKey) > 0;
    this._send(v ? 127 : 0, v ? 127 : 0, v ? 127 : 0, v ? 127 : 0);
};

// ============================================================
// COLOUR SEND
// ============================================================
myCatnip.Binding.prototype._sendColor = function(entry, isOn, perceptionOverride) {
    if (!entry) { this._send(0, 0, 0, 0, perceptionOverride); return; }
    var rgb = entry.rgb, type = entry.type || 'rgb';
    if (type === 'mixxx') {
        if (!isOn) { this._send(0, 0, 0, 0, perceptionOverride); return; }
        rgb = this._resolveMixxxColor();
        if (!rgb) { this._send(0, 0, 0, 0, perceptionOverride); return; }
    }
    var hw = isOn ? entry.brightness
                  : (entry.brightnessOff !== undefined && entry.brightnessOff !== null
                     ? entry.brightnessOff : entry.brightness);
    if (!rgb) { this._send(0, 0, 0, 0, perceptionOverride); return; }
    this._send(rgb[0], rgb[1], rgb[2], hw, perceptionOverride);
};

myCatnip.Binding.prototype._resolveMixxxColor = function() {
    if (!this._hotcueColorCO) return null;
    if (!this.group) return null;
    var mx = this._cachedHotcueColor;
    if (mx === undefined) {
        try { mx = engine.getValue(this.group, this._hotcueColorCO); }
        catch (e) { return null; }
    }
    return myCatnip.mapMixxxColor(mx, this._ctrl);
};

myCatnip.Binding.prototype._sendSampled = function(ramp, t, compiled, isOn, skipBeat, perceptionOverride) {
    var entry = this._ctrl._sampleRamp(ramp, t, compiled, isOn, skipBeat, perceptionOverride);
    if (entry === myCatnip.BEAT_HOLD) return;
    this._sendColor(entry, isOn, perceptionOverride);
};

myCatnip.Binding.prototype._beatStateFor = function(compiled) {
    if (!compiled || !compiled.beat) return null;
    var st = this._ctrl._deckStateFor(compiled);
    if (!st || !st.hasBeat) return null;
    return st;
};

myCatnip.Binding.prototype._isBeatOffPhase = function(compiled) {
    var st = this._beatStateFor(compiled);
    if (!st) return false;
    var mode = st.playing ? myCatnip.BEAT_PLAYING_MODE : myCatnip.BEAT_PAUSED_MODE;
    if (mode === 'solid') return false;
    if (mode === 'off')   return true;
    return !st.active;
};

myCatnip.Binding.prototype._renderStatic = function(scheme, isOn, perceptionOverride) {
    var ramp = isOn ? scheme.on : scheme.off;
    if (!ramp || ramp.length === 0) { this._send(0, 0, 0, 0, perceptionOverride); return; }
    var entry = ramp[0].color;
    var ch = this._chFor(scheme);
    entry = this._applyBeatStatic(entry, scheme, isOn, ch);
    if (entry === myCatnip.BEAT_HOLD) return;
    this._sendColor(entry, isOn, perceptionOverride);
};

myCatnip.Binding.prototype._renderCoMatch = function(knob, scheme, isOn, physical, perceptionOverride) {
    if (!knob.group || !knob.inKey) return false;
    var steer = myCatnip.coMatchSample(scheme, knob.group, knob.inKey,
                                      physical, isOn, knob._lastCoValue);
    if (!steer) return false;
    this._sendSampled(steer.ramp, steer.t, scheme.co, isOn, true, perceptionOverride);
    return true;
};

myCatnip.Binding.prototype._renderMarker = function(scheme, isOn, devDir, perceptionOverride) {
    if (!myCatnip.markerHit(scheme, devDir)) return false;
    var ch = this._chFor(scheme);
    var entry = this._applyBeatStatic(scheme.marker, scheme, isOn, ch);
    if (entry === myCatnip.BEAT_HOLD) return true;
    this._sendColor(entry, isOn, perceptionOverride);
    return true;
};

// Boot-white fallback for deviation LEDs whose knob has never
// reported. Shared object — _sendColor reads indices only, no
// mutation.
var BOOT_WHITE_ENTRY = { rgb: [127, 127, 127], brightness: 127, brightnessOff: 127 };

myCatnip.Binding.prototype._renderDeviation = function(scheme, isOn, perceptionOverride) {
    var knob = this._csKnob;
    if (!knob || knob._normalized === undefined) {
        this._sendColor(BOOT_WHITE_ENTRY, isOn, perceptionOverride);
        return;
    }
    var physical = knob._normalized;
    if (this._renderCoMatch(knob, scheme, isOn, physical, perceptionOverride)) return;

    var dev = (physical - 0.5) * 2;
    var devDir = scheme.reverse ? -dev : dev;
    if (this._renderMarker(scheme, isOn, devDir, perceptionOverride)) return;

    var t = (devDir + 1) / 2;
    var ramp = isOn ? scheme.on : scheme.off;
    this._sendSampled(ramp, t, scheme, isOn, false, perceptionOverride);
};

// ============================================================
// SCHEME EVALUATION
// ============================================================
myCatnip.Binding.prototype._evaluateScheme = function() {
    var scheme = this._csScheme;
    if (this._csSchemeFn) {
        var ref = this._csSchemeFn();
        if (ref !== undefined && ref !== null) {
            if (ref !== this._csSchemeMemo) {
                if (this._sameSchemeValue(ref)) {
                    // Fresh object, value-equal to memo — warn once,
                    // reuse the compiled memo, no recompile.
                    myCatnip._warnOnce('csSchemeFresh:' + this._name,
                        'colorScheme scheme function on ' + this._name +
                        ' returns a fresh object/array each call — LED ' +
                        'recompiles every render. Wrap with ' +
                        'myCatnip.builders.composeScheme or hoist the value.');
                } else {
                    this._csSchemeMemo = ref;
                    this._csCompiledMemo = this._ctrl._resolveSchemeRef(ref);
                }
            }
            if (this._csCompiledMemo) scheme = this._csCompiledMemo;
        }
    }
    return scheme;
};

myCatnip.Binding.prototype._sameSchemeValue = function(ref) {
    var memo = this._csSchemeMemo;
    if (memo === null || memo === undefined) return false;
    if (typeof ref !== 'object' || typeof memo !== 'object') return false;
    return myCatnip._stableStringify(ref) === myCatnip._stableStringify(memo);
};

myCatnip.Binding.prototype._warnIfFreshScheme = function(ref) {
    var key = 'csSchemeFresh:' + this._name;
    if (myCatnip._warned[key]) return;

    var memo = this._csSchemeMemo;
    if (ref === null || ref === undefined) return;
    if (typeof ref !== 'object') return;
    if (memo === null || memo === undefined || typeof memo !== 'object') return;

    var a = myCatnip._stableStringify(ref);
    var b = myCatnip._stableStringify(memo);
    if (a !== b) return;
    myCatnip._warnOnce(key,
        'colorScheme scheme function on ' + this._name +
        ' returns a fresh object/array each call — LED ' +
        'recompiles every render. Wrap with ' +
        'myCatnip.builders.composeScheme or hoist the value.');
};

myCatnip.Binding.prototype._refreshColorScheme = function() {
    if (this._csFailed) { this._send(0, 0, 0, 0); return; }

    var logicalOn = this._isOn();
    var scheme = this._evaluateScheme();
    if (!scheme) {
        if (this._csSchemeFn) {
            myCatnip._warnOnce('csDarkFromFn:' + this._name,
                'colorScheme scheme function on ' + this._name +
                ' returned null/undefined and no base scheme is set — LED stays dark.');
        }
        this._send(0, 0, 0, 0);
        return;
    }

    var beatOffPhase = this._isBeatOffPhase(scheme);
    if (beatOffPhase && !logicalOn) { this._send(0, 0, 0, 0); return; }
    var isOn = (logicalOn && !beatOffPhase) ? 1 : 0;

    // Scheme-level perception override. null = use HW default;
    // false = bypass; object = { mix, brightness } partial.
    var perceptionOverride = scheme.perception;

    if (this._csDeviation) this._renderDeviation(scheme, isOn, perceptionOverride);
    else                   this._renderStatic(scheme, isOn, perceptionOverride);
};

myCatnip.Binding.prototype._applyBeatStatic = function(entry, compiled, isOn, ch) {
    if (!isOn) return entry;
    var st = this._beatStateFor(compiled);
    if (!st) return entry;
    return myCatnip.applyBeat(entry, compiled.beat, st.count, ch);
};

// ============================================================
// SNAPSHOT TRANSFORM
// ============================================================
myCatnip._snapshotTransform = function(transform, v) {
    if (transform === 'isPot')  return (v === 'knob' || v === 'fader');
    if (transform === 'truthy') return !!v;
    return v;
};

myCatnip._auditSnapshotFields = function() {
    if (!myCatnip._debugPrintsOn) return;
    var defaults = myCatnip._bindingDefaults();
    var sources = {};
    for (var i = 0; i < myCatnip._SNAPSHOT_FIELDS.length; i++) {
        sources[myCatnip._SNAPSHOT_FIELDS[i][0]] = true;
    }
    for (var k in defaults) {
        if (!defaults.hasOwnProperty(k)) continue;
        if (sources[k]) continue;
        if (myCatnip._SNAPSHOT_IGNORED.indexOf(k) !== -1) continue;
        print('[myCatnip] reset-able Binding field "' + k +
              '" not classified for _snapshotBinding');
    }
};

