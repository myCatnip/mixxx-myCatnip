// lib/controller-render.mjs — pacer, sendLED (perception mix
// only), _sampleRamp (perception brightness solve), beatjump gate.
//
// Loaded after lib/controller-beat.mjs. Calibration math removed
// (perception owns it). sendLED applies mix; hw.send receives
// post-mix rgb. _solveHw is a thin delegator to
// myCatnip.perception.solveBrightness, threading mixMode +
// brightnessMode resolved from the scheme override + HW default.
//
// _beatjumpAllowed / _touchLoop use myCatnip.shared.lastLoopTouchMs
// (per-channel, shared across controllers on the same channel).


// ============================================================
// PACING
// ============================================================
myCatnip.Controller.prototype.pacer = function(name, opts) {
    if (this._pacers[name]) return this._pacers[name];
    opts = opts || {};

    var throttleMs = (typeof opts.throttleMs === 'number')
        ? opts.throttleMs
        : myCatnip.TIMING.pacingDefaultThrottleMs;

    var sendFn = opts.sendFn;
    if (typeof sendFn !== 'function') {
        myCatnip._warnOnce('pacerNoSendFn:' + name + ':' + this.label,
            'ctrl.pacer("' + name + '") on ' + this.label +
            ' created without opts.sendFn — payloads will be dropped. ' +
            'The hardware descriptor should pass a sendFn to ctrl.pacer().');
        sendFn = function() {};
    }

    var self = this;
    var p = new myCatnip.Pacing(name, throttleMs, sendFn);
    p.onDrop = function(idx) { delete self._ledCache[idx]; };
    this._pacers[name] = p;
    return p;
};

// ============================================================
// LED SEND
// ============================================================
// Framework-side dispatch: shutdown gate, idx guard, mix
// correction, delegate to hw.send. Brightness solve has already
// happened in _sampleRamp (via _solveHw).
//
// perceptionOverride precedence:
//   false           → bypass all mix
//   { mix: 'off' }  → skip mix only
//   { mix: 'correct' } → force mix on
//   null / undefined → controller's _perceptionMixActive + HW default
myCatnip.Controller.prototype.sendLED = function(idx, r, g, b, hw, perceptionOverride) {
    if (this._shuttingDown) return;
    if (idx < 0) return;

    var P = this.hw.PERCEPTION;
    var mixMode;
    if (perceptionOverride === false) {
        mixMode = 'off';
    } else if (perceptionOverride && typeof perceptionOverride === 'object' &&
               perceptionOverride.mix !== undefined) {
        mixMode = perceptionOverride.mix;
    } else if (this._perceptionMixActive === false) {
        mixMode = 'off';
    } else if (P && P.mode && P.mode.mix) {
        mixMode = P.mode.mix;
    } else {
        mixMode = 'off';
    }

    var rgb = [r, g, b];
    if (mixMode === 'correct') {
        myCatnip.perception.applyMix(rgb, this.hw, 'correct');
    }
    this.hw.send(this, idx, rgb, hw);
};

// ============================================================
// BLANK
// ============================================================
myCatnip.Controller.prototype._blankLeds = function() {
    for (var name in this._pacers) this._pacers[name].clear();
    this._ledCache = {};
    this.hw.blank(this);
};

// ============================================================
// PULSE
// ============================================================
myCatnip.Controller.prototype._pulseCo = function(group, co) {
    engine.setValue(group, co, 1);
    engine.beginTimer(myCatnip.PULSE_CO_MS, function() {
        engine.setValue(group, co, 0);
    }, true);
};

// ============================================================
// BEATJUMP GATE (per-channel via shared)
// ============================================================
myCatnip.Controller.prototype._beatjumpAllowed = function(group, loopOn) {
    var ch = this._channelOf(group);
    if (!ch) return true;
    if (loopOn === undefined) {
        loopOn = engine.getValue('[Channel' + ch + ']', 'loop_enabled') > 0;
    }
    var now = Date.now();
    if (loopOn) {
        var last = myCatnip.shared.lastLoopTouchMs[ch];
        if (last && now - last < myCatnip.BEATJUMP_GAP_MS) {
            if (myCatnip._debugPrintsOn) {
                print('[myCatnip] beatjump gated: ' + (now - last) + 'ms / ' +
                      myCatnip.BEATJUMP_GAP_MS + 'ms');
            }
            return false;
        }
        myCatnip.shared.lastLoopTouchMs[ch] = now;
    }
    return true;
};

myCatnip.Controller.prototype._touchLoop = function(group) {
    var ch = this._channelOf(group);
    if (ch) myCatnip.shared.lastLoopTouchMs[ch] = Date.now();
};

// ============================================================
// BRIGHTNESS SOLVE — delegator to perception
// ============================================================
// Resolves mixMode + brightnessMode from scheme override (or HW
// default), then calls perception.solveBrightness. Returns the
// hw byte. Called by _sampleRamp on every deviation/co-match
// frame. Static renders skip this — they pass brightness straight
// through, matching v2.0.0.
myCatnip.Controller.prototype._solveHw = function(rgb, brightness, ramp, compiled, perceptionOverride) {
    var P = this.hw.PERCEPTION;

    var perception = (perceptionOverride !== undefined)
        ? perceptionOverride
        : compiled.perception;

    var brightnessMode;
    if (perception === false) {
        brightnessMode = 'off';
    } else if (perception && typeof perception === 'object' &&
               perception.brightness !== undefined) {
        brightnessMode = perception.brightness;
    } else if (P && P.mode && P.mode.brightness) {
        brightnessMode = P.mode.brightness;
    } else {
        brightnessMode = 'off';
    }
    if (brightnessMode === 'off') return brightness;

    var mixMode;
    if (perception === false) {
        mixMode = 'off';
    } else if (perception && typeof perception === 'object' &&
               perception.mix !== undefined) {
        mixMode = perception.mix;
    } else if (this._perceptionMixActive === false) {
        mixMode = 'off';
    } else if (P && P.mode && P.mode.mix) {
        mixMode = P.mode.mix;
    } else {
        mixMode = 'off';
    }

    return myCatnip.perception.solveBrightness(
        this.hw, rgb, brightness, mixMode, brightnessMode, ramp);
};

// ============================================================
// RAMP SAMPLING
// ============================================================
myCatnip.Controller.prototype._sampleRamp = function(ramp, t, compiled, isOn, skipBeat, perceptionOverride) {
    var tw = myCatnip.sampleT(compiled, t);
    var entry = myCatnip.sampleSegs(ramp, tw, compiled.interp);
    if (!entry) return null;
    if (isOn) {
        entry.brightness = this._solveHw(
            entry.rgb, entry.brightness, ramp, compiled, perceptionOverride);
    }
    if (!skipBeat && isOn && compiled.beat) {
        var st = this._deckStateFor(compiled);
        if (st && st.hasBeat) {
            var ch = this._resolveDeckRef(compiled.beat.deck);
            var beat = myCatnip.applyBeat(entry, compiled.beat, st.count, ch);
            if (beat === myCatnip.BEAT_HOLD) return myCatnip.BEAT_HOLD;
            entry = beat;
        }
    }
    return entry;
};

