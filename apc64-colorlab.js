// apc64-colorlab.js — entry. Called by <controls> in the XML.

'use strict';

myCatnip.init = function() {
    myCatnip.applyPacing(myCatnip.HW_APC64.pacing || {});
    myCatnip._bootWith([{
        label: 'APC64',
        hw: myCatnip.HW_APC64,
        midiChannel: 0,
        sysex: false,
        Ctor: myCatnip.APC64ColorLabController,
        initialPatches: ['apc64Lab'],
        patches: { apc64Lab: myCatnip.APC64_LAB_LAYER },
        modifierStates: {}
    }], myCatnip.APC64ColorLabController, 'APC64');
};

myCatnip.shutdown = function() { myCatnip.halt(); };