'use strict';

var H = require('./helpers');

// _refreshActiveAlt, setSelectedFor, setActiveDeck, setActiveFx,
// _refreshDisplayFlags, _reapplyByTokens, _resolveFxPatchName,
// _syncFxLayout.

// ── _refreshActiveAlt ────────────────────────────────────────

test('_refreshActiveAlt: deck side A', function(t) {
    var c = H.ctrl();
    c.selectedDeckA = 1;
    c.selectedDeckB = 4;
    c.activeDeck = 'A';
    c._refreshActiveAlt();
    t.eq(c.selectedDeckCurrent, 1);
    t.eq(c.selectedDeckAlt, 4);
});

test('_refreshActiveAlt: deck side B', function(t) {
    var c = H.ctrl();
    c.selectedDeckA = 1;
    c.selectedDeckB = 4;
    c.activeDeck = 'B';
    c._refreshActiveAlt();
    t.eq(c.selectedDeckCurrent, 4);
    t.eq(c.selectedDeckAlt, 1);
});

test('_refreshActiveAlt: fx side A', function(t) {
    var c = H.ctrl();
    c.selectedFxA = 2;
    c.selectedFxB = 3;
    c.activeFx = 'A';
    c._refreshActiveAlt();
    t.eq(c.selectedFxCurrent, 2);
    t.eq(c.selectedFxAlt, 3);
});

test('_refreshActiveAlt: fx side B', function(t) {
    var c = H.ctrl();
    c.selectedFxA = 2;
    c.selectedFxB = 3;
    c.activeFx = 'B';
    c._refreshActiveAlt();
    t.eq(c.selectedFxCurrent, 3);
    t.eq(c.selectedFxAlt, 2);
});

// ── _refreshDisplayFlags ─────────────────────────────────────

test('_refreshDisplayFlags: track when no virtual clock', function(t) {
    var c = H.ctrl();
    c.selectedDeckA = 1;
    c.setActiveDeck('A');
    c._refreshDisplayFlags();
    t.eq(c.activeDeckVirtual, false);
    t.eq(c.activeLoopVirtual, false);
    t.eq(c.activeDisplaySource, 'track');
});

test('_refreshDisplayFlags: reads active deck state', function(t) {
    var c = H.ctrl();
    c.selectedDeckA = 1;
    c.setActiveDeck('A');
    c._decks[1].displaySource = 'loop';
    c._decks[1].loopClock.running = true;
    c._refreshDisplayFlags();
    t.eq(c.activeDisplaySource, 'loop');
    t.eq(c.activeLoopVirtual, true);
    t.eq(c.activeDeckVirtual, true);
});

// ── setSelectedFor ───────────────────────────────────────────

test('setSelectedFor: sets and refreshes derived fields', function(t) {
    var c = H.ctrl();
    c.selectedFxA = 1;
    c.activeFx = 'A';
    c._refreshActiveAlt();
    c.setSelectedFor('fx', 'A', 3);
    t.eq(c.selectedFxA, 3);
    t.eq(c.selectedFxCurrent, 3);
});

test('setSelectedFor: same value no-op', function(t) {
    var c = H.ctrl();
    c.selectedFxA = 2;
    c.setSelectedFor('fx', 'A', 2);
    t.eq(c.selectedFxA, 2);
});

test('setSelectedFor: out-of-range rejected', function(t) {
    var c = H.ctrl();
    c.selectedFxA = 2;
    c.setSelectedFor('fx', 'A', 0);
    t.eq(c.selectedFxA, 2);
    c.setSelectedFor('fx', 'A', 5);
    t.eq(c.selectedFxA, 2);
});

test('setSelectedFor: rebinds a $FX_ACTIVE$ binding on active side', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c.selectedFxA = 1;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$FX_ACTIVE$', inKey: 'enabled'});
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit1]');
    c.setSelectedFor('fx', 'A', 3);
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit3]');
});

test('setSelectedFor: inactive side does not rebind $FX_ACTIVE$', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c.selectedFxA = 1;
    c.selectedFxB = 2;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$FX_ACTIVE$', inKey: 'enabled'});
    var before = c.bindings.press0.group;
    c.setSelectedFor('fx', 'B', 4);
    t.eq(c.bindings.press0.group, before);
});

test('setSelectedFor: rebinds a $FX_ALT$ binding when alt side changes', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c.selectedFxA = 1;
    c.selectedFxB = 2;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$FX_ALT$', inKey: 'enabled'});
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit2]');
    c.setSelectedFor('fx', 'B', 4);
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit4]');
});

// ── setActiveDeck / setActiveFx ──────────────────────────────

test('setActiveDeck: flips which deck $DECK_ACTIVE$ resolves to', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    c.selectedDeckA = 1;
    c.selectedDeckB = 3;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$DECK_ACTIVE$', inKey: 'play'});
    t.eq(c.bindings.press0.group, '[Channel1]');
    c.setActiveDeck('B');
    t.eq(c.bindings.press0.group, '[Channel3]');
});

test('setActiveDeck: same slot no-op', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    c.setActiveDeck('A');
    t.eq(c.activeDeck, 'A');
});

test('setActiveDeck: invalid slot no-op', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    c.setActiveDeck('Z');
    t.eq(c.activeDeck, 'A');
});

test('setActiveFx: flips which side $FX_ACTIVE$ resolves to', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c.selectedFxA = 1;
    c.selectedFxB = 4;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$FX_ACTIVE$', inKey: 'enabled'});
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit1]');
    c.setActiveFx('B');
    t.eq(c.bindings.press0.group, '[EffectRack1_EffectUnit4]');
});

test('setActiveFx: same slot no-op', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c.setActiveFx('A');
    t.eq(c.activeFx, 'A');
});

// ── _reapplyByTokens ─────────────────────────────────────────

