'use strict';

var H = require('./helpers');

// Chord is a modifier state: active while shift AND layer are
// both held (via their transactions). The CHORD patch is added
// and removed by the modifier system via `patchActivate`.
//
// Tests exercise the modifier system end-to-end (press/release
// events), not the removed `_enterChord` / `_exitChord` methods.

function setup() {
    var c = H.ctrl({
        modifierStates: {
            shift: { heldBy: ['shift'], recompute: true },
            chord: { heldBy: ['shift', 'layer'], patchActivate: 'chord' }
        },
        patches: {
            base: {
                _shift: 'baseShift',
                shift: { type: 'push' },
                layer: { type: 'push', func: XoneK3.FUNCS.layerButton,
                         args: ['cue', 'loop'] },
                press0: { group: 'a' }
            },
            baseShift: { press0: { group: 'b' } },
            chord: { press0: { group: 'c' } },
            cue: {},
            loop: {}
        },
        initialPatches: ['base', 'cue']
    });
    c._recompute();
    return c;
}

// ── modifier state ──────────────────────────────────────────

test('chord: not active initially', function(t) {
    var c = setup();
    t.eq(c.modifiers.shift, false);
    t.eq(c.modifiers.chord, false);
    t.notOk(c.activePatches.indexOf('chord') !== -1);
});

test('chord: shift alone → modifiers.shift true, chord false', function(t) {
    var c = setup();
    H.press(c, 'shift');
    t.eq(c.modifiers.shift, true);
    t.eq(c.modifiers.chord, false);
    t.notOk(c.activePatches.indexOf('chord') !== -1);
});

test('chord: shift + layer → chord active, patch added', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    t.eq(c.modifiers.chord, true);
    t.contains(c.activePatches, 'chord');
});

test('chord: shift + layer does NOT swap the layer patch', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    t.contains(c.activePatches, 'cue');
    t.notOk(c.activePatches.indexOf('loop') !== -1);
});

test('chord: layer alone swaps cue → loop', function(t) {
    var c = setup();
    H.press(c, 'layer');
    t.eq(c.modifiers.chord, false);
    t.contains(c.activePatches, 'loop');
    t.notOk(c.activePatches.indexOf('cue') !== -1);
});

// ── release ordering ────────────────────────────────────────

test('chord: release layer first exits chord, shift still held', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    t.eq(c.modifiers.chord, true);
    H.release(c, 'layer');
    t.eq(c.modifiers.chord, false);
    t.eq(c.modifiers.shift, true);
    t.notOk(c.activePatches.indexOf('chord') !== -1);
    H.release(c, 'shift');
    t.eq(c.modifiers.shift, false);
});

test('chord: release shift first exits chord, layer still held', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    t.eq(c.modifiers.chord, true);
    H.release(c, 'shift');
    t.eq(c.modifiers.chord, false);
    t.eq(c.modifiers.shift, false);
    t.notOk(c.activePatches.indexOf('chord') !== -1);
    H.release(c, 'layer');
    t.eq(c.modifiers.chord, false);
});

test('chord: layer first then shift also activates chord', function(t) {
    var c = setup();
    H.press(c, 'layer');        // swaps cue → loop
    H.press(c, 'shift');        // both held → chord
    t.eq(c.modifiers.chord, true);
    t.contains(c.activePatches, 'chord');
});

// ── stack ordering ──────────────────────────────────────────

test('chord: appended last in stack', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    var stack = c._buildStack();
    t.eq(stack[stack.length - 1], 'chord');
});

test('chord: overrides shift companion on same cell', function(t) {
    var c = setup();
    H.press(c, 'shift');
    H.press(c, 'layer');
    var resolved = c._resolveStack(c._buildStack());
    t.eq(resolved.press0.group, 'c');   // chord wins over baseShift
});

test('shift: companion included when modifiers.shift true', function(t) {
    var c = setup();
    H.press(c, 'shift');
    t.contains(c._buildStack(), 'baseShift');
});

test('shift: companion excluded when modifiers.shift false', function(t) {
    var c = setup();
    t.notOk(c._buildStack().indexOf('baseShift') !== -1);
});

// ── shutdownHold ────────────────────────────────────────────

test('shutdownHold: press arms a timer', function(t) {
    var c = H.ctrl();
    c._applyBinding('press3', {func: XoneK3.FUNCS.shutdownHold});
    var b = c.bindings.press3;
    b._func.call(b, [], 0, 0, 127, 0x90);
    t.ok(b._shutdownHoldTimer);
    t.notOk(c._shuttingDown);
});

test('shutdownHold: timer fires → shutdown', function(t) {
    var c = H.ctrl();
    c._applyBinding('press3', {func: XoneK3.FUNCS.shutdownHold});
    var b = c.bindings.press3;
    b._func.call(b, [], 0, 0, 127, 0x90);
    engine._fireOneShots();
    t.ok(c._shuttingDown);
});

test('shutdownHold: release cancels timer', function(t) {
    var c = H.ctrl();
    c._applyBinding('press3', {func: XoneK3.FUNCS.shutdownHold});
    var b = c.bindings.press3;
    b._func.call(b, [], 0, 0, 127, 0x90);
    b._func.call(b, [], 0, 0, 0, 0x80);
    t.eq(b._shutdownHoldTimer, null);
    engine._fireOneShots();
    t.notOk(c._shuttingDown);
});

test('shutdownHold: re-press replaces timer', function(t) {
    var c = H.ctrl();
    c._applyBinding('press3', {func: XoneK3.FUNCS.shutdownHold});
    var b = c.bindings.press3;
    b._func.call(b, [], 0, 0, 127, 0x90);
    var first = b._shutdownHoldTimer;
    b._func.call(b, [], 0, 0, 127, 0x90);
    t.ok(b._shutdownHoldTimer !== first);
});

test('shutdownHold: already shutting down → no-op', function(t) {
    var c = H.ctrl();
    c._shuttingDown = true;
    c._applyBinding('press3', {func: XoneK3.FUNCS.shutdownHold});
    var b = c.bindings.press3;
    b._func.call(b, [], 0, 0, 127, 0x90);
    t.eq(b._shutdownHoldTimer, null);
});