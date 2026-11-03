// test/hw-custom.mjs — test fixture hardware with N-sample
// PERCEPTION. Proves the sample-derivation path end-to-end.
// Same transport surface as HW_FAKE (brightness-only); the
// perception model is what differentiates them.

import { myCatnip } from '../lib/core.mjs';
import '../lib/binding.mjs';
import '../lib/timing.mjs';

var CH = 0x00;

myCatnip.HW_CUSTOM = {
    name: 'HW_CUSTOM',

    DEFAULTS: { midiChannel: CH, sysex: false },
    pacing: {},

    PERCEPTION: {
        samples: [
            { step: 1.00, rgb: [127, 127, 127] },
            { step: 0.75, rgb: [ 90,  90,  90] },
            { step: 0.50, rgb: [ 60,  60,  60] },
            { step: 0.25, rgb: [ 30,  30,  30] },
            { step: 0.00, rgb: [  0,   0,   0] }
        ],
        mode: { mix: 'correct', brightness: 'own' }
    },

    PALETTE: {
        off:    [0, 0, 0],
        red:    [127, 0, 0],
        green:  [0, 127, 0],
        blue:   [0, 0, 127],
        white:  [127, 127, 127]
    },

    buildBindings: function(ctrl) {
        var bindings = {};
        for (var i = 0; i < 4; i++) {
            bindings['encoder' + i] = new myCatnip.Binding(
                'encoder' + i,
                { midi: [0xB0 + CH, 0x00 + i],
                  type: 'encoder', idx: -1 }, ctrl);
        }
        for (var p = 0; p < 4; p++) {
            bindings['press' + p] = new myCatnip.Binding(
                'press' + p,
                { midi: [0x90 + CH, 0x40 + p],
                  type: 'button', idx: p }, ctrl);
        }
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                bindings['grid' + c + '_' + r] = new myCatnip.Binding(
                    'grid' + c + '_' + r,
                    { midi: [0x90 + CH, 0x50 + r * 4 + c],
                      type: 'button', idx: 4 + r * 4 + c }, ctrl);
            }
        }
        bindings.ledPower = new myCatnip.Binding(
            'ledPower', { idx: 20 }, ctrl);
        return bindings;
    },

    wireInputs: function(ctrl) {
        var noteOff = 0x80 + CH;
        for (var name in ctrl.bindings) {
            var b = ctrl.bindings[name];
            if (!b.midi) continue;
            (function(b) {
                function cb(_ch, _cc, v, s) {
                    if (b.input) b.input(_ch, _cc, v, s);
                }
                midi.makeInputHandler(b.midi[0], b.midi[1], cb);
                if ((b.midi[0] & 0xF0) === 0x90) {
                    midi.makeInputHandler(noteOff, b.midi[1], cb);
                }
            })(b);
        }
    },

    send: function(ctrl, idx, rgb, hw) {
        var lum = Math.max(rgb[0], rgb[1], rgb[2]);
        var vel = Math.round(hw * lum / 127);
        midi.sendShortMsg(0x90 + CH, this._noteFor(idx), vel);
    },

    _noteFor: function(idx) {
        if (idx < 4)  return 0x40 + idx;
        if (idx < 20) return 0x50 + (idx - 4);
        return 0x60 + (idx - 20);
    },

    blank: function(ctrl) {
        for (var idx = 0; idx <= 20; idx++) {
            midi.sendShortMsg(0x90 + CH, this._noteFor(idx), 0);
        }
    },

    anyPendingWrites: function(ctrl) { return false; },

    decodeLedCache: function(val) {
        if (typeof val !== 'number') return String(val);
        return ((val >>> 21) & 0x7F) + ':' +
               ((val >>> 14) & 0x7F) + ':' +
               ((val >>> 7)  & 0x7F) + ':' +
               ( val         & 0x7F);
    }
};

export { myCatnip };