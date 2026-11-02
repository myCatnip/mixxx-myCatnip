// myCatnip-cat.js — Cat preset assembler. Loads LAST of the
// cat-* files (needs their exports).
//
// Kitten / oneK3 / oneK3 miniFX load this file last and override
// myCatnip.init with their own bootCat() call. colorLab loads this
// file, then lab.js, then colorlab.js — colorlab.js overrides
// init.
//
// bootCat resolves the hardware descriptor (overrides.hw ||
// myCatnip.HW_K3), applies that hardware's pacing overrides to
// myCatnip.TIMING (idempotent — _bootWith also calls applyPacing,
// for direct myCatnip.boot(cfg) callers), and merges the hardware's
// DEFAULTS into cfg before BOOT_DEFAULTS and per-preset overrides.
// Presets that want a different controller (channel, calibration,
// sysex mode) override the corresponding field on the overrides
// object — nothing hardware-level needs to appear in a preset's
// BOOT_DEFAULTS.

'use strict';

(function() {
    if (typeof myCatnip === 'undefined') {
        throw new Error('Xone K3: <filename> — myCatnip-lib-core.js must load first');
    }
    if (typeof myCatnip._requireLoad !== 'function') {
        throw new Error('Xone K3: myCatnip-cat.js — myCatnip-lib-core.js must load first');
    }
    myCatnip._requireLoad('myCatnip-cat.js',
        ['CAT', 'HW_K3', 'applyPacing', 'boot', 'halt']);

    var CAT = myCatnip.CAT;

    // ============================================================
    // LAYER TREE
    // ============================================================
    myCatnip.CAT_LAYERS = {
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
    // BOOT
    // ============================================================
    // Preset-generic boot defaults. Hardware-level defaults
    // (midiChannel, sysex, calibration data) come from
    // myCatnip.HW_K3.DEFAULTS — see bootCat below. Presets that
    // need a different hw pass it via overrides.hw.
    var BOOT_DEFAULTS = {
        label: 'Cat',
        initialDeckA: 1, initialDeckB: 3,
        initialFxA: 1,   initialFxB: 4,
        initialActiveDeck: 'A',
        initialActiveFx:   'A',
        initialPatches: ['topShared', 'fxLayout1', 'cue'],
        timeSig: null,

        // Modifier-state system (see lib-controller.js).
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

    myCatnip.bootCat = function(overrides) {
        overrides = overrides || {};
        var hw = overrides.hw || myCatnip.HW_K3;
        // Apply pacing here as well as in _bootWith — this closes
        // the window between building cfg and calling boot, where
        // any code reading TIMING would otherwise see stale values
        // from the previous preset. Both calls are idempotent
        // (applyPacing resets from defaults first).
        myCatnip.applyPacing(hw.pacing);
        var cfg = Object.assign({}, hw.DEFAULTS, BOOT_DEFAULTS, overrides);
        cfg.hw = hw;
        if (!cfg.patches) cfg.patches = myCatnip.CAT_LAYERS;
        myCatnip.boot([cfg]);
    };

    myCatnip.init = function() { myCatnip.bootCat({}); };
    myCatnip.shutdown = function() { myCatnip.halt(); };
})();