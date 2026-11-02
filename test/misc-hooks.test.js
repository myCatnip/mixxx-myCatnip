'use strict';

var H = require('./helpers');

// _onPatchChange / _afterRecompute / _onInput hooks, TIME_SIG
// setter/clearer, _pulseCo edge cases, CO watcher lifecycle.

// ── default hooks are no-ops ──────────────────────────────

test('default hooks are no-ops (base K3Controller)', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    // Base implementations are empty; LabController overrides
    // them. Calling the base must not throw.
    c._onPatchChange('cue', null);
    c._afterRecompute();
    c._onInput(c.bindings.button0_0);
});

// ── _onPatchChange fires ──────────────────────────────────

test('_onPatchChange: fires on addPatch', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    var log = [];
    c._onPatchChange = function(f, t2) { log.push([f, t2]); };
    c.addPatch('cue');
    t.eq(log.length, 1);
    t.eq(log[0], [null, 'cue']);
});

test('_onPatchChange: fires on removePatch', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    var log = [];
    c._onPatchChange = function(f, t2) { log.push([f, t2]); };
    c.removePatch('cue');
    t.eq(log[0], ['cue', null]);
});

test('_onPatchChange: fires on replacePatch', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}});
    c.activePatches = ['cue'];
    var log = [];
    c._onPatchChange = function(f, t2) { log.push([f, t2]); };
    c.replacePatch('cue', 'loop');
    t.eq(log[0], ['cue', 'loop']);
});

// ── _afterRecompute fires ─────────────────────────────────

test('_afterRecompute: fires once per recompute', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    var count = 0;
    c._afterRecompute = function() { count++; };
    c.addPatch('cue');
    t.eq(count, 1);
});

test('_afterRecompute: fires on modifier state change', function(t) {
    var c = H.ctrl({
        modifierStates: { shift: { heldBy: ['shift'], recompute: true } },
        patches: { base: { shift: { type: 'push' } } },
        initialPatches: ['base']
    });
    c._recompute();
    var count = 0;
    c._afterRecompute = function() { count++; };
    H.press(c, 'shift');
    H.release(c, 'shift');
    t.eq(count, 2);
});

// ── _onInput fires ─────────────────────────────────────────

test('_onInput: fires before binding func', function(t) {
    var c = H.ctrl();
    var order = [];
    c._onInput = function() { order.push('input'); };
    c._applyBinding('press0', {
        func: function() { order.push('func'); }
    });
    H.press(c, 'press0');
    t.eq(order, ['input', 'func']);
});

test('_onInput: fires even for noLED cells', function(t) {
    var c = H.ctrl();
    var fired = 0;
    c._onInput = function() { fired++; };
    c._applyBinding('press0', {noLED: true, func: function() {}});
    H.press(c, 'press0');
    t.eq(fired, 1);
});

// ── TIME_SIG setter / clearer ─────────────────────────────

test('setTimeSig: updates TIME_SIG', function(t) {
    XoneK3.setTimeSig(3, 4);
    t.eq(XoneK3.TIME_SIG.barBeats, 3);
    t.eq(XoneK3.TIME_SIG.phraseBars, 4);
});

test('setTimeSig: invalid args ignored', function(t) {
    XoneK3.TIME_SIG = null;
    XoneK3.setTimeSig(0, 4);
    t.eq(XoneK3.TIME_SIG, null);
    XoneK3.setTimeSig(4, -1);
    t.eq(XoneK3.TIME_SIG, null);
});

test('clearTimeSig: nulls TIME_SIG', function(t) {
    XoneK3.setTimeSig(3, 4);
    XoneK3.clearTimeSig();
    t.eq(XoneK3.TIME_SIG, null);
});

test('setTimeSig: iterates XoneK3.controllers', function(t) {
    var c = H.bootCat();
    var called = false;
    c._refreshAllLeds = function() { called = true; };
    XoneK3.setTimeSig(3, 4);
    t.ok(called);
});

test('clearTimeSig: iterates XoneK3.controllers', function(t) {
    var c = H.bootCat();
    XoneK3.setTimeSig(3, 4);
    var called = false;
    c._refreshAllLeds = function() { called = true; };
    XoneK3.clearTimeSig();
    t.ok(called);
});

// ── _pulseCo ──────────────────────────────────────────────

test('_pulseCo: sets 1, fires one-shot, clears to 0', function(t) {
    var c = H.ctrl();
    c._pulseCo('[Channel1]', 'test_co');
    t.eq(engine.getValue('[Channel1]', 'test_co'), 1);
    engine._fireOneShots();
    t.eq(engine.getValue('[Channel1]', 'test_co'), 0);
});

test('_pulseCo: does not touch other COs', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'other_co', 42);
    c._pulseCo('[Channel1]', 'test_co');
    t.eq(engine.getValue('[Channel1]', 'other_co'), 42);
});

test('_pulseCo: back-to-back pulses independent', function(t) {
    var c = H.ctrl();
    c._pulseCo('[Channel1]', 'co_a');
    c._pulseCo('[Channel1]', 'co_b');
    engine._fireOneShots();
    t.eq(engine.getValue('[Channel1]', 'co_a'), 0);
    t.eq(engine.getValue('[Channel1]', 'co_b'), 0);
});

// ── outKey CO watcher ──────────────────────────────────────

test('outKey CO change repaints LED', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    engine._set('[Channel1]', 'pfl', 1);
    H.clearLeds(c);
    engine._trigger('[Channel1]', 'pfl', 1);
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
});

// ── hotcue colour CO watcher ──────────────────────────────

