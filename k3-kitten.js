// k3-kitten.js — Kitten preset entry module.
//
// Second K3 unit on ch 0x0D. Reuses Cat layers, different boot.
// Loaded last by k3-kitten.midi.xml <scriptfiles>.

'use strict';

myCatnip.init = function() {
    myCatnip.bootCat({
        label: 'Kitten',
        midiChannel: 0x0D,
        initialDeckA: 2, initialDeckB: 4,
        initialFxA: 2,   initialFxB: 4,
        initialActiveDeck: 'A',
        initialActiveFx:   'A'
    });
};
myCatnip.shutdown = function() { myCatnip.halt(); };
