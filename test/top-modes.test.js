'use strict';

var H = require('./helpers');

// XoneK3.TOP_MODES table, currentTopMode, setTopMode.

// ── TOP_MODES shape ────────────────────────────────────────

test('TOP_MODES: three modes declared', function(t) {
    t.hasKey(XoneK3.TOP_MODES, 'focus');
    t.hasKey(XoneK3.TOP_MODES, 'twoDeck');
    t.hasKey(XoneK3.TOP_MODES, 'twoDeckMini');
});

test('TOP_MODES.focus: owns includes base + four layouts', function(t) {
    var owns = XoneK3.TOP_MODES.focus.owns;
    t.contains(owns, 'topShared');
    t.contains(owns, 'fxLayout1');
    t.contains(owns, 'fxLayout2');
    t.contains(owns, 'fxLayout3');
    t.contains(owns, 'fxLayout4');
});

test('TOP_MODES.twoDeck: owns includes both column families', function(t) {
    var owns = XoneK3.TOP_MODES.twoDeck.owns;
    t.contains(owns, 'twoDeck');
    t.contains(owns, 'fxLayoutA1');
    t.contains(owns, 'fxLayoutB4');
});

test('TOP_MODES.twoDeckMini: owns includes mini family', function(t) {
    var owns = XoneK3.TOP_MODES.twoDeckMini.owns;
    t.contains(owns, 'twoDeckMini');
    t.contains(owns, 'fxMini1');
    t.contains(owns, 'fxMini4');
});

// ── currentTopMode ─────────────────────────────────────────

test('currentTopMode: focus', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    t.eq(c.currentTopMode(), 'focus');
});

test('currentTopMode: twoDeck', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']});
    t.eq(c.currentTopMode(), 'twoDeck');
});

test('currentTopMode: twoDeckMini', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini1', 'cue']});
    t.eq(c.currentTopMode(), 'twoDeckMini');
});

test('currentTopMode: null if no mode base present', function(t) {
    var c = H.bootCat({initialPatches: ['cue']});
    t.eq(c.currentTopMode(), null);
});

// ── setTopMode: focus ──────────────────────────────────────

test('setTopMode focus: from twoDeck', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue'],
        initialFxA: 1, initialFxB: 1, initialActiveFx: 'A'
    });
    c.setTopMode('focus');
    t.contains(c.activePatches, 'topShared');
    t.contains(c.activePatches, 'fxLayout1');
    t.notOk(c.activePatches.indexOf('twoDeck') !== -1);
    t.notOk(c.activePatches.indexOf('fxLayoutA1') !== -1);
    t.notOk(c.activePatches.indexOf('fxLayoutB1') !== -1);
});

test('setTopMode focus: from twoDeckMini', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeckMini', 'fxMini2', 'cue'],
        initialActiveFx: 'B', initialFxA: 2, initialFxB: 3
    });
    c.setTopMode('focus');
    t.contains(c.activePatches, 'topShared');
    t.contains(c.activePatches, 'fxLayout3');   // selectedFxCurrent = selectedFxB = 3
    t.notOk(c.activePatches.indexOf('twoDeckMini') !== -1);
    t.notOk(c.activePatches.indexOf('fxMini2') !== -1);
});

// ── setTopMode: twoDeck ────────────────────────────────────

test('setTopMode twoDeck: from focus', function(t) {
    var c = H.bootCat({
        initialPatches: ['topShared', 'fxLayout2', 'cue'],
        initialFxA: 2, initialFxB: 4, initialActiveFx: 'A'
    });
    c.setTopMode('twoDeck');
    t.contains(c.activePatches, 'twoDeck');
    t.contains(c.activePatches, 'fxLayoutA2');
    t.contains(c.activePatches, 'fxLayoutB4');
    t.notOk(c.activePatches.indexOf('topShared') !== -1);
    t.notOk(c.activePatches.indexOf('fxLayout2') !== -1);
});

test('setTopMode twoDeck: from twoDeckMini', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeckMini', 'fxMini1', 'cue'],
        initialFxA: 1, initialFxB: 3
    });
    c.setTopMode('twoDeck');
    t.contains(c.activePatches, 'twoDeck');
    t.contains(c.activePatches, 'fxLayoutA1');
    t.contains(c.activePatches, 'fxLayoutB3');
    t.notOk(c.activePatches.indexOf('twoDeckMini') !== -1);
    t.notOk(c.activePatches.indexOf('fxMini1') !== -1);
});

// ── setTopMode: twoDeckMini ────────────────────────────────

test('setTopMode twoDeckMini: from twoDeck', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB3', 'cue'],
        initialFxA: 1, initialFxB: 3, initialActiveFx: 'B'
    });
    c.setTopMode('twoDeckMini');
    t.contains(c.activePatches, 'twoDeckMini');
    t.contains(c.activePatches, 'fxMini3');
    t.notOk(c.activePatches.indexOf('twoDeck') !== -1);
    t.notOk(c.activePatches.indexOf('fxLayoutA1') !== -1);
});

// ── preserves bottom half and overlays ─────────────────────

test('setTopMode preserves bottom half', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop']});
    c.setTopMode('twoDeck');
    t.contains(c.activePatches, 'loop');
});

test('setTopMode preserves overlays', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'selectAB']});
    c.setTopMode('twoDeck');
    t.contains(c.activePatches, 'selectAB');
});

// ── batch: single recompute ────────────────────────────────

test('setTopMode: one recompute, not one per patch', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']
    });
    var count = 0;
    var orig = c._recompute.bind(c);
    c._recompute = function() { count++; return orig(); };

    c.setTopMode('focus');
    // Focus removes 5, adds 2 → without batching that'd be many.
    t.eq(count, 1);
});

// ── unknown mode ───────────────────────────────────────────

test('setTopMode unknown: no change, prints warning', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    var before = c.activePatches.slice();
    _printLog.length = 0;
    c.setTopMode('nonsense');
    t.eq(c.activePatches, before);
    t.contains(_printLog.join('\n'), 'unknown top mode');
});

// ── PATCH_NAMES used consistently ──────────────────────────

test('PATCH_NAMES: has every referenced name', function(t) {
    var P = XoneK3.PATCH_NAMES;
    var required = [
        'FOCUS_BASE', 'FOCUS_LAYOUT', 'TWODECK_BASE',
        'TWODECK_A_LAYOUT', 'TWODECK_B_LAYOUT',
        'MINI_BASE', 'MINI_LAYOUT',
        'CHORD', 'CUE', 'LOOP'
    ];
    for (var i = 0; i < required.length; i++) {
        t.ok(P[required[i]] !== undefined, required[i]);
    }
});