test('_reapplyByTokens: rebinds token-using bindings only', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    c.selectedDeckA = 1;
    c.selectedDeckB = 2;
    c.activeFx = 'A';
    c.selectedFxA = 1;
    c._refreshActiveAlt();
    c._applyBinding('press0', {group: '$DECK_ACTIVE$', inKey: 'play'});
    c._applyBinding('press1', {group: '$FX_ACTIVE$',   inKey: 'enabled'});
    c._applyBinding('press2', {group: '[Master]',      inKey: 'gain'});

    c.selectedDeckA = 3;
    c._refreshActiveAlt();
    c._reapplyByTokens(['$DECK_ACTIVE$', '$DECK_ACTIVE_N$']);

    t.eq(c.bindings.press0.group, '[Channel3]');
    t.eq(c.bindings.press1.group, '[EffectRack1_EffectUnit1]');
    t.eq(c.bindings.press2.group, '[Master]');
});

// ── _resolveFxPatchName ──────────────────────────────────────

test('_resolveFxPatchName: non-fx name → undefined', function(t) {
    var c = H.ctrl();
    t.eq(c._resolveFxPatchName('cue'),      undefined);
    t.eq(c._resolveFxPatchName('topShared'), undefined);
});

test('_resolveFxPatchName: missing target → null', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('fx', 'A', 2);
    t.eq(c._resolveFxPatchName('fxLayoutA1'), null);
});

test('_resolveFxPatchName: existing target returns name', function(t) {
    var c = H.ctrl({patches: {fxLayoutA1: {}, fxLayoutA2: {}}});
    c.setSelectedFor('fx', 'A', 2);
    t.eq(c._resolveFxPatchName('fxLayoutA1'), 'fxLayoutA2');
});

test('_resolveFxPatchName: focus pattern uses selectedFxCurrent', function(t) {
    var c = H.ctrl({patches: {fxLayout1: {}, fxLayout3: {}}});
    c.selectedFxA = 1;
    c.selectedFxB = 3;
    c.setActiveFx('B');
    t.eq(c._resolveFxPatchName('fxLayout1'), 'fxLayout3');
});

test('_resolveFxPatchName: mini pattern uses selectedFxCurrent', function(t) {
    var c = H.ctrl({patches: {fxMini2: {}, fxMini4: {}}});
    c.selectedFxA = 2;
    c.selectedFxB = 4;
    c.setActiveFx('B');
    t.eq(c._resolveFxPatchName('fxMini2'), 'fxMini4');
});

test('_resolveFxPatchName: LayoutB uses selectedFxB', function(t) {
    var c = H.ctrl({patches: {fxLayoutB1: {}, fxLayoutB3: {}}});
    c.setSelectedFor('fx', 'B', 3);
    t.eq(c._resolveFxPatchName('fxLayoutB1'), 'fxLayoutB3');
});

// ── _syncFxLayout ────────────────────────────────────────────

test('_syncFxLayout: noop when nothing to swap', function(t) {
    var c = H.ctrl({patches: {fxLayout1: {}}});
    c.setSelectedFor('fx', 'A', 1);
    c.activePatches = ['fxLayout1'];
    var r = c._syncFxLayout();
    t.eq(r.swapped, false);
    t.eq(r.reason, 'noop');
});

test('_syncFxLayout: swaps on differing target', function(t) {
    var c = H.ctrl({patches: {fxLayout1: {}, fxLayout2: {}}});
    c.setSelectedFor('fx', 'A', 2);
    c.activePatches = ['fxLayout1'];
    var r = c._syncFxLayout();
    t.eq(r.swapped, true);
    t.eq(c.activePatches[0], 'fxLayout2');
});

test('_syncFxLayout: missing target reports "missing"', function(t) {
    var c = H.ctrl({patches: {fxLayout1: {}}});
    c.setSelectedFor('fx', 'A', 2);
    c.activePatches = ['fxLayout1'];
    var r = c._syncFxLayout();
    t.eq(r.swapped, false);
    t.eq(r.reason, 'missing');
});

test('_syncFxLayout: both A and B columns swap independently', function(t) {
    var c = H.ctrl({patches: {
        fxLayoutA1: {}, fxLayoutA3: {},
        fxLayoutB1: {}, fxLayoutB2: {}
    }});
    c.setSelectedFor('fx', 'A', 3);
    c.setSelectedFor('fx', 'B', 2);
    c.activePatches = ['fxLayoutA1', 'fxLayoutB1'];
    c._syncFxLayout();
    t.eq(c.activePatches[0], 'fxLayoutA3');
    t.eq(c.activePatches[1], 'fxLayoutB2');
});

test('_syncFxLayout: non-fx patches untouched', function(t) {
    var c = H.ctrl({patches: {
        topShared: {}, fxLayout1: {}, fxLayout2: {}
    }});
    c.setSelectedFor('fx', 'A', 2);
    c.activePatches = ['topShared', 'fxLayout1', 'cue'];
    c._syncFxLayout();
    t.eq(c.activePatches[0], 'topShared');
    t.eq(c.activePatches[1], 'fxLayout2');
    t.eq(c.activePatches[2], 'cue');
});

test('_reapplyByTokens: skips when resolved-target hash unchanged', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    c.selectedDeckA = 1;
    c.selectedDeckB = 1;   // both slots point at channel 1
    c._refreshActiveAlt();
    c._applyBinding('press0', { group: '$DECK_ACTIVE$', inKey: 'play' });

    var applied = 0;
    var orig = c._applyOneSafe.bind(c);
    c._applyOneSafe = function() { applied++; return orig.apply(this, arguments); };

    c.setActiveDeck('B');   // slot B, but same channel → same hash
    t.eq(applied, 0, 'no rebind when resolved target hash unchanged');
});