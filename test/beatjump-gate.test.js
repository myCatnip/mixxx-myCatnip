'use strict';

var H = require('./helpers');

// Beatjump gate: XoneK3.BEATJUMP_GAP_MS, _beatjumpAllowed,
// _touchLoop, and the loop-touching funcs that stamp
// _lastLoopTouchMs.
//
// Rule: a beatjump is blocked when its target channel has
// loop_enabled > 0 AND less than BEATJUMP_GAP_MS has elapsed
// since the last loop-touching event on that channel. Outside a
// loop every beatjump fires and nothing is stamped.

// Bind a beatjump button on Channel<ch> and set that channel's
// loop_enabled. Returns the binding.
function armBeatjump(c, name, ch) {
    ch = ch || 1;
    c._applyBinding(name, {
        func: XoneK3.FUNCS.beatjumpButton, args: ['beatjump_1_backward'],
        group: '[Channel' + ch + ']'
    });
    engine._set('[Channel' + ch + ']', 'loop_enabled', 1);
    return c.bindings[name];
}

// ═══ BEATJUMP_GAP_MS constant ═══════════════════════════════

test('BEATJUMP_GAP_MS: exists on XoneK3', function(t) {
    t.ok(typeof XoneK3.BEATJUMP_GAP_MS === 'number');
});

test('BEATJUMP_GAP_MS: default is 130', function(t) {
    t.eq(XoneK3.BEATJUMP_GAP_MS, 130);
});

// ═══ _beatjumpAllowed: group resolution ══════════════════════

test('_beatjumpAllowed: non-Channel group → true (undefined / null / [Master])', function(t) {
    var c = H.ctrl();
    t.eq(c._beatjumpAllowed(undefined),  true, 'undefined');
    t.eq(c._beatjumpAllowed(null),       true, 'null');
    t.eq(c._beatjumpAllowed('[Master]'), true, '[Master]');
});

test('_beatjumpAllowed: non-Channel group does not stamp any channel', function(t) {
    var c = H.ctrl();
    c._lastLoopTouchMs[1] = 0;
    c._beatjumpAllowed('[Master]');
    t.eq(c._lastLoopTouchMs[1], 0);
});

// ═══ _beatjumpAllowed: channel with no loop ══════════════════

test('_beatjumpAllowed: no loop → true, no stamp', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._lastLoopTouchMs[1] = 0;
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
    t.eq(c._lastLoopTouchMs[1], 0, 'out-of-loop must not stamp');
});

test('_beatjumpAllowed: no loop ignores recent touch', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._lastLoopTouchMs[1] = Date.now();
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
});

// ═══ _beatjumpAllowed: channel in loop ═══════════════════════

test('_beatjumpAllowed: fresh loop → true, stamps', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = 0;
    var before = Date.now();
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
    t.ok(c._lastLoopTouchMs[1] >= before, 'pass must stamp the touch time');
});

test('_beatjumpAllowed: inside gap → false', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = Date.now();
    t.eq(c._beatjumpAllowed('[Channel1]'), false);
});

test('_beatjumpAllowed: gap exactly elapsed → true', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = Date.now() - XoneK3.BEATJUMP_GAP_MS - 5;
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
});

test('_beatjumpAllowed: two consecutive jumps gate each other', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = 0;
    t.eq(c._beatjumpAllowed('[Channel1]'), true,  'first passes');
    t.eq(c._beatjumpAllowed('[Channel1]'), false, 'second gates');
});

test('_beatjumpAllowed: gap=0 disables the gate', function(t) {
    var c = H.ctrl();
    var orig = XoneK3.BEATJUMP_GAP_MS;
    XoneK3.BEATJUMP_GAP_MS = 0;
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = Date.now();
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
    XoneK3.BEATJUMP_GAP_MS = orig;
});

test('_beatjumpAllowed: per-channel isolation', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    engine._set('[Channel2]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = Date.now();
    c._lastLoopTouchMs[2] = 0;
    t.eq(c._beatjumpAllowed('[Channel1]'), false, 'ch1 gated');
    t.eq(c._beatjumpAllowed('[Channel2]'), true,  'ch2 fresh');
});

test('_beatjumpAllowed: ch2 stamp does not affect ch1 gate', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    engine._set('[Channel2]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = 0;
    c._lastLoopTouchMs[2] = 0;
    c._beatjumpAllowed('[Channel2]');           // stamps ch2
    t.ok(c._lastLoopTouchMs[2] > 0);
    t.eq(c._lastLoopTouchMs[1], 0, 'ch1 untouched');
    t.eq(c._beatjumpAllowed('[Channel1]'), true);
});

// ═══ _touchLoop ══════════════════════════════════════════════

test('_touchLoop: stamps _lastLoopTouchMs[ch]', function(t) {
    var c = H.ctrl();
    c._lastLoopTouchMs[1] = 0;
    var before = Date.now();
    c._touchLoop('[Channel1]');
    t.ok(c._lastLoopTouchMs[1] >= before);
});

test('_touchLoop: non-Channel group is a no-op', function(t) {
    var c = H.ctrl();
    c._lastLoopTouchMs[1] = 12345;
    c._touchLoop('[Master]');
    t.eq(c._lastLoopTouchMs[1], 12345);
});

test('_touchLoop: undefined group is a no-op', function(t) {
    var c = H.ctrl();
    c._lastLoopTouchMs[1] = 12345;
    c._touchLoop(undefined);
    t.eq(c._lastLoopTouchMs[1], 12345);
});

