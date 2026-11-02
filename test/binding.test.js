'use strict';

var H = require('./helpers');

// Binding primitive: input dispatch, _scaleValue, valueCurve,
// _isOn shapes, _defaultInput.

// ── _scaleValue ──────────────────────────────────────────────

test('_scaleValue: 0 → 0', function(t) {
    var c = H.ctrl();
    t.eq(c.bindings.knob0_0._scaleValue(0), 0);
});

test('_scaleValue: 63 → 63/128', function(t) {
    var c = H.ctrl();
    t.approx(c.bindings.knob0_0._scaleValue(63), 63 / 128, 1e-9);
});

test('_scaleValue: 64 → 64/128', function(t) {
    var c = H.ctrl();
    t.approx(c.bindings.knob0_0._scaleValue(64), 64 / 128, 1e-9);
});

test('_scaleValue: 127 → 126/126', function(t) {
    var c = H.ctrl();
    t.approx(c.bindings.knob0_0._scaleValue(127), 126 / 126, 1e-9);
});

// ── _applyValueCurve ─────────────────────────────────────────

test('_applyValueCurve: identity at c=1', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b._valueCurve = 1;
    t.eq(b._applyValueCurve(0.3), 0.3);
});

test('_applyValueCurve: pow at c=2', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b._valueCurve = 2;
    t.approx(b._applyValueCurve(0.5), 0.25, 1e-9);
});

test('_applyValueCurve: clamps endpoints', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b._valueCurve = 2;
    t.eq(b._applyValueCurve(0), 0);
    t.eq(b._applyValueCurve(1), 1);
    t.eq(b._applyValueCurve(-1), 0);
    t.eq(b._applyValueCurve(2),  1);
});

// ── _defaultInput ────────────────────────────────────────────

test('_defaultInput: toggle button flips 0 → 1', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b.group = '[Channel1]';
    b.inKey = 'pfl';
    b.type = 'button';
    b.buttonMode = 'toggle';
    engine._set('[Channel1]', 'pfl', 0);
    b._defaultInput(127, 0x90);
    t.eq(engine.getValue('[Channel1]', 'pfl'), 1);
});

test('_defaultInput: toggle button flips 1 → 0', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b.group = '[Channel1]'; b.inKey = 'pfl'; b.buttonMode = 'toggle';
    engine._set('[Channel1]', 'pfl', 1);
    b._defaultInput(127, 0x90);
    t.eq(engine.getValue('[Channel1]', 'pfl'), 0);
});

test('_defaultInput: push button sets 1 on press, 0 on release', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b.group = '[Channel1]'; b.inKey = 'pfl'; b.buttonMode = 'push';
    b._defaultInput(127, 0x90);
    t.eq(engine.getValue('[Channel1]', 'pfl'), 1);
    b._defaultInput(0, 0x80);
    t.eq(engine.getValue('[Channel1]', 'pfl'), 0);
});

test('_defaultInput: knob writes _normalized', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b.group = '[Channel1]'; b.inKey = 'volume'; b.type = 'knob';
    b._normalized = 0.5;
    b._defaultInput(64, 0xB0);
    t.approx(engine.getParameter('[Channel1]', 'volume'), 0.5, 1e-9);
});

test('_defaultInput: no group/inKey → no-op', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b.group = undefined; b.inKey = undefined;
    b._defaultInput(127, 0x90);
});

// ── _isOn shapes ─────────────────────────────────────────────
//
// _csOn is now three types: null (unset), true / false
// (unconditional), or an object (conditional). The old
// { always: true } form is gone — `on: true` / `on: false` in
// config, `_csOn === true` / `_csOn === false` on the binding.

test('_isOn: true → 1', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = true;
    t.eq(b._isOn(), 1);
});

test('_isOn: false → 0 even with outKey set', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = false;
    b.group = '[Channel1]';
    b.outKey = 'pfl';
    engine._set('[Channel1]', 'pfl', 1);
    t.eq(b._isOn(), 0, 'on: false wins over outKey');
});

test('_isOn: no cs.on, no outKey → 0', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = null;
    b.group = '[Channel1]';
    b.outKey = undefined;
    t.eq(b._isOn(), 0);
});

test('_isOn: outKey read', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b.group = '[Channel1]';
    b.outKey = 'pfl';
    engine._set('[Channel1]', 'pfl', 1);
    t.eq(b._isOn(), 1);
    engine._set('[Channel1]', 'pfl', 0);
    t.eq(b._isOn(), 0);
});

test('_isOn: state truthy', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'isShifted'};
    c.isShifted = true;
    t.eq(b._isOn(), 1);
    c.isShifted = false;
    t.eq(b._isOn(), 0);
});

test('_isOn: state equals strict', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'activeDeck', equals: 'B'};
    c.activeDeck = 'A';
    t.eq(b._isOn(), 0);
    c.activeDeck = 'B';
    t.eq(b._isOn(), 1);
});

test('_isOn: state dot path', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: '_lab.saveArmed'};
    c._lab = {saveArmed: true};
    t.eq(b._isOn(), 1);
});

test('_isOn: contains array', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'activePatches', contains: 'cue'};
    c.activePatches = ['cue', 'loop'];
    t.eq(b._isOn(), 1);
    c.activePatches = ['loop'];
    t.eq(b._isOn(), 0);
});

