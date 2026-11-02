'use strict';

var H = require('./helpers');

// Real mode transitions from each starting preset. Uses the
// chord (shift+layer → pressR / pressL) exactly as in Mixxx.

function enterChord(c) {
    H.press(c, 'shift');
    H.press(c, 'layer');
}

function exitChord(c) {
    H.release(c, 'layer');
    H.release(c, 'shift');
}

function isActive(c, name) { return c.activePatches.indexOf(name) !== -1; }

// ── focus → twoDeck ────────────────────────────────────────

test('chord pressR: focus → twoDeck', function(t) {
    var c = H.bootCat();
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'twoDeck'));
    t.notOk(isActive(c, 'topShared'));
});

test('chord pressR: twoDeck → focus', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']});
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'topShared'));
    t.notOk(isActive(c, 'twoDeck'));
});

test('chord pressR: twoDeckMini → focus', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini1', 'cue']});
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'topShared'));
    t.notOk(isActive(c, 'twoDeckMini'));
});

// ── twoDeck ↔ mini ─────────────────────────────────────────

test('chord pressL: twoDeck → twoDeckMini', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']});
    enterChord(c);
    H.press(c, 'pressL');
    exitChord(c);
    t.ok(isActive(c, 'twoDeckMini'));
    t.notOk(isActive(c, 'twoDeck'));
});

test('chord pressL: twoDeckMini → twoDeck', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini1', 'cue']});
    enterChord(c);
    H.press(c, 'pressL');
    exitChord(c);
    t.ok(isActive(c, 'twoDeck'));
    t.notOk(isActive(c, 'twoDeckMini'));
});

test('chord pressL: no-op from focus', function(t) {
    var c = H.bootCat();
    enterChord(c);
    H.press(c, 'pressL');
    exitChord(c);
    t.ok(isActive(c, 'topShared'));
    t.notOk(isActive(c, 'twoDeckMini'));
});

// ── round-trip: focus → twoDeck → mini → twoDeck → focus ───

test('mode cycle: all four transitions in sequence', function(t) {
    var c = H.bootCat();

    enterChord(c); H.press(c, 'pressR'); H.release(c, 'pressR'); exitChord(c);
    t.ok(isActive(c, 'twoDeck'));

    enterChord(c); H.press(c, 'pressL'); H.release(c, 'pressL'); exitChord(c);
    t.ok(isActive(c, 'twoDeckMini'));

    enterChord(c); H.press(c, 'pressL'); H.release(c, 'pressL'); exitChord(c);
    t.ok(isActive(c, 'twoDeck'));

    enterChord(c); H.press(c, 'pressR'); H.release(c, 'pressR'); exitChord(c);
    t.ok(isActive(c, 'topShared'));
});

// ── fxLayout alignment through mode swaps ──────────────────

test('twoDeck → focus preserves selectedFxCurrent layout', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB2', 'cue'],
        initialFxA: 1, initialFxB: 2, initialActiveFx: 'B'
    });
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'fxLayout2'));
});

test('focus → twoDeck restores both pinned columns', function(t) {
    var c = H.bootCat({initialFxA: 3, initialFxB: 4});
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'fxLayoutA3'));
    t.ok(isActive(c, 'fxLayoutB4'));
});

// ── mode swap carries bottom half ──────────────────────────

test('mode swaps preserve bottom half patch', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop']});
    enterChord(c);
    H.press(c, 'pressR');
    exitChord(c);
    t.ok(isActive(c, 'loop'));
});

// ── FX selection while in twoDeck swaps A/B columns ────────

test('twoDeck: FX A change swaps column A only', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue'],
        initialFxB: 1
    });
    c.setSelectedFor('fx', 'A', 3);
    c._syncFxLayout();
    t.ok(isActive(c, 'fxLayoutA3'));
    t.ok(isActive(c, 'fxLayoutB1'));
});

test('twoDeck: FX B change swaps column B only', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue'],
        initialFxB: 1
    });
    c.setSelectedFor('fx', 'B', 4);
    c._syncFxLayout();
    t.ok(isActive(c, 'fxLayoutA1'));
    t.ok(isActive(c, 'fxLayoutB4'));
});

// ── overlay from chord ─────────────────────────────────────

test('chord press0 opens fxRouting overlay', function(t) {
    var c = H.bootCat();
    enterChord(c);
    H.press(c, 'press0');
    exitChord(c);
    t.ok(isActive(c, 'fxRouting'));
});

test('chord press1 opens selectAB overlay, clears fxRouting', function(t) {
    var c = H.bootCat();
    // Open fxRouting.
    enterChord(c); H.press(c, 'press0'); exitChord(c);
    t.ok(isActive(c, 'fxRouting'));

    // fxRouting shadows the layer button with its own
    // layerExitOverlay. Close it before re-entering the chord.
    H.press(c, 'layer');
    t.notOk(isActive(c, 'fxRouting'));

    enterChord(c); H.press(c, 'press1'); exitChord(c);
    t.ok(isActive(c, 'selectAB'));
    t.notOk(isActive(c, 'fxRouting'));
});

test('overlay toggle is mutually exclusive', function(t) {
    var c = H.bootCat();
    enterChord(c); H.press(c, 'press0'); exitChord(c);
    t.ok(isActive(c, 'fxRouting'));
    H.press(c, 'layer');
    enterChord(c); H.press(c, 'press1'); exitChord(c);
    t.ok(isActive(c, 'selectAB'));
    t.notOk(isActive(c, 'fxRouting'));
});

test('overlay closed by layer button', function(t) {
    var c = H.bootCat();
    enterChord(c); H.press(c, 'press0'); exitChord(c);
    t.ok(isActive(c, 'fxRouting'));
    H.press(c, 'layer');
    t.notOk(isActive(c, 'fxRouting'));
});

// ── layering in overlay mode still shows bottom grid ───────

test('fxRouting overlay leaves cue layer active', function(t) {
    var c = H.bootCat();
    enterChord(c); H.press(c, 'press0'); exitChord(c);
    t.ok(isActive(c, 'cue'));
    t.ok(c._patchActive('fxRouting'));
});