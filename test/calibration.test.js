'use strict';

var H = require('./helpers');

// _channelEmit, _emitAt, _calibratedHw, _flatTarget, caches.

// ── _channelEmit ─────────────────────────────────────────────

test('_channelEmit: full red at hw 127 → [1, 0, 0]', function(t) {
    var c = H.ctrl();
    var out = c._channelEmit([127, 0, 0], 127);
    t.approx(out[0], 1, 1e-9);
    t.approx(out[1], 0, 1e-9);
    t.approx(out[2], 0, 1e-9);
});

test('_channelEmit: black → [0, 0, 0]', function(t) {
    var c = H.ctrl();
    t.eq(c._channelEmit([0, 0, 0], 127), [0, 0, 0]);
});

test('_channelEmit: scales linearly with hw', function(t) {
    var c = H.ctrl();
    // Unpack immediately — _channelEmit returns a shared scratch
    // array (see its contract comment in lib-controller-render.js).
    // Holding two returns across calls aliases to the same array.
    var low0  = c._channelEmit([127, 0, 0], 64)[0];
    var high0 = c._channelEmit([127, 0, 0], 127)[0];
    t.approx(high0 / low0, 127 / 64, 1e-6);
});

test('_channelEmit: white at hw 127', function(t) {
    var c = H.ctrl();
    var out = c._channelEmit([127, 127, 127], 127);
    t.approx(out[0], 1, 1e-9);
    t.approx(out[1], 1, 1e-9);
    t.approx(out[2], 1, 1e-9);
});

// ── _emitAt ──────────────────────────────────────────────────

test('_emitAt: monotonic in hw', function(t) {
    var c = H.ctrl();
    var prev = -1;
    for (var hw = 0; hw <= 127; hw += 8) {
        var e = c._emitAt([127, 0, 0], hw);
        t.ok(e >= prev);
        prev = e;
    }
});

test('_emitAt: black → 0', function(t) {
    var c = H.ctrl();
    t.eq(c._emitAt([0, 0, 0], 127), 0);
});

test('_emitAt: red at hw 127 → 1', function(t) {
    var c = H.ctrl();
    t.approx(c._emitAt([127, 0, 0], 127), 1, 1e-9);
});

test('_emitAt: red at hw 64 → 64/127', function(t) {
    var c = H.ctrl();
    t.approx(c._emitAt([127, 0, 0], 64), 64 / 127, 1e-9);
});

test('_emitAt: saturation boost raises a saturated colour', function(t) {
    // Same rgb/hw, only hkBoost differs. The boost multiplies by
    // (1 + hkBoost * saturation) with saturation > 0 for red, so
    // a higher hkBoost always yields a higher emission.
    var c1 = H.ctrl({hkBoost: 0});
    var c2 = H.ctrl({hkBoost: 0.5});
    var s1 = c1._emitAt([127, 0, 0], 127);
    var s2 = c2._emitAt([127, 0, 0], 127);
    t.ok(s2 > s1);
});

// ── _calibratedHw ────────────────────────────────────────────

test('_calibratedHw: finds half target', function(t) {
    var c = H.ctrl();
    var hw = c._calibratedHw([127, 0, 0], 0.5);
    t.approx(hw, 64, 1);
});

test('_calibratedHw: target 0 → 0', function(t) {
    var c = H.ctrl();
    t.eq(c._calibratedHw([127, 0, 0], 0), 0);
});

test('_calibratedHw: negative target → 0', function(t) {
    var c = H.ctrl();
    t.eq(c._calibratedHw([127, 0, 0], -0.5), 0);
});

test('_calibratedHw: cached', function(t) {
    var c = H.ctrl();
    c._calibratedHw([127, 0, 0], 0.5);
    var size1 = c._hwCacheSize;
    c._calibratedHw([127, 0, 0], 0.5);
    t.eq(c._hwCacheSize, size1);
});

