// k3-onek3.js — oneK3 preset entry module.
//
// Cat's layer tree, twoDeck boot. Loaded last by k3-onek3.midi.xml
// <scriptfiles>.

'use strict';

myCatnip.init = function() {
    myCatnip.bootCat({
        label: 'oneK3',
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']
    });
};
myCatnip.shutdown = function() { myCatnip.halt(); };
