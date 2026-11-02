// myCatnip-kitten.js — Kitten preset: Cat's layers, different boot.
//
// Loads after cat.js. Reuses myCatnip.CAT_LAYERS via myCatnip.bootCat.
// Only differences from Cat: channel 0x0D, initial slots pinned
// to decks 2/4 and FX units 2/4. Both activeDeck and activeFx
// boot to side A (deck 2 / FX 2).

'use strict';

(function() {
    if (typeof myCatnip === 'undefined') {
        throw new Error('Xone K3: <filename> — myCatnip-lib-core.js must load first');
    }
    
    if (typeof myCatnip._requireLoad !== 'function') {
        throw new Error('Xone K3: myCatnip-kitten.js — myCatnip-cat.js must load first');
    }
    myCatnip._requireLoad('myCatnip-kitten.js', ['bootCat', 'CAT_LAYERS']);

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
})();