// xone-k3-lib-timing.js — timing constants and the Pacing queue
// used for rate-limited output (LED sysex, future transports).
//
// Loaded after lib-core.js, before lib-schemes.js. Hardware
// descriptors may override any entry via `hw.pacing = {...}`; the
// merge is done by XoneK3.applyPacing(), called from bootCat and
// _bootWith.
//
// Why these live together: every constant here is measured against
// Mixxx's CO-tree behaviour, MIDI output rate, or engine timing —
// none is hardware-specific. The Pacing queue is likewise
// transport-agnostic: it takes a send function and rate-limits it.
// K3's sysex writer is one such send function; plain-MIDI hardware
// can pass throttleMs <= 0 to bypass the queue entirely.

'use strict';

if (typeof XoneK3 === 'undefined') {
    throw new Error('Xone K3: xone-k3-lib-timing.js — xone-k3-lib-core.js must load first');
}
if (typeof XoneK3._requireLoad !== 'function') {
    throw new Error('Xone K3: xone-k3-lib-timing.js — xone-k3-lib-core.js must load first');
}
XoneK3._requireLoad('xone-k3-lib-timing.js', []);

(function() {
    // ============================================================
    // TIMING
    // ============================================================
    XoneK3.TIMING = {
        // Output pacing. Canonical name is pacingDefaultThrottleMs;
        // sysexThrottleMs is a getter/setter alias installed below
        // for backward compatibility with existing hw.pacing
        // overrides and external tooling.
        pacingDefaultThrottleMs:  10,
        sysexThrottleMs:          10,  // mirror, replaced by accessor
        beatRepaintThrottleMs:    30,
        pacingMaxQueue:          128,

        // Engine pulse width
        pulseCoMs:                30,

        // Engine gate windows
        beatjumpGapMs:           130,
        beatStallMs:            1500,
        metaSettleMs:            300,
        bootSettleMs:            100,
        bootMaxAttempts:           5,

        // Epsilon pair. Invariant: takeover must strictly exceed
        // co-match, so LED "matched" always implies control is
        // live. The extra half-band on takeover is a harmless
        // false-negative. If a hardware override breaks this,
        // applyPacing restores both to the defaults.
        coMatchEpsilon:         1/127,
        takeoverEpsilon:        2/127,
    };

    // Alias: pacingDefaultThrottleMs ↔ sysexThrottleMs. Read from
    // either name, write through either name — both hit the same
    // storage (sysexThrottleMs). The accessor is installed on the
    // TIMING object itself so Object.assign / hw.pacing overrides
    // that write either name Just Work.
    Object.defineProperty(XoneK3.TIMING, 'pacingDefaultThrottleMs', {
        get: function() { return this.sysexThrottleMs; },
        set: function(v) { this.sysexThrottleMs = v; },
        enumerable: true,
        configurable: true
    });

    // Immutable snapshot of the framework defaults. applyPacing
    // resets TIMING from this before applying overrides — without
    // it, a preset with custom pacing would poison TIMING for any
    // subsequent preset that uses defaults.
    //
    // Both throttle keys are captured as plain values (10, 10).
    // applyPacing's reset loop writes both; whichever it visits
    // last, the alias makes them agree.
    XoneK3._TIMING_DEFAULTS = Object.assign({}, XoneK3.TIMING);

    // Test-only override hook. When set, applyPacing merges these
    // values into TIMING at highest priority (after defaults and
    // after hw.pacing overrides). Tests use this to force zero-
    // throttle synchronous LED output across every boot path —
    // bootCat, bootLab, _bootWith all reset TIMING from
    // _TIMING_DEFAULTS, which would otherwise clobber the test's
    // 0-throttle TIMING write. Production code never touches this;
    // see test/run.js resetGlobals.
    XoneK3._pacingTestOverride = null;

    // Compat re-exports for existing read sites. Framework code
    // continues to read XoneK3.SYSEX_THROTTLE_MS etc. unchanged.
    // A future cleanup pass can migrate reads to
    // XoneK3.TIMING.pacingDefaultThrottleMs and delete
    // XoneK3.SYSEX_THROTTLE_MS.
    XoneK3.PACING_DEFAULT_THROTTLE_MS = XoneK3.TIMING.pacingDefaultThrottleMs;
    XoneK3.SYSEX_THROTTLE_MS          = XoneK3.TIMING.sysexThrottleMs;
    XoneK3.BEAT_REPAINT_THROTTLE_MS   = XoneK3.TIMING.beatRepaintThrottleMs;
    XoneK3.PULSE_CO_MS                = XoneK3.TIMING.pulseCoMs;
    XoneK3.BEATJUMP_GAP_MS            = XoneK3.TIMING.beatjumpGapMs;
    XoneK3.BEAT_STALL_MS              = XoneK3.TIMING.beatStallMs;
    XoneK3.META_SETTLE_MS             = XoneK3.TIMING.metaSettleMs;
    XoneK3.BOOT_SETTLE_MS             = XoneK3.TIMING.bootSettleMs;
    XoneK3.BOOT_MAX_ATTEMPTS          = XoneK3.TIMING.bootMaxAttempts;
    XoneK3.CO_MATCH_EPSILON           = XoneK3.TIMING.coMatchEpsilon;
    XoneK3.TAKEOVER_EPSILON           = XoneK3.TIMING.takeoverEpsilon;

    function _refreshAliases() {
        XoneK3.PACING_DEFAULT_THROTTLE_MS = XoneK3.TIMING.pacingDefaultThrottleMs;
        XoneK3.SYSEX_THROTTLE_MS          = XoneK3.TIMING.sysexThrottleMs;
        XoneK3.BEAT_REPAINT_THROTTLE_MS   = XoneK3.TIMING.beatRepaintThrottleMs;
        XoneK3.PULSE_CO_MS                = XoneK3.TIMING.pulseCoMs;
        XoneK3.BEATJUMP_GAP_MS            = XoneK3.TIMING.beatjumpGapMs;
        XoneK3.BEAT_STALL_MS              = XoneK3.TIMING.beatStallMs;
        XoneK3.META_SETTLE_MS             = XoneK3.TIMING.metaSettleMs;
        XoneK3.BOOT_SETTLE_MS             = XoneK3.TIMING.bootSettleMs;
        XoneK3.BOOT_MAX_ATTEMPTS          = XoneK3.TIMING.bootMaxAttempts;
        XoneK3.CO_MATCH_EPSILON           = XoneK3.TIMING.coMatchEpsilon;
        XoneK3.TAKEOVER_EPSILON           = XoneK3.TIMING.takeoverEpsilon;
    }

    // Merge a hardware's pacing overrides. Order of precedence:
    //   1. _TIMING_DEFAULTS (framework defaults)
    //   2. overrides (hw.pacing)
    //   3. _pacingTestOverride (test-only, highest priority)
    // Resets from defaults first, so calls are idempotent and
    // nothing leaks across preset reloads. Enforces the epsilon
    // invariant post-merge — a bad override warns once and
    // restores both epsilons, rather than let deviation LEDs
    // silently misreport "matched" when control isn't live.
    XoneK3.applyPacing = function(overrides) {
        // 1. Reset from defaults
        var D = XoneK3._TIMING_DEFAULTS;
        for (var dk in D) {
            if (D.hasOwnProperty(dk)) XoneK3.TIMING[dk] = D[dk];
        }
        // 2. Hardware overrides
        if (overrides) {
            for (var k in overrides) {
                if (!overrides.hasOwnProperty(k)) continue;
                if (XoneK3.TIMING[k] === undefined) continue;
                XoneK3.TIMING[k] = overrides[k];
            }
        }
        // 3. Test override (highest priority)
        var T = XoneK3._pacingTestOverride;
        if (T) {
            for (var tk in T) {
                if (!T.hasOwnProperty(tk)) continue;
                if (XoneK3.TIMING[tk] === undefined) continue;
                XoneK3.TIMING[tk] = T[tk];
            }
        }
        // 4. Epsilon invariant
        if (XoneK3.TIMING.takeoverEpsilon <= XoneK3.TIMING.coMatchEpsilon) {
            XoneK3._warnOnce('pacingEpsInvariant',
                'TIMING.takeoverEpsilon must exceed TIMING.coMatchEpsilon — ' +
                'invariant broken after pacing override; restoring framework defaults');
            XoneK3.TIMING.coMatchEpsilon = XoneK3._TIMING_DEFAULTS.coMatchEpsilon;
            XoneK3.TIMING.takeoverEpsilon = XoneK3._TIMING_DEFAULTS.takeoverEpsilon;
        }
        // 5. Refresh compat aliases
        _refreshAliases();
    };

    // ============================================================
    // PACING QUEUE
    // ============================================================
    // Rate-limited output queue. Hardware writes LED frames via
    //   ctrl.pacer('<name>', { sendFn: fn, throttleMs: ms });
    //
    // - Enqueue is O(1) and replace-in-place: a second enqueue for
    //   the same key while the first is still queued keeps the
    //   original position but adopts the newer payload. The
    //   hardware doesn't need its own dedupe at this layer.
    //
    // - throttleMs <= 0 flushes immediately on enqueue and never
    //   holds a timer. Appropriate for hardware whose output is
    //   synchronous (plain-MIDI notes, K2 mode).
    //
    // - onDrop fires when the queue overflows pacingMaxQueue.
    //   Hardware registers a callback here to invalidate any
    //   per-frame cache slot for the dropped key, so a future
    //   render with the same payload re-enqueues instead of
    //   hitting a stale cache and silently losing the frame.
    XoneK3.Pacing = function(name, throttleMs, sendFn) {
        this.name = name;
        this.throttleMs = throttleMs;
        this.sendFn = sendFn;
        this.queue = [];
        this.map = {};
        this.timer = null;
        this.onDrop = null;
    };

    XoneK3.Pacing.prototype = {
        enqueue: function(key, payload) {
            if (this.map[key] !== undefined) {
                this.map[key] = payload;
                return;
            }
            this.queue.push(key);
            this.map[key] = payload;
            if (this.queue.length > XoneK3.TIMING.pacingMaxQueue) {
                var dropped = this.queue.shift();
                delete this.map[dropped];
                if (this.onDrop) this.onDrop(dropped);
            }
        },

        start: function() {
            if (this.throttleMs <= 0) {
                this._flush();
                return;
            }
            if (this.timer) return;
            var self = this;
            this.timer = engine.beginTimer(
                Math.max(1, this.throttleMs),
                function() { self._tick(); },
                false);
        },

        _flush: function() {
            while (this.queue.length > 0) {
                var key = this.queue.shift();
                var payload = this.map[key];
                delete this.map[key];
                if (payload && this.sendFn) this.sendFn(payload);
            }
        },

        _tick: function() {
            if (this.queue.length === 0) { this._stop(); return; }
            var key = this.queue.shift();
            var payload = this.map[key];
            delete this.map[key];
            if (payload && this.sendFn) this.sendFn(payload);
            if (this.queue.length === 0) { this._stop(); }
        },

        _stop: function() {
            if (this.timer) {
                engine.stopTimer(this.timer);
                this.timer = null;
            }
        },

        clear: function() {
            this.queue = [];
            this.map = {};
            this._stop();
        },

        length: function() {
            return this.queue.length;
        }
    };
})();