// config/k3-cat-config.js — Cat's layer tree, boot defaults,
// bootCat helper. Assumes config/k3-cat-schemes.js, k3-cat-fx.js,
// k3-cat-top.js, k3-cat-bottom.js, k3-cat-overlays.js have already
// loaded (each registers on myCatnip.CAT).

'use strict';

var CAT = myCatnip.CAT;

// ============================================================
// LAYER TREE
// ============================================================
var CAT_LAYERS = {
    // Top — focus mode
    topShared:        CAT.TOP_SHARED,
    topShift:         CAT.TOP_SHIFT,
    fxLayout1:        CAT.fxLayout(1),
    fxLayout2:        CAT.fxLayout(2),
    fxLayout3:        CAT.fxLayout(3),
    fxLayout4:        CAT.fxLayout(4),

    // Top — twoDeck mode
    twoDeck:          CAT.TWO_DECK,
    fxLayoutA1:       CAT.twoDeckFxLayout('A', 1),
    fxLayoutA2:       CAT.twoDeckFxLayout('A', 2),
    fxLayoutA3:       CAT.twoDeckFxLayout('A', 3),
    fxLayoutA4:       CAT.twoDeckFxLayout('A', 4),
    fxLayoutB1:       CAT.twoDeckFxLayout('B', 1),
    fxLayoutB2:       CAT.twoDeckFxLayout('B', 2),
    fxLayoutB3:       CAT.twoDeckFxLayout('B', 3),
    fxLayoutB4:       CAT.twoDeckFxLayout('B', 4),

    // Top — twoDeck mini FX mode
    twoDeckMini:      CAT.TWO_DECK_MINI,
    fxMini1:          CAT.twoDeckMiniFxLayout(1),
    fxMini2:          CAT.twoDeckMiniFxLayout(2),
    fxMini3:          CAT.twoDeckMiniFxLayout(3),
    fxMini4:          CAT.twoDeckMiniFxLayout(4),

    // Bottom
    cue:              CAT.CUE,
    cueShift:         CAT.CUE_SHIFT,
    hotcue2:          CAT.CUE_2,
    hotcue2Shift:     CAT.CUE_2_SHIFT,
    loop:             CAT.LOOP,
    loopShift:        CAT.LOOP_SHIFT,
    loopOdd:          CAT.LOOP_ODD,
    loopOddShift:     CAT.LOOP_ODD_SHIFT,

    // Overlays
    selectAB:         CAT.SELECT_AB,
    selectABShift:    CAT.SELECT_AB_SHIFT,
    fxRouting:        CAT.FX_ROUTING,
    fxRoutingShift:   CAT.FX_ROUTING_SHIFT,

    chord:            CAT.CHORD
};

// ============================================================
// BOOT DEFAULTS
// ============================================================
var BOOT_DEFAULTS = {
    label: 'Cat',
    initialDeckA: 1, initialDeckB: 3,
    initialFxA: 1,   initialFxB: 4,
    initialActiveDeck: 'A',
    initialActiveFx:   'A',
    initialPatches: ['topShared', 'fxLayout1', 'cue'],
    timeSig: null,

    // Modifier-state system (see lib/controller.js).
    //   heldBy        — modifier is active while EVERY listed
    //                   binding has an active transaction.
    //   recompute     — trigger _recompute on state change.
    //   patchActivate — idempotently add/remove this patch on
    //                   state change (and enforce on every
    //                   event, so out-of-band removals by
    //                   config funcs are corrected).
    modifierStates: {
        shift:   { heldBy: ['shift'], recompute: true },
        chord:   { heldBy: ['shift', 'layer'], patchActivate: 'chord' },
        loadArm: { heldBy: ['pressR'] },
        bpmPressHeld: { heldBy: ['pressL'] }
    }
};

// ============================================================
// BOOT
// ============================================================
function bootCat(overrides) {
    overrides = overrides || {};
    var hw = overrides.hw || myCatnip.HW_K3;
    myCatnip.applyPacing(hw.pacing);
    var cfg = Object.assign({}, hw.DEFAULTS, BOOT_DEFAULTS, overrides);
    cfg.hw = hw;
    if (!cfg.patches) cfg.patches = CAT_LAYERS;
    myCatnip.boot([cfg]);
}

// Backward-compat globals for legacy configs / test helpers.
myCatnip.CAT_LAYERS = CAT_LAYERS;
myCatnip.bootCat = bootCat;