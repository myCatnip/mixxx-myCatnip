'use strict';

var H = require('./helpers');

// Public API tests for myCatnip.perception. The old
// calibration.test.js tested controller-bound implementation
// details (_channelEmit, _calibratedHw, _flatTarget, _wbRGB) that
// moved to the perception module with hardware-first signatures.

// ── deriveCurves ────────────────────────────────────────────

test('perception: deriveCurves for HW_K3', function(t) {
    var c = myCatnip.perception.deriveCurves(myCatnip.HW_K3);
    t.ok(c);
    t.ok(Array.isArray(c.r));
    t.ok(Array.isArray(c.g));
    t.ok(Array.isArray(c.b));
    t.ok(c.r.length > 0);
});

test('perception: deriveCurves null when no PERCEPTION', function(t) {
    var hw = Object.assign({}, myCatnip.HW_K3);
    delete hw.PERCEPTION;
    myCatnip.perception._invalidate(hw);
    t.eq(myCatnip.perception.deriveCurves(hw), null);
});

test('perception: deriveCurves from samples', function(t) {
    var c = myCatnip.perception.deriveFromSamples([
        { step: 1.00, rgb: [127, 127, 127] },
        { step: 0.50, rgb: [ 60,  60,  60] },
        { step: 0.00, rgb: [  0,   0,   0] }
    ]);
    t.ok(c);
    t.ok(c.r.length === 3);
});

// ── _emitAt ─────────────────────────────────────────────────

test('perception: _emitAt monotonic in hw (identity)', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    var prev = -1;
    for (var b = 0; b <= 127; b += 8) {
        var e = myCatnip.perception._emitAt([127, 0, 0], b, hw, 'off');
        t.ok(e >= prev, 'emit at ' + b + ' >= prev');
        prev = e;
    }
});

test('perception: _emitAt black → 0', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    t.eq(myCatnip.perception._emitAt([0, 0, 0], 127, hw, 'off'), 0);
});

test('perception: _emitAt red at hw 127 → 1 (linearTest)', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    t.approx(myCatnip.perception._emitAt([127, 0, 0], 127, hw, 'off'), 1, 1e-9);
});

test('perception: _emitAt red at hw 64 → 64/127 (linearTest)', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    t.approx(myCatnip.perception._emitAt([127, 0, 0], 64, hw, 'off'), 64 / 127, 1e-9);
});

// ── _bisectHw ───────────────────────────────────────────────

test('perception: _bisectHw finds half target', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    t.approx(myCatnip.perception._bisectHw([127, 0, 0], 0.5, hw, 'off'), 64, 1);
});

test('perception: _bisectHw target 0 → 0', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    t.eq(myCatnip.perception._bisectHw([127, 0, 0], 0, hw, 'off'), 0);
});

// ── applyMix ────────────────────────────────────────────────

test('perception: applyMix WB multiply', function(t) {
    var hw = Object.assign({}, myCatnip.HW_K3);
    hw.PERCEPTION = {
        curves: 'linearTest',
        wbGain: [0.5, 1.0, 1.0],
        mode: { mix: 'correct', brightness: 'off' }
    };
    var rgb = [100, 100, 100];
    myCatnip.perception.applyMix(rgb, hw, 'correct');
    t.eq(rgb, [50, 100, 100]);
});

test('perception: applyMix off → no-op', function(t) {
    var hw = Object.assign({}, myCatnip.HW_K3);
    hw.PERCEPTION = {
        curves: 'linearTest',
        wbGain: [0.5, 1.0, 1.0],
        mode: { mix: 'off', brightness: 'off' }
    };
    var rgb = [100, 100, 100];
    myCatnip.perception.applyMix(rgb, hw, 'off');
    t.eq(rgb, [100, 100, 100]);
});

test('perception: applyMix clamps at 127', function(t) {
    var hw = Object.assign({}, myCatnip.HW_K3);
    hw.PERCEPTION = {
        curves: 'linearTest',
        wbGain: [2.0, 2.0, 2.0],
        mode: { mix: 'correct', brightness: 'off' }
    };
    var rgb = [127, 127, 127];
    myCatnip.perception.applyMix(rgb, hw, 'correct');
    t.eq(rgb, [127, 127, 127]);
});

// ── solveBrightness ─────────────────────────────────────────

test('perception: solveBrightness off → passthrough', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    var out = myCatnip.perception.solveBrightness(hw, [127, 0, 0], 80, 'off', 'off', []);
    t.eq(out, 80);
});

test('perception: solveBrightness black → passthrough', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    var out = myCatnip.perception.solveBrightness(hw, [0, 0, 0], 80, 'off', 'own', []);
    t.eq(out, 80);
});

test('perception: solveBrightness own mode (linearTest identity)', function(t) {
    var hw = H._identityHw();
    myCatnip.perception._invalidate(hw);
    var out = myCatnip.perception.solveBrightness(hw, [127, 0, 0], 100, 'off', 'own', []);
    t.approx(out, 100, 2);
});

test('perception: solveBrightness no curves → passthrough', function(t) {
    var hw = Object.assign({}, myCatnip.HW_K3);
    delete hw.PERCEPTION;
    myCatnip.perception._invalidate(hw);
    var out = myCatnip.perception.solveBrightness(hw, [127, 0, 0], 80, 'off', 'own', []);
    t.eq(out, 80);
});