test('_isOn: contains string', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'label', contains: 'at'};
    c.label = 'Cat';
    t.eq(b._isOn(), 1);
    c.label = 'Dog';
    t.eq(b._isOn(), 0);
});

test('_isOn: co reads CO value', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {co: 'enabled', group: '[EffectRack1_EffectUnit1]'};
    engine._set('[EffectRack1_EffectUnit1]', 'enabled', 1);
    t.eq(b._isOn(), 1);
});

test('_isOn: patchActive name', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    var b = c.bindings.button0_0;
    b._csOn = {patchActive: 'cue'};
    t.eq(b._isOn(), 1);
});

test('_isOn: patchActive array', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}});
    c.activePatches = ['loop'];
    var b = c.bindings.button0_0;
    b._csOn = {patchActive: ['cue', 'loop']};
    t.eq(b._isOn(), 1);
});

test('_isOn: patchActive none → 0', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = [];
    var b = c.bindings.button0_0;
    b._csOn = {patchActive: 'cue'};
    t.eq(b._isOn(), 0);
});

// ── _isOn: truthy semantics for strings / numbers ───────────

test('_isOn: string state truthy (activeDisplaySource)', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'activeDisplaySource'};
    c.activeDisplaySource = 'track';
    t.eq(b._isOn(), 1);
    c.activeDisplaySource = 'loop';
    t.eq(b._isOn(), 1);
    c.activeDisplaySource = '';
    t.eq(b._isOn(), 0);
});

test('_isOn: string state activeDeck', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'activeDeck'};
    c.activeDeck = 'A';
    t.eq(b._isOn(), 1);
    c.activeDeck = '';
    t.eq(b._isOn(), 0);
});

test('_isOn: number state 0 falsy', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'selectedFxCurrent'};
    c.selectedFxCurrent = 0;
    t.eq(b._isOn(), 0);
    c.selectedFxCurrent = 1;
    t.eq(b._isOn(), 1);
});

test('_isOn: undefined state falsy', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {state: 'nonsensePath'};
    t.eq(b._isOn(), 0);
});

// ── observers ────────────────────────────────────────────────

test('addObserver / removeObserver', function(t) {
    var c = H.ctrl();
    var knob = c.bindings.knob0_0;
    var dummy = {_refresh: function() {}};
    knob.addObserver(dummy);
    t.eq(knob._ledObservers.length, 1);
    knob.addObserver(dummy);
    t.eq(knob._ledObservers.length, 1);
    knob.removeObserver(dummy);
    t.eq(knob._ledObservers.length, 0);
});

test('input fires LED observers', function(t) {
    var c = H.ctrl();
    var fired = 0;
    var knob = c.bindings.knob0_0;
    knob.addObserver({_refresh: function() { fired++; }});
    knob.input(0, 0, 64, 0xB0);
    t.eq(fired, 1);
});

// ── _snapshotBinding / _bindingDefaults ──────────────────────

test('_snapshotBinding: captures group/inKey/type/idx', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b.group = '[Channel1]'; b.inKey = 'volume';
    b._rawCfg = {}; b.idx = 5;
    var snap = c._snapshotBinding(b);
    t.eq(snap.group, '[Channel1]');
    t.eq(snap.inKey, 'volume');
    t.eq(snap.wasPot, true);
    t.eq(snap.wasBound, true);
    t.eq(snap.idx, 5);
});

test('_snapshotBinding: button → wasPot false', function(t) {
    var c = H.ctrl();
    var snap = c._snapshotBinding(c.bindings.button0_0);
    t.eq(snap.wasPot, false);
});

// ── _reset ───────────────────────────────────────────────────

test('_reset: wipes reset-able fields, preserves session fields', function(t) {
    var c = H.ctrl();
    var b = c.bindings.knob0_0;
    b.group = '[Channel1]';
    b.inKey = 'volume';
    b._normalized = 0.7;
    b._reset();
    t.eq(b.group, undefined);
    t.eq(b.inKey, undefined);
    t.eq(b._normalized, 0.7);
});

// ── _evalOnCoValue cached value ────────────────────────────

test('_evalOnCoValue: cachedValue wins over live read', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {
        co: 'enabled',
        group: '[EffectRack1_EffectUnit1]',
        cachedValue: 1
    };
    // CO reads 0 but cached 1 → on
    engine._set('[EffectRack1_EffectUnit1]', 'enabled', 0);
    t.eq(b._isOn(), 1);
});

test('_evalOnCoValue: falls back to live read when cachedValue undefined', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    b._csOn = {
        co: 'enabled',
        group: '[EffectRack1_EffectUnit1]',
        cachedValue: undefined
    };
    engine._set('[EffectRack1_EffectUnit1]', 'enabled', 1);
    t.eq(b._isOn(), 1);
});

// ── captured release throw recovery ────────────────────────

test('_dispatchCapturedRelease: throwing func is caught, warn fired', function(t) {
    var c = H.ctrl();
    XoneK3._warned = {};
    _printLog.length = 0;
    c._applyBinding('press0', {
        type: 'push',
        func: function(args, ch, cc, v) {
            if (v === 0) throw new Error('release boom');
        }
    });

    H.press(c, 'press0');
    var threw = false;
    try { H.release(c, 'press0'); }
    catch (e) { threw = true; }

    t.notOk(threw, 'release must not propagate throw');
    t.contains(_printLog.join('\n'), 'captured release threw');
});