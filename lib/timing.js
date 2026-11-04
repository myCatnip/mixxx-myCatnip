// lib/timing.js — TIMING constants and the Pacing queue.
//
// Loaded after lib/core.js, before lib/schemes.js.

'use strict';

// Every timing / pacing / epsilon constant used across the
// framework. Values are in ms unless noted. Grouped by concern:
//   pacing*    — Pacing queue throttle + max depth
//   sysex*     — hardware sysex transport throttle (K3 uses this)
//   beat*      — beat-pulse and beatjump-gate timings
//   meta*      — track metadata settle windows
//   boot*      — boot CO-tree settle polling
//   *_Epsilon  — dev/co-match thresholds (see below)
myCatnip.TIMING = {
    // Default throttle for ctrl.pacer() when opts.throttleMs
    // isn't given. Aliased to sysexThrottleMs (below) via a
    // getter — one knob for anything that can be throttled at
    // the transport layer.
    pacingDefaultThrottleMs:  10,

    // Sysex frame pacing. K3's drain timer fires every
    // SYSEX_THROTTLE_MS, sending at most one frame per tick.
    // 10 ms is enough headroom for the K3's sysex engine to
    // consume the previous frame without drops, and dense
    // enough that a full-surface repaint (128 LEDs) completes
    // in ~1.3 s.
    sysexThrottleMs:          10,

    // Throttle between beat-repaint writes. Beat LEDs sample
    // pulse phase at 30 ms — one repaint per throttled
    // playposition tick. At 128 BPM that's ~1 pulse edge every
    // 470 ms, so 30 ms is 15x oversampled (comfortably smooth
    // without flooding the wire). Also gates _onPlayposition's
    // throttle — the beat pulse and playhead scan share the
    // same throttle window.
    beatRepaintThrottleMs:    30,

    // Pacing queue depth cap. Any single pacer (typically
    // `led`) that queues more than this many distinct frames
    // drops the oldest. Combined with p.onDrop invalidating
    // _ledCache, drops don't leave stale cache entries that
    // would suppress the frame next render.
    pacingMaxQueue:          128,

    // Pulse width for _pulseCo — momentary COs (beatjump,
    // reloop, beatloop_activate) are held at 1 for this many
    // ms then released. 30 ms matches Mixxx's internal pulse
    // granularity; shorter risks dropouts on slow builds,
    // longer competes with user input timing.
    pulseCoMs:                30,

    // Beatjump gate. A beatjump is blocked if less than this many
    // ms have elapsed since the last loop-touching event on its
    // channel AND the channel is in an active loop. Loop-touching
    // events: beatjumps and loop-boundary changes. 130 ms is the
    // empirically confirmed safe margin (120 worked, 60 leaked).
    beatjumpGapMs:           130,

    // If beat_active has been silent for at least this long, the
    // beat-edge guard in _onPlayposition releases and the pulse
    // phase falls back to a position-derived read. See
    // INTERNALS §10.
    beatStallMs:            1500,

    // Milliseconds after the last metadata-relevant CO event
    // (track_loaded, track_samples, duration, file_bpm) during
    // which _trackMeta reads live but skips the cache write.
    // Mixxx doesn't guarantee ordering between these COs; the
    // window spans the last fire regardless of which one it was.
    metaSettleMs:            300,

    // Boot settle. After the initial catch-up at boot, if any
    // boot-relevant CO (track_loaded, play_indicator, loop_enabled,
    // rate_ratio, reverse) fires within BOOT_SETTLE_MS of the last
    // fire, another catch-up is scheduled. Stops the silent-stale
    // bug where a slow CO tree leaves _loadedState[ch] or
    // st.playing wrong until the next unrelated event.
    bootSettleMs:            100,

    // Cap on boot-settle retries. Prevents runaway reschedules
    // on a CO tree that never settles. Warn-once fires when
    // the cap is hit so a slow tree is diagnosable.
    bootMaxAttempts:           5,

    // Co-match deviation threshold. A deviation LED's physical
    // knob position is compared against the bound CO value; if
    // the difference is under this, the LED shows its static
    // ramp. Above, it samples the co-match ramp. 1/127 is one
    // hw byte — anything tighter would fire co-match on rounding
    // noise, looser would let visible offsets render as "matched".
    coMatchEpsilon:         1/127,

    // Soft-takeover bridge tolerance, strictly larger than
    // coMatchEpsilon: LED "matched" always implies control is
    // live. The extra half-band is a harmless false-negative.
    takeoverEpsilon:        2/127
};

Object.defineProperty(myCatnip.TIMING, 'pacingDefaultThrottleMs', {
    get: function() { return this.sysexThrottleMs; },
    set: function(v) { this.sysexThrottleMs = v; },
    enumerable: true, configurable: true
});

myCatnip._TIMING_DEFAULTS = Object.assign({}, myCatnip.TIMING);