test('hotcue colour change triggers LED repaint', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        group: '[Channel1]', inKey: 'hotcue_1_activate',
        outKey: 'hotcue_1_status',
        colorScheme: {scheme: 'mixxx'}
    });
    H.fireCO('[Channel1]', 'hotcue_1_status', 1);
    engine._set('[Channel1]', 'hotcue_1_color', 0xC50A08);
    H.clearLeds(c);
    engine._trigger('[Channel1]', 'hotcue_1_color', 0xC50A08);
    var led = H.led(c, 'grid0_2');
    t.ok(led);
    t.eq(led.r, 0x6F);
});

test('hotcue colour watcher disconnected on unbind', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        group: '[Channel1]', inKey: 'hotcue_1_activate',
        outKey: 'hotcue_1_status',
        colorScheme: {scheme: 'mixxx'}
    });
    c._applyBinding('grid0_2', null);
    var conns = engine._conns['[Channel1]|hotcue_1_color'] || [];
    t.eq(conns.length, 0);
});

// ── outKey cache ──────────────────────────────────────────────

test('outKey cache: seeded on bind', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'pfl', 1);
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    t.eq(c.bindings.button0_0._lastOutKeyValue, 1,
         'seeded with current CO at bind');
});

test('outKey cache: updated on listener fire', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    engine._trigger('[Channel1]', 'pfl', 1);
    t.eq(c.bindings.button0_0._lastOutKeyValue, 1);
    engine._trigger('[Channel1]', 'pfl', 0);
    t.eq(c.bindings.button0_0._lastOutKeyValue, 0);
});

test('outKey cache: _isOn reflects cached value', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    engine._trigger('[Channel1]', 'pfl', 1);
    t.eq(c.bindings.button0_0._isOn(), 1);
});

test('outKey cache: stale cache still updates on next CO change', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    engine._set('[Channel1]', 'pfl', 1);
    engine._trigger('[Channel1]', 'pfl', 1);
    t.eq(c.bindings.button0_0._lastOutKeyValue, 1,
         'cache caught up after listener fire');
    t.eq(c.bindings.button0_0._isOn(), 1);
});

// ── co-match cache ───────────────────────────────────────────

test('co-match cache: seeded on knob bind', function(t) {
    var c = H.ctrl();
    engine.setParameter('[Channel1]', 'pregain', 0.5);
    c._applyBinding('knob0_0', {
        group: '[Channel1]', inKey: 'pregain'
    });
    t.approx(c.bindings.knob0_0._lastCoValue, 0.5, 1e-9);
});

test('co-match cache: updated on knob change', function(t) {
    var c = H.ctrl();
    c._applyBinding('knob0_0', {
        group: '[Channel1]', inKey: 'pregain'
    });
    engine.setParameter('[Channel1]', 'pregain', 0.7);
    engine._trigger('[Channel1]', 'pregain', 0.7);
    t.approx(c.bindings.knob0_0._lastCoValue, 0.7, 1e-9);
});

test('co-match cache: not seeded on button bind', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {
        group: '[Channel1]', inKey: 'play'
    });
    t.eq(c.bindings.press0._lastCoValue, undefined);
});

test('co-match cache: coMatchSample falls back to live read when undefined', function(t) {
    engine.setParameter('[Channel1]', 'pregain', 0.4);
    var compiled = XoneK3.compileScheme({
        colors: [[127, 0, 0]],
        coScheme: 'coMatch'
    });
    var steer = XoneK3.coMatchSample(compiled, '[Channel1]', 'pregain',
                                      0.8, true, undefined);
    t.ok(steer, 'live read fallback returned a steer');
});

// Regression: a knob's own write must update _lastCoValue
// synchronously, or deviation LEDs sampling it flash a spurious
// co-match on every MIDI event (the listener fires one event-loop
// turn after the write, but _refreshObservers runs immediately
// inside input()).
test('co-match cache: synchronous after input() write', function(t) {
    var c = H.ctrl();
    engine.setParameter('[Channel1]', 'pregain', 0.5);
    c._applyBinding('knob0_0', {
        group: '[Channel1]', inKey: 'pregain'
    });
    // Drive the write through input() — no manual _trigger, so the
    // listener hasn't fired yet when the assertion runs.
    c.bindings.knob0_0.input(0, 0x10, 40, 0xB0);
    t.approx(c.bindings.knob0_0._lastCoValue,
             engine.getParameter('[Channel1]', 'pregain'), 1e-9,
             '_lastCoValue matches CO immediately after input()');
});

// ── channelPerceptual shape validation ──────────────────────

test('channelPerceptual: short array warns and falls back to [1,1,1]', function(t) {
    _printLog.length = 0;
    var c = H.ctrl({ channelPerceptual: [1, 1] });
    t.eq(c.channelPerceptual, [1, 1, 1]);
    t.contains(_printLog.join('\n'),
        'channelPerceptual must be a 3-element array');
});

test('channelPerceptual: short array does not produce NaN in _channelEmit', function(t) {
    var c = H.ctrl({ channelPerceptual: [1, 1] });
    var out = c._channelEmit([127, 0, 0], 127);
    t.ok(!isNaN(out[0]));
    t.ok(!isNaN(out[1]));
    t.ok(!isNaN(out[2]));
});

// ── co-match cache: custom func writes own CO ───────────────

test('co-match cache: custom func writing own CO → cache updated synchronously', function(t) {
    var c = H.ctrl();
    engine.setParameter('[Channel1]', 'pregain', 0.5);
    c._applyBinding('knob0_0', {
        group: '[Channel1]', inKey: 'pregain',
        func: function() {
            engine.setParameter(this.group, this.inKey, 0.9);
        }
    });
    c.bindings.knob0_0.input(0, 0x10, 40, 0xB0);
    t.approx(c.bindings.knob0_0._lastCoValue, 0.9, 1e-9,
             'func-written CO reflected in cache synchronously');
});