// ═══ beatjumpButton: gated via _beatjumpAllowed ══════════════

test('beatjumpButton: fires when allowed', function(t) {
    var c = H.ctrl();
    armBeatjump(c, 'grid0_0', 1);
    c._lastLoopTouchMs[1] = 0;
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
});

test('beatjumpButton: does not fire when gated', function(t) {
    var c = H.ctrl();
    armBeatjump(c, 'grid0_0', 1);
    c._lastLoopTouchMs[1] = Date.now();
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 0,
         'gated beatjump must not pulse');
});

test('beatjumpButton: fires freely outside a loop', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_0', {
        func: XoneK3.FUNCS.beatjumpButton, args: ['beatjump_1_backward'],
        group: '[Channel1]'
    });
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._lastLoopTouchMs[1] = Date.now();          // would gate if in loop
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
});

test('beatjumpButton: release is not gated (no pulse either way)', function(t) {
    var c = H.ctrl();
    armBeatjump(c, 'grid0_0', 1);
    c._lastLoopTouchMs[1] = Date.now();
    H.release(c, 'grid0_0');                     // isPress returns false → return early
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 0);
});

// ═══ encBeatjump: gated via _beatjumpAllowed ═════════════════

test('encBeatjump: fires when allowed', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = 0;
    H.send(c, 'encoderL', 1);
    t.eq(engine.getValue('[Channel1]', 'beatjump_forward'), 1);
});

test('encBeatjump: does not fire when gated', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = Date.now();
    H.send(c, 'encoderL', 1);
    t.eq(engine.getValue('[Channel1]', 'beatjump_forward'), 0);
});

// ═══ _touchLoop callers: loop-touching funcs ═════════════════

test('encLoopMove: stamps _lastLoopTouchMs', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encLoopMove, args: ['in', 0.01],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    c._lastLoopTouchMs[1] = 0;
    H.send(c, 'encoderL', 1);
    t.ok(c._lastLoopTouchMs[1] > 0);
});

test('pressSetValue on beatloop_size: stamps _lastLoopTouchMs', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.pressSetValue, args: ['1/4'],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    c._lastLoopTouchMs[1] = 0;
    H.press(c, 'grid0_2');
    t.ok(c._lastLoopTouchMs[1] > 0);
});

test('pressSetValue on beatjump_size: does NOT stamp', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.pressSetValue, args: ['1/2'],
        group: '[Channel1]', inKey: 'beatjump_size'
    });
    c._lastLoopTouchMs[1] = 0;
    H.press(c, 'grid0_2');
    t.eq(c._lastLoopTouchMs[1], 0,
         'beatjump_size is a next-jump setting, not a loop touch');
});

test('reloopToggleResetAnchor: stamps _lastLoopTouchMs', function(t) {
    var c = H.ctrl();
    c._applyBinding('pressL', {
        func: XoneK3.FUNCS.reloopToggleResetAnchor, group: '[Channel1]'
    });
    c._lastLoopTouchMs[1] = 0;
    H.press(c, 'pressL');
    t.ok(c._lastLoopTouchMs[1] > 0);
});

test('beatloopActivateResetAnchor: stamps _lastLoopTouchMs', function(t) {
    var c = H.ctrl();
    c._applyBinding('pressR', {
        func: XoneK3.FUNCS.beatloopActivateResetAnchor, group: '[Channel1]'
    });
    c._lastLoopTouchMs[1] = 0;
    H.press(c, 'pressR');
    t.ok(c._lastLoopTouchMs[1] > 0);
});

test('non-loop func (encPregainStep) does not stamp', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoder0', {
        func: XoneK3.FUNCS.encPregainStep, args: [0.025],
        group: '[Channel1]', inKey: 'pregain'
    });
    c._lastLoopTouchMs[1] = 0;
    H.send(c, 'encoder0', 1);
    t.eq(c._lastLoopTouchMs[1], 0);
});

test('encBeatjumpStepScale does not stamp', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderR', {
        func: XoneK3.FUNCS.encBeatjumpStepScale, args: ['1/32', 16],
        group: '[Channel1]'
    });
    c._lastLoopTouchMs[1] = 0;
    H.send(c, 'encoderR', 1);
    t.eq(c._lastLoopTouchMs[1], 0);
});

// ═══ Integration: encoder spam + beatjump ════════════════════

test('encoder move blocks a following beatjump', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encLoopMove, args: ['in', 0.01],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    c._applyBinding('grid0_0', {
        func: XoneK3.FUNCS.beatjumpButton, args: ['beatjump_1_backward'],
        group: '[Channel1]'
    });
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._lastLoopTouchMs[1] = 0;

    H.send(c, 'encoderL', 1);
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 0,
         'beatjump after encoder move must be gated');
});

test('beatjump after gap elapses is allowed', function(t) {
    var c = H.ctrl();
    armBeatjump(c, 'grid0_0', 1);
    c._lastLoopTouchMs[1] = Date.now() - (XoneK3.BEATJUMP_GAP_MS + 50);
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
});

test('beatjump outside a loop ignores recent encoder touch', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encLoopMove, args: ['in', 0.01],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    c._applyBinding('grid0_0', {
        func: XoneK3.FUNCS.beatjumpButton, args: ['beatjump_1_backward'],
        group: '[Channel1]'
    });
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._lastLoopTouchMs[1] = 0;

    H.send(c, 'encoderL', 1);       // stamps _lastLoopTouchMs
    H.press(c, 'grid0_0');          // but loop is off → passes
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
});