test('_calibratedHw: distinct args → new entries', function(t) {
    var c = H.ctrl();
    c._calibratedHw([127, 0, 0], 0.5);
    c._calibratedHw([0, 127, 0], 0.5);
    t.eq(c._hwCacheSize, 2);
});

// ── _flatTarget ──────────────────────────────────────────────

test('_flatTarget: null for all-black ramp', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var segs = XoneK3._buildSegments([[0,0,0], [0,0,0]], null, 127);
    t.eq(c._flatTarget(segs), null);
});

test('_flatTarget: null when calibration mode off', function(t) {
    var c = H.ctrl({calibrationMode: 'off'});
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    t.eq(c._flatTarget(segs), null);
});

test('_flatTarget: null for empty / null segs', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    t.eq(c._flatTarget(null), null);
    t.eq(c._flatTarget([]),   null);
});

test('_flatTarget: single stop returns that emission', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var segs = XoneK3._buildSegments([[127,0,0]], null, 127);
    t.approx(c._flatTarget(segs), 1, 1e-6);
});

test('_flatTarget: brightness feeds the min', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var segs = XoneK3._buildSegments([[127,0,0,80], [0,127,0,20]], null, 127);
    t.approx(c._flatTarget(segs), 20 / 127, 1e-3);
});

test('_flatTarget: min of stops', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    t.approx(c._flatTarget(segs), 1, 1e-6);
});

// ── _solveHw ─────────────────────────────────────────────────

test('_solveHw: calibration off → passthrough', function(t) {
    var c = H.ctrl({calibrationMode: 'off'});
    var hw = c._solveHw([127, 0, 0], 80, [], {calibration: true});
    t.eq(hw, 80);
});

test('_solveHw: calibration false on scheme → passthrough', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var hw = c._solveHw([127, 0, 0], 80, [], {calibration: false});
    t.eq(hw, 80);
});

test('_solveHw: black rgb → passthrough', function(t) {
    var c = H.ctrl({calibrationMode: 'rms'});
    var hw = c._solveHw([0, 0, 0], 80, [], {calibration: true});
    t.eq(hw, 80);
});

// ── wbRGB ────────────────────────────────────────────────────

test('_wbRGB: white balance applied', function(t) {
    var c = H.ctrl({wbGain: [0.5, 1.0, 1.0], wbActive: true});
    var out = c._wbRGB(100, 100, 100);
    t.eq(out[0], 50);
    t.eq(out[1], 100);
    t.eq(out[2], 100);
});

test('_wbRGB: disabled passthrough', function(t) {
    var c = H.ctrl({wbGain: [0.5, 1.0, 1.0], wbActive: false});
    var out = c._wbRGB(100, 100, 100);
    t.eq(out[0], 100);
});

test('_wbRGB: clamps at 127', function(t) {
    var c = H.ctrl({wbGain: [2.0, 2.0, 2.0], wbActive: true});
    var out = c._wbRGB(127, 127, 127);
    t.eq(out[0], 127);
});

test('_flatTarget: cache capped at 1024', function(t) {
    var c = H.ctrl({ calibrationMode: 'rms' });
    for (var i = 0; i < 1100; i++) {
        var segs = XoneK3._buildSegments(
            [[127, 0, i % 128], [0, 127, i % 128]], null, 127);
        c._flatTarget(segs);
    }
    t.ok(c._flatCacheSize <= 1024,
         'cache must not grow beyond 1024, got ' + c._flatCacheSize);
});

test('_flatTarget: cache id assigned per segs array', function(t) {
    var c = H.ctrl({ calibrationMode: 'rms' });
    var segs1 = XoneK3._buildSegments([[127,0,0]], null, 127);
    var segs2 = XoneK3._buildSegments([[0,127,0]], null, 127);
    c._flatTarget(segs1);
    c._flatTarget(segs2);
    t.ok(segs1._cacheId !== undefined);
    t.ok(segs2._cacheId !== undefined);
    t.neq(segs1._cacheId, segs2._cacheId);
});