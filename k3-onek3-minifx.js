// k3-onek3-minifx.js — oneK3 miniFX preset entry module.
//
// Cat's layer tree, twoDeckMini boot. Loaded last by
// k3-onek3-minifx.midi.xml <scriptfiles>.

'use strict';

myCatnip.init = function() {
    myCatnip.bootCat({
        label: 'oneK3 miniFX',
        initialPatches: ['twoDeckMini', 'fxMini1', 'cue']
    });
};
myCatnip.shutdown = function() { myCatnip.halt(); };
