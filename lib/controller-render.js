// lib/controller-render.js — pacer, sendLED (perception mix
// only), _sampleRamp (perception brightness solve), beatjump gate.
//
// Loaded after lib/controller-beat.js. Calibration math removed
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
    // Dropped frames must invalidate the _ledCache slot. Without
    // this, a queue-overrun drop would leave the slot populated
    // with the never-sent value; the next render with the same
    // frame would cache-hit and the LED would never see it.
    p.onDrop = function(idx) { delete self._ledCache[idx]; };
    this._pacers[name] = p;
    return p;
};

// ============================================================
// PERCEPTION MODE RESOLUTION
// ============================================================
// Single source of truth for perceptionOverride → mixMode /
// brightnessMode. Callers: sendLED, _solveHw, bakeScheme.
myCatnip.Controller.prototype._resolveMixMode = function(perception) {
    if (perception === false) return 'off';
    if (perception && typeof perception === 'object' &&
        perception.mix !== undefined) {
        return perception.mix;
    }
    if (this._perceptionMixActive === false) return 'off';
    var P = this.hw.PERCEPTION;
    if (P && P.mode && P.mode.mix) return P.mode.mix;
    return 'off';
};

myCatnip.Controller.prototype._resolveBrightnessMode = function(perception) {
    if (perception === false) return 'off';
    if (perception && typeof perception === 'object' &&
        perception.brightness !== undefined) {
        return perception.brightness;
    }
    var P = this.hw.PERCEPTION;
    if (P && P.mode && P.mode.brightness) return P.mode.brightness;
    return 'off';
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

    var mixMode = this._resolveMixMode(perceptionOverride);

    var rgb = [r, g, b];
    if (mixMode === 'correct') {
        myCatnip.perception.applyMix(rgb, this.hw, 'correct');
    }
    this.hw.send(this, idx, rgb, hw);
};

// ============================================================
// BLANK
// ============================================================
// Three-step blank:
//   1. Clear pacer queues — a stale queued frame arriving after
//      the blank would fight the blank sweep and win on the wire
//   2. Clear _ledCache — the "same as last" dedupe in hw.send
//      would otherwise suppress the blank for every idx whose
//      cached value already looks like the blank frame
//   3. Delegate to hw.blank — the hardware descriptor knows
//      whether to sweep short messages (K2 palette notes, Inpulse
//      pad/transport notes) or drain sysex frames, and in what
//      order. See hw/k3.js and hw/inpulse500.js.
//
// Shutdown polling (lib/controller-boot.js) uses
// hw.anyPendingWrites, not _pacers, so the descriptor's drain
// timer keeps running through the async-teardown window without
// a _shuttingDown bail — the trailing blank frames must reach
// the hardware.
myCatnip.Controller.prototype._blankLeds = function() {
    for (var name in this._pacers) this._pacers[name].clear();
    this._ledCache = {};
    this.hw.blank(this);
};

// ============================================================
// PULSE
// ============================================================
// Pulse a CO high then low. Duration is PULSE_CO_MS. Used by
// beatjump / reloop / beatloop-activate to fire momentary
// COs.
myCatnip.Controller.prototype._pulseCo = function(group, co) {
    engine.setValue(group, co, 1);
    engine.beginTimer(myCatnip.PULSE_CO_MS, function() {
        engine.setValue(group, co, 0);
    }, true);
};

// ============================================================
// BEATJUMP GATE (per-channel via shared)
// ============================================================
// A beatjump is gated on its channel's loop being active.
// Outside a loop: always allowed, no stamp. Inside a loop:
// blocked when less than BEATJUMP_GAP_MS has elapsed since
// the last loop-touching event on the same channel; on a
// pass, records the beatjump as the new "last touch" so two
// rapid in-loop beatjumps also gate each other.
//
// `loopOn` is an optional pass-through: encBeatjump already
// read the CO for its loop-only gate, so it passes the value
// here to skip a second `engine.getValue` (CO mutex) on the
// encoder spin path. beatjumpButton omits it and the gate
// reads fresh.
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

// Record a loop-touching event on this group's channel.
// Beatjump will gate against this timestamp when the channel
// is in an active loop.
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
    var perception = (perceptionOverride !== undefined)
        ? perceptionOverride
        : compiled.perception;

    var brightnessMode = this._resolveBrightnessMode(perception);
    if (brightnessMode === 'off') return brightness;

    var mixMode = this._resolveMixMode(perception);

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