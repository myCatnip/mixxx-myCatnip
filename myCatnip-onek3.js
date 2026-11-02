// myCatnip-onek3.js — oneK3 preset: Cat's layers, twoDeck boot.
//
// Loads Cat's layer tree verbatim. Boots with twoDeck as the top
// half instead of topShared + fxLayout<n>. Same physical controls,
// same bottom half, same overlays — only the starting top half
// differs.
//
// Chord pressR swaps to focus mode and back (F.toggleTopMode).

'use strict';

(function() {
    if (typeof myCatnip === 'undefined') {
        throw new Error('Xone K3: <filename> — myCatnip-lib-core.js must load first');
    }
    
    if (typeof myCatnip._requireLoad !== 'function') {
        throw new Error('Xone K3: myCatnip-onek3.js — myCatnip-cat.js must load first');
    }
    myCatnip._requireLoad('myCatnip-onek3.js', ['bootCat', 'CAT_LAYERS']);

    myCatnip.init = function() {
        myCatnip.bootCat({
            label: 'oneK3',
            initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']
        });
    };
    myCatnip.shutdown = function() { myCatnip.halt(); };
})();