// myCatnip-onek3-minifx.js — oneK3 miniFX preset: Cat's layers,
// twoDeckMini boot.
//
// Loads Cat's layer tree verbatim. Boots with twoDeckMini as the
// top half — two pinned decks, one focused FX unit spanning both
// middle columns.
//
// Chord pressL swaps to twoDeck, pressR swaps to focus. Same
// layer tree as Cat, Kitten, and oneK3.

'use strict';

(function() {
    if (typeof myCatnip === 'undefined') {
        throw new Error('Xone K3: <filename> — myCatnip-lib-core.js must load first');
    }
    
    if (typeof myCatnip._requireLoad !== 'function') {
        throw new Error('Xone K3: myCatnip-onek3-minifx.js — myCatnip-cat.js must load first');
    }
    myCatnip._requireLoad('myCatnip-onek3-minifx.js', ['bootCat', 'CAT_LAYERS']);

    myCatnip.init = function() {
        myCatnip.bootCat({
            label: 'oneK3 miniFX',
            initialPatches: ['twoDeckMini', 'fxMini1', 'cue']
        });
    };
    myCatnip.shutdown = function() { myCatnip.halt(); };
})();