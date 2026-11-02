// myCatnip-lib-controller-render.js — pacer, calibration math,
// ramp sampling, beatjump gate.
//
// Loaded after lib-controller-beat.js. Extends Controller.prototype.
//
// The sysex write path (frame construction, dedupe, pacing) and
// the blank sweeps live in the hardware descriptor (hw.writeLED,
// hw.blank). This file keeps only the framework-side dispatch
// (sendLED's shutdown/idx gates), the pacer accessor that hardware
// uses for rate-limited output, and the calibration / emit / ramp
// math that is hardware-agnostic.

'use strict';

if (typeof myCatnip === 'undefined') {
    throw new Error('Xone K3: myCatnip-lib-controller-render.js — myCatnip-lib-core.js must load first');
}
if (typeof myCatnip._requireLoad !== 'function') {
    throw new Error('Xone K3: myCatnip-lib-controller-render.js — myCatnip-lib-core.js must load first');
}
myCatnip._requireLoad('myCatnip-lib-controller-render.js',
    ['Controller', 'HW_K3', 'Pacing', 'TIMING',
     'sampleT', 'sampleSegs', 'applyBeat', 'BEAT_HOLD', 'scaleTarget']);

(function() {
    // Per-boot counter for segments-array ids. Cleared in _bootWith.
    myCatnip._segsCacheCounter = 0;

    // ============================================================
    // LED WRITE + CALIBRATION
    // ============================================================
    // Shared 3-element scratch for _wbRGB / _channelEmit. Every
    // caller unpacks indices immediately and discards the array;
    // none holds it past the current call. No re-entrancy between
    // these two functions.
    var _WB_SCRATCH = [0, 0, 0];

    myCatnip.Controller.prototype._wbRGB = function(r, g, b) {
        if (!this.wbActive) {
            _WB_SCRATCH[0] = r; _WB_SCRATCH[1] = g; _WB_SCRATCH[2] = b;
            return _WB_SCRATCH;
        }
        var wb = this.wbGain;
        if (!wb || wb.length < 3) {
            _WB_SCRATCH[0] = r; _WB_SCRATCH[1] = g; _WB_SCRATCH[2] = b;
            return _WB_SCRATCH;
        }
        _WB_SCRATCH[0] = Math.max(0, Math.min(127, Math.round(r * wb[0])));
        _WB_SCRATCH[1] = Math.max(0, Math.min(127, Math.round(g * wb[1])));
        _WB_SCRATCH[2] = Math.max(0, Math.min(127, Math.round(b * wb[2])));
        return _WB_SCRATCH;
    };

    // ============================================================
    // PACING
    // ============================================================
    // Named, lazily-created rate-limited output queues. The sysex
    // RGB path uses 'led'; hardware-specific send functions live in
    // the hardware descriptor and enqueue into ctrl.pacer('led').
    //
    // Framework owns the pacer map. Hardware supplies the transport
    // (opts.sendFn) and optional per-pacer throttle (opts.throttleMs).
    // A pacer created without a sendFn warns once and drops payloads
    // — no transport is silently guessed. The K3 hardware passes its
    // sysex sender; a plain-MIDI hardware would pass midi.sendShortMsg
    // or use throttleMs <= 0 to bypass the queue.
    //
    // onDrop clears the cache slot for any frame lost to overflow,
    // so a future render with the same frame re-enqueues instead
    // of hitting a stale cache hit and silently dropping the LED.
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
            sendFn = function() {};  // no-op; drop payloads
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
    // Framework-side dispatch: shutdown gate, idx guard, delegate.
    // All transport selection (K2 vs sysex), white-balance
    // application, dedupe, and pacing now live in the hardware
    // descriptor. This method never sees a sysex byte or a note
    // number. Transport is whole-controller: ctrl.sysex.
    myCatnip.Controller.prototype.sendLED = function(idx, r, g, b, hw) {
        if (this._shuttingDown) return;
        if (idx < 0) return;
        this.hw.writeLED(this, idx, r, g, b, hw);
    };

    // Reset every output path and hand blanking to the hardware.
    // Pacers are cleared first so any frames from a previous
    // session are dropped; _ledCache is cleared so the hardware's
    // blank sweep re-populates it from zero (matching the old
    // behaviour where _blankSysexSweep went through _sendSysExLED
    // on an empty cache).
    myCatnip.Controller.prototype._blankLeds = function() {
        for (var name in this._pacers) this._pacers[name].clear();
        this._ledCache = {};
        this.hw.blank(this);
    };

    // Pulse a CO high then low. Duration is PULSE_CO_MS — the
    // compat alias on the main namespace, so tests that poke the
    // alias (and applyPacing overrides) both take effect. TIMING
    // stays canonical; applyPacing updates both.
    myCatnip.Controller.prototype._pulseCo = function(group, co) {
        engine.setValue(group, co, 1);
        engine.beginTimer(myCatnip.PULSE_CO_MS, function() {
            engine.setValue(group, co, 0);
        }, true);
    };

    // ============================================================
    // BEATJUMP GATE
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
    //
    // Reads myCatnip.BEATJUMP_GAP_MS (compat alias), not
    // myCatnip.TIMING.beatjumpGapMs — matches lib-controller-beat.js's
    // pattern for BEAT_STALL_MS / META_SETTLE_MS / BOOT_SETTLE_MS,
    // and keeps tests / external tooling that poke the alias in
    // working order. applyPacing refreshes both on hardware
    // overrides.
    myCatnip.Controller.prototype._beatjumpAllowed = function(group, loopOn) {
        var ch = this._channelOf(group);
        if (!ch) return true;
        if (loopOn === undefined) {
            loopOn = engine.getValue('[Channel' + ch + ']', 'loop_enabled') > 0;
        }
        var now = Date.now();
        if (loopOn) {
            var last = this._lastLoopTouchMs[ch];
            if (last && now - last < myCatnip.BEATJUMP_GAP_MS) {
                if (myCatnip._debugPrintsOn) {
                    print('[k3] beatjump gated: ' + (now - last) + 'ms / ' +
                          myCatnip.BEATJUMP_GAP_MS + 'ms');
                }
                return false;
            }
            this._lastLoopTouchMs[ch] = now;
        }
        return true;
    };

    // Record a loop-touching event on this group's channel.
    // Beatjump will gate against this timestamp when the channel
    // is in an active loop.
    myCatnip.Controller.prototype._touchLoop = function(group) {
        var ch = this._channelOf(group);
        if (ch) this._lastLoopTouchMs[ch] = Date.now();
    };

    // ============================================================
    // CALIBRATION MATH
    // ============================================================
    function _saturation(rgb) {
        var mx = Math.max(rgb[0], rgb[1], rgb[2]);
        if (mx <= 0) return 0;
        var mn = Math.min(rgb[0], rgb[1], rgb[2]);
        return (mx - mn) / mx;
    }

    // Monotonic [hw, lum] lookup. table is sorted by hw and has
    // no guaranteed spacing; the old code scanned linearly.
    // Binary search matches the previous first-match-wins semantics
    // exactly, including duplicate hw entries (first match wins,
    // via lower-bound on the [1..last] sub-slice — the original
    // loop's `hw <= table[i+1][0]` predicate).
    function _sampleTransfer(table, hw) {
        if (hw <= table[0][0]) return table[0][1];
        var last = table.length - 1;
        if (hw >= table[last][0]) return table[last][1];

        // Find first j in [1, last] with table[j][0] >= hw. That's
        // the j the original `for i; hw <= table[i+1][0]` loop
        // landed on. i = j - 1 is the interval's left endpoint.
        var lo = 1, hi = last;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (table[mid][0] >= hw) hi = mid;
            else lo = mid + 1;
        }
        var j = lo;
        var i = j - 1;
        var span = table[j][0] - table[i][0];
        if (span <= 0) return table[i][1];
        var t = (hw - table[i][0]) / span;
        return table[i][1] * (1 - t) + table[j][1] * t;
    }

    var _EMIT_SCRATCH = [0, 0, 0];

    myCatnip.Controller.prototype._channelEmit = function(rgb, hw) {
        var wbRgb = this._wbRGB(rgb[0], rgb[1], rgb[2]);
        var t = this._transfer, w = this.channelPerceptual;
        if (!t) {
            var lv = hw / 127;
            _EMIT_SCRATCH[0] = (wbRgb[0] / 127) * lv * w[0];
            _EMIT_SCRATCH[1] = (wbRgb[1] / 127) * lv * w[1];
            _EMIT_SCRATCH[2] = (wbRgb[2] / 127) * lv * w[2];
            return _EMIT_SCRATCH;
        }
        _EMIT_SCRATCH[0] = (wbRgb[0] / 127) * _sampleTransfer(t.r, hw) * w[0];
        _EMIT_SCRATCH[1] = (wbRgb[1] / 127) * _sampleTransfer(t.g, hw) * w[1];
        _EMIT_SCRATCH[2] = (wbRgb[2] / 127) * _sampleTransfer(t.b, hw) * w[2];
        return _EMIT_SCRATCH;
    };

    myCatnip.Controller.prototype._emitAt = function(rgb, hw) {
        var c = this._channelEmit(rgb, hw);
        var Y = c[0] + c[1] + c[2];
        if (Y <= 0) return 0;
        var P = (this.lumGamma === 1.0) ? Y : Math.pow(Y, this.lumGamma);
        return P * (1 + this.hkBoost * _saturation(rgb));
    };

    myCatnip.Controller.prototype._solveHw = function(rgb, hw, ramp, compiled) {
        if (!compiled.calibration) return hw;
        if (this.calibrationMode === 'off') return hw;
        if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) return hw;
        var target = this._flatTarget(ramp);
        if (target === null) return hw;
        target = myCatnip.scaleTarget(target, compiled.brightnessScale);
        return this._calibratedHw(rgb, target);
    };

    myCatnip.Controller.prototype._calibFingerprint = function() {
        return [
            this._calibCurveName,
            this.calibrationMode,
            this.wbActive ? 'on' : 'off',
            this.wbGain.join(','),
            this.channelPerceptual.join(','),
            this.hkBoost,
            this.lumGamma
        ].join('|');
    };

    myCatnip.Controller.prototype._flatTarget = function(segs) {
        if (!segs || segs.length === 0) return null;
        if (this.calibrationMode === 'off') return null;

        // Segments-array cache ids are boot-scoped. The arrays
        // themselves live in myCatnip._compiledCache, reset per boot.
        if (segs._cacheId === undefined) {
            segs._cacheId = ++myCatnip._segsCacheCounter;
        }
        var cache = this._flatCache;
        var entry = cache[segs._cacheId];
        var fingerprint = this._calibFingerprint();
        if (entry && entry.key === fingerprint) return entry.value;

        var value = this._minSegmentEmit(segs);
        if (this._flatCacheSize >= 1024) {
            // Evict one entry instead of clearing the cache.
            // Clear-all triggered a 1024-entry _minSegmentEmit
            // recompute burst on the next render. One-entry
            // eviction bounds the recompute to a single miss.
            // _cacheId keys are integer-like, so V8 yields them
            // in ascending order — this evicts the oldest entry.
            for (var ek in cache) { delete cache[ek]; break; }
            this._flatCacheSize--;
        }
        cache = this._flatCache;
        cache[segs._cacheId] = { key: fingerprint, value: value };
        this._flatCacheSize++;
        return value;
    };

    // The flat-target solve's minimum-luminance scan. Skips
    // black stops (0,0,0) — they can't be the flat target's
    // reference point.
    //
    // Null-rgb (mixxx) stops are skipped too — they have no
    // emission to measure. The caller (_flatTarget) is only
    // reached from _solveHw for full schemes (calibration: true);
    // _compileSingleColor sets calibration: false, so a single-
    // colour mixxx never hits this path, but a mixed ramp can.
    myCatnip.Controller.prototype._minSegmentEmit = function(segs) {
        var minEmit = Infinity;
        for (var i = 0; i < segs.length; i++) {
            var c = segs[i].color;
            if (!c || !c.rgb) continue;
            if (c.rgb[0] === 0 && c.rgb[1] === 0 && c.rgb[2] === 0) continue;
            var e = this._emitAt(c.rgb, c.brightness);
            if (e < minEmit) minEmit = e;
        }
        return isFinite(minEmit) ? minEmit : null;
    };

    myCatnip.Controller.prototype._calibratedHw = function(rgb, targetLum) {
        if (targetLum <= 0) return 0;
        var key = rgb[0] + ':' + rgb[1] + ':' + rgb[2] + ':' + targetLum.toFixed(6);
        var cached = this._hwCache[key];
        if (cached !== undefined) return cached;

        var value = this._bisectHw(rgb, targetLum);

        // Evict one entry instead of clearing the whole cache.
        // Clear-all triggered a 1024-entry recompute burst on the
        // next render — 1024 × 12 bisects, enough to drop a frame.
        // One-entry eviction bounds the recompute to a single miss.
        // Key identity doesn't matter — any single eviction keeps
        // the size bound. Cache key is unchanged; solved values are
        // identical to before.
        if (this._hwCacheSize >= 1024) {
            for (var ek in this._hwCache) { delete this._hwCache[ek]; break; }
            this._hwCacheSize--;
        }
        this._hwCache[key] = value;
        this._hwCacheSize++;
        return value;
    };

    // Bisect hw over [0, 127] against targetLum. 12 iterations
    // resolves the interval to < 0.1 — one bit finer than the
    // 7-bit hw space, so the returned integer is stable under
    // small luminance perturbations.
    myCatnip.Controller.prototype._bisectHw = function(rgb, targetLum) {
        var lo = 0, hi = 127;
        for (var i = 0; i < 12; i++) {
            var mid = (lo + hi) / 2;
            if (this._emitAt(rgb, mid) < targetLum) lo = mid;
            else hi = mid;
        }
        return Math.round((lo + hi) / 2);
    };

    myCatnip.Controller.prototype._sampleRamp = function(ramp, t, compiled, isOn, skipBeat) {
        var tw = myCatnip.sampleT(compiled, t);
        var entry = myCatnip.sampleSegs(ramp, tw, compiled.interp);
        if (!entry) return null;
        if (isOn) {
            entry.brightness = this._solveHw(entry.rgb, entry.brightness, ramp, compiled);
        }
        if (!skipBeat && isOn && compiled.beat) {
            var st = this._deckStateFor(compiled);
            if (st && st.hasBeat) {
                var beat = myCatnip.applyBeat(entry, compiled.beat, st.count);
                if (beat === myCatnip.BEAT_HOLD) return myCatnip.BEAT_HOLD;
                entry = beat;
            }
        }
        return entry;
    };
})();