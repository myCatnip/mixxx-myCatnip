// inpulse500.js — entry
'use strict';

myCatnip.init = function() {
    myCatnip.applyPacing(myCatnip.HW_INPULSE500.pacing);
    myCatnip.applyIP500Jog({});

    myCatnip._bootWith([{
        label: 'Inpulse 500',
        hw: myCatnip.HW_INPULSE500,
        midiChannel: 0,
        sysex: false,
        perceptionMixActive: false,

        initialDeckA: 1, initialDeckB: 2,
        initialFxA: 1,   initialFxB: 2,
        initialActiveDeck: 'A',
        initialActiveFx: 'A',
        initialPatches: ['master', 'deckA_hotcue', 'deckB_hotcue'],

        patches: myCatnip.IP500_LAYERS,
        modifierStates: {},

        initialVinylMode: true,
        browserOffFocus: false,
        beatmatchGuideMode: 'guide'    // 'guide' (tempo assist) | 'markers' (deck selection)
    }], myCatnip.InpulseController, 'Inpulse 500');
};

myCatnip.shutdown = function() { myCatnip.halt(); };