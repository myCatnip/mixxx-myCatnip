'use strict';

var H = require('./helpers');

// toggleTopMode (focus ↔ twoDeck family) and toggleMiniFx
// (twoDeck ↔ twoDeckMini). Uses the real CAT_LAYERS via
// H.bootCat.

function callFunc(c, name, v) {
    var bl = {_ctrl: c};
    XoneK3.FUNCS[name].call(bl, [], 0, 0, (v === undefined) ? 127 : v, 0x90);
}

function has(arr, name) { return arr.indexOf(name) !== -1; }

// ── toggleTopMode ────────────────────────────────────────────

test('toggleTopMode: focus → twoDeck', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    c.setSelectedFor('fx', 'A', 2);
    c.setSelectedFor('fx', 'B', 4);
    callFunc(c, 'toggleTopMode');

    t.notOk(has(c.activePatches, 'topShared'));
    t.notOk(has(c.activePatches, 'fxLayout1'));
    t.ok(has(c.activePatches, 'twoDeck'));
    t.ok(has(c.activePatches, 'fxLayoutA2'));
    t.ok(has(c.activePatches, 'fxLayoutB4'));
    t.ok(has(c.activePatches, 'cue'));
});

test('toggleTopMode: twoDeck → focus', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB2', 'cue']
    });
    c.selectedFxA = 1;
    c.selectedFxB = 2;
    c.setActiveFx('B');   // selectedFxCurrent = 2
    callFunc(c, 'toggleTopMode');

    t.notOk(has(c.activePatches, 'twoDeck'));
    t.notOk(has(c.activePatches, 'fxLayoutA1'));
    t.notOk(has(c.activePatches, 'fxLayoutB2'));
    t.ok(has(c.activePatches, 'topShared'));
    t.ok(has(c.activePatches, 'fxLayout2'));
    t.ok(has(c.activePatches, 'cue'));
});

test('toggleTopMode: twoDeckMini → focus (unwinds both)', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini3', 'cue']});
    c.selectedFxA = 1;
    c.selectedFxB = 3;
    c.setActiveFx('B');
    callFunc(c, 'toggleTopMode');

    t.notOk(has(c.activePatches, 'twoDeckMini'));
    t.notOk(has(c.activePatches, 'fxMini3'));
    t.ok(has(c.activePatches, 'topShared'));
    t.ok(has(c.activePatches, 'fxLayout3'));
    t.ok(has(c.activePatches, 'cue'));
});

test('toggleTopMode: preserves bottom half and overlays', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop']});
    callFunc(c, 'toggleTopMode');
    t.ok(has(c.activePatches, 'loop'));
});

test('toggleTopMode: release event no-op', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    var before = c.activePatches.slice();
    callFunc(c, 'toggleTopMode', 0);
    t.eq(c.activePatches, before);
});

// ── toggleMiniFx ─────────────────────────────────────────────

test('toggleMiniFx: twoDeck → twoDeckMini', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB2', 'cue']
    });
    c.selectedFxA = 1;
    c.setActiveFx('A');   // selectedFxCurrent = 1
    callFunc(c, 'toggleMiniFx');

    t.notOk(has(c.activePatches, 'twoDeck'));
    t.notOk(has(c.activePatches, 'fxLayoutA1'));
    t.notOk(has(c.activePatches, 'fxLayoutB2'));
    t.ok(has(c.activePatches, 'twoDeckMini'));
    t.ok(has(c.activePatches, 'fxMini1'));
    t.ok(has(c.activePatches, 'cue'));
});

test('toggleMiniFx: twoDeckMini → twoDeck', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini3', 'cue']});
    c.selectedFxA = 1;
    c.selectedFxB = 3;
    c.setActiveFx('B');
    callFunc(c, 'toggleMiniFx');

    t.notOk(has(c.activePatches, 'twoDeckMini'));
    t.notOk(has(c.activePatches, 'fxMini3'));
    t.ok(has(c.activePatches, 'twoDeck'));
    t.ok(has(c.activePatches, 'fxLayoutA1'));
    t.ok(has(c.activePatches, 'fxLayoutB3'));
    t.ok(has(c.activePatches, 'cue'));
});

test('toggleMiniFx: no-op from focus', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    var before = c.activePatches.slice();
    callFunc(c, 'toggleMiniFx');
    t.eq(c.activePatches, before);
});

// ── full round-trip ──────────────────────────────────────────

test('mode cycle: focus → twoDeck → mini → twoDeck → focus', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    callFunc(c, 'toggleTopMode');    // → twoDeck
    t.ok(has(c.activePatches, 'twoDeck'));

    callFunc(c, 'toggleMiniFx');     // → mini
    t.ok(has(c.activePatches, 'twoDeckMini'));

    callFunc(c, 'toggleMiniFx');     // → twoDeck
    t.ok(has(c.activePatches, 'twoDeck'));

    callFunc(c, 'toggleTopMode');    // → focus
    t.ok(has(c.activePatches, 'topShared'));
});