// Test override layer. Populated by tests (myCatnip._pacingTestOverride
// = { ... }), never by runtime. Re-applied after every applyPacing
// so test settings survive a controller boot.
myCatnip._pacingTestOverride = null;

function _refreshAliases() {
    myCatnip.PACING_DEFAULT_THROTTLE_MS = myCatnip.TIMING.pacingDefaultThrottleMs;
    myCatnip.SYSEX_THROTTLE_MS          = myCatnip.TIMING.sysexThrottleMs;
    myCatnip.BEAT_REPAINT_THROTTLE_MS   = myCatnip.TIMING.beatRepaintThrottleMs;
    myCatnip.PULSE_CO_MS                = myCatnip.TIMING.pulseCoMs;
    myCatnip.BEATJUMP_GAP_MS            = myCatnip.TIMING.beatjumpGapMs;
    myCatnip.BEAT_STALL_MS              = myCatnip.TIMING.beatStallMs;
    myCatnip.META_SETTLE_MS             = myCatnip.TIMING.metaSettleMs;
    myCatnip.BOOT_SETTLE_MS             = myCatnip.TIMING.bootSettleMs;
    myCatnip.BOOT_MAX_ATTEMPTS          = myCatnip.TIMING.bootMaxAttempts;
    myCatnip.CO_MATCH_EPSILON           = myCatnip.TIMING.coMatchEpsilon;
    myCatnip.TAKEOVER_EPSILON           = myCatnip.TIMING.takeoverEpsilon;
}
_refreshAliases();

// Reset TIMING to defaults, then apply per-HW overrides
// (hw.pacing) and test overrides (myCatnip._pacingTestOverride)
// on top. Called at boot from _bootWith. Every controller boot
// re-applies, so hw.pacing is the runtime source of truth — a
// config that wants to change timings sets hw.pacing rather
// than mutating myCatnip.TIMING directly.
myCatnip.applyPacing = function(overrides) {
    var D = myCatnip._TIMING_DEFAULTS;
    for (var dk in D) if (D.hasOwnProperty(dk)) myCatnip.TIMING[dk] = D[dk];
    if (overrides) {
        for (var k in overrides) {
            if (!overrides.hasOwnProperty(k)) continue;
            if (myCatnip.TIMING[k] === undefined) continue;
            myCatnip.TIMING[k] = overrides[k];
        }
    }
    var T = myCatnip._pacingTestOverride;
    if (T) {
        for (var tk in T) {
            if (!T.hasOwnProperty(tk)) continue;
            if (myCatnip.TIMING[tk] === undefined) continue;
            myCatnip.TIMING[tk] = T[tk];
        }
    }
    // Invariant: LED "matched" (coMatchEpsilon) must be strict
    // subset of "control is live" (takeoverEpsilon). Restoring
    // defaults on violation avoids a stuck soft-takeover where
    // the LED says matched but the control isn't live.
    if (myCatnip.TIMING.takeoverEpsilon <= myCatnip.TIMING.coMatchEpsilon) {
        myCatnip._warnOnce('pacingEpsInvariant',
            'takeoverEpsilon must exceed coMatchEpsilon — restoring defaults');
        myCatnip.TIMING.coMatchEpsilon = myCatnip._TIMING_DEFAULTS.coMatchEpsilon;
        myCatnip.TIMING.takeoverEpsilon = myCatnip._TIMING_DEFAULTS.takeoverEpsilon;
    }
    _refreshAliases();
};

// Pacing queue. Replace-or-append by key — repeated enqueues of
// the same key update the payload in place (order preserved,
// fresher value). Fires one payload per throttle tick, stopping
// the timer when the queue empties. Drop-on-overflow goes to
// onDrop so the caller can invalidate its own cache entry.
myCatnip.Pacing = function(name, throttleMs, sendFn) {
    this.name = name;
    this.throttleMs = throttleMs;
    this.sendFn = sendFn;
    this.queue = [];
    this.map = {};
    this.timer = null;
    this.onDrop = null;
};

myCatnip.Pacing.prototype = {
    enqueue: function(key, payload) {
        if (this.map[key] !== undefined) { this.map[key] = payload; return; }
        this.queue.push(key);
        this.map[key] = payload;
        if (this.queue.length > myCatnip.TIMING.pacingMaxQueue) {
            var dropped = this.queue.shift();
            delete this.map[dropped];
            if (this.onDrop) this.onDrop(dropped);
        }
    },
    start: function() {
        if (this.throttleMs <= 0) { this._flush(); return; }
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
        if (this.queue.length === 0) this._stop();
    },
    _stop: function() {
        if (this.timer) { engine.stopTimer(this.timer); this.timer = null; }
    },
    clear: function() { this.queue = []; this.map = {}; this._stop(); },
    length: function() { return this.queue.length; }
};