// k3-cat.js — Cat preset entry module.
//
// Loaded last by k3-cat.midi.xml <scriptfiles>. Defines
// myCatnip.init / myCatnip.shutdown, called by the XML <controls>
// block. Input routing happens inside hw.wireInputs via
// midi.makeInputHandler — no per-message handling here.

'use strict';

myCatnip.init = function() { myCatnip.bootCat({}); };
myCatnip.shutdown = function() { myCatnip.halt(); };
