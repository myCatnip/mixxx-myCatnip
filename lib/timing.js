// lib/timing.js — TIMING constants and the Pacing queue.
//
// Loaded after lib/core.js, before lib/schemes.js.

'use strict';

myCatnip.TIMING = {
    pacingDefaultThrottleMs:  10,
    sysexThrottleMs:          10,
    beatRepaintThrottleMs:    30,
    pacingMaxQueue:          128,
    pulseCoMs:                30,
    beatjumpGapMs:           130,
    beatStallMs:            1500,
    metaSettleMs:            300,
    bootSettleMs:            100,
    bootMaxAttempts:           5,
    coMatchEpsilon:         1/127,
    takeoverEpsilon:        2/127
};

Object.defineProperty(myCatnip.TIMING, 'pacingDefaultThrottleMs', {
    get: function() { return this.sysexThrottleMs; },
    set: function(v) { this.sysexThrottleMs = v; },
    enumerable: true, configurable: true
});

myCatnip._TIMING_DEFAULTS = Object.assign({}, myCatnip.TIMING);

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
    if (myCatnip.TIMING.takeoverEpsilon <= myCatnip.TIMING.coMatchEpsilon) {
        myCatnip._warnOnce('pacingEpsInvariant',
            'takeoverEpsilon must exceed coMatchEpsilon — restoring defaults');
        myCatnip.TIMING.coMatchEpsilon = myCatnip._TIMING_DEFAULTS.coMatchEpsilon;
        myCatnip.TIMING.takeoverEpsilon = myCatnip._TIMING_DEFAULTS.takeoverEpsilon;
    }
    _refreshAliases();
};

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