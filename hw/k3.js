// hw/k3.js — Xone K3 hardware descriptor.
//
// HAL contract:
//   hw.DEFAULTS             boot defaults (midiChannel, sysex)
//   hw.pacing               TIMING overrides
//   hw.LED_TRANSFERS        raw [hw, lum] curve blocks (named)
//   hw.PERCEPTION           perception model:
//                             { curves | samples | custom,
//                               wbGain?, weights?, gamma?, hkBoost?,
//                               mode: { mix, brightness } }
//   hw.PALETTE              named colour RGB table
//   hw.MIXXX_COLORS         Mixxx hex → RGB table
//   hw.DEFAULT_RGB_BRIGHTNESS / _OFF   on/off brightness
//
//   hw.buildBindings(ctrl)    -> { name: Binding, ... }
//   hw.wireInputs(ctrl)       -> void
//   hw.send(ctrl, idx, rgb, hw)   -> void
//   hw.blank(ctrl)            -> void
//   hw.anyPendingWrites(ctrl) -> bool
//   hw.decodeLedCache(val)    -> string
//
// Perception math is NOT here — this file only declares the model
// as data. Framework derives curves, LUTs, and solves brightness
// via lib/perception.js before calling hw.send.
//
// K2 fallback (ctrl.sysex === false) is whole-controller. RGB
// folds to a 3-colour palette plus a velocity dim. The perception
// model's brightness solve byte reaches sendK2Note as velocity —
// fine resolution is discarded. Mix is disabled
// (_perceptionMixActive = false) so prediction matches the wire.


var K2_RG_THRESHOLD = 60;

function _clamp7f(x) { return Math.max(0, Math.min(0x7F, x | 0)); }

function _sendSysex(msg) {
    midi.sendSysexMsg(msg, msg.length);
}

var BLANK_NOTES = [
    0x0C, 0x0D, 0x0E, 0x0F,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
    0x18, 0x19, 0x1A, 0x1B,
    0x1C, 0x1D, 0x1E, 0x1F,
    0x20, 0x21, 0x22, 0x23,
    0x24, 0x25, 0x26, 0x27,
    0x28, 0x29, 0x2A, 0x2B,
    0x2C, 0x2D, 0x2E, 0x2F,
    0x30, 0x31, 0x32, 0x33,
    0x34, 0x35, 0x36, 0x37
];

myCatnip.HW_K3 = {
    name: 'Xone K3',

    DEFAULTS: {
        midiChannel: 0x0E,
        sysex: true
    },

    pacing: {},

    // Model inputs — framework-side perception derives curves
    // and LUTs from these + PERCEPTION.curves via lib/perception.js.
    // All fields kept here for byte-identity with v2.0.0.
    PERCEPTION: {
        curves: 'measuredRGB',
        wbGain:  [0.6, 1.0, 0.93],
        weights: [1.35, 0.69, 0.19],
        gamma:   0.32,
        hkBoost: 0.29,
        mode: { mix: 'correct', brightness: 'flat' }
    },

    LED_TRANSFERS: {
        measuredRGB: {
            r: [
                [0, 0], [2, 45], [5, 138], [8, 245],
                [11, 350], [14, 500], [18, 660], [24, 900],
                [32, 1316], [42, 1867], [53, 2500], [64, 3320],
                [74, 4221], [85, 4720], [96, 5787], [106, 6500],
                [114, 6900], [120, 7400], [127, 8200]
            ],
            g: [
                [0, 0], [2, 68], [5, 195], [8, 340],
                [11, 520], [14, 700], [18, 970], [24, 1350],
                [32, 1937], [42, 2754], [53, 3783], [64, 4892],
                [74, 6524], [85, 7538], [96, 9316], [106, 10371],
                [114, 10800], [120, 11800], [127, 12700]
            ],
            b: [
                [0, 0], [2, 377], [5, 1140], [8, 2295],
                [11, 3430], [14, 5213], [18, 6600], [24, 9200],
                [32, 14586], [42, 20313], [53, 25430], [64, 30456],
                [74, 35542], [85, 38931], [96, 42822], [106, 44800],
                [114, 45800], [120, 47800], [127, 49500]
            ]
        }
    },

    PALETTE: {
        off:        [0,0,0],
        red:        [0x7F,0,0],
        green:      [0,0x7F,0],
        blue:       [0,0,0x7F],
        amber:      [0x7F,0x40,0],
        orange:     [127,22,0],
        orange_red: [72,5,0],
        yellow:     [0x7F,0x7F,0],
        yellow2:    [0x7F,0x7F,0x20],
        lime:       [0x40,0x7F,0],
        cyan:       [0,0x7F,0x7F],
        sky:        [0x20,0x60,0x7F],
        sky2:       [0x20,0x50,0x7F],
        purple:     [0x40,0x20,0x7F],
        magenta:    [0x7F,0,0x7F],
        pink:       [0x7F,0x30,0x50],
        white:      [0x7F,0x7F,0x7F],
        teal:       [0,70,58],
        teal2:      [13,127,21],
        teal3:      [0,127,43],
        teal_fade:  [0x10,0x50,0x10],
        cool_white: [0x50,0x60,0x7F],
        dim:        [0x10,0x10,0x10]
    },

    MIXXX_COLORS: {
        0xC50A08:[0x6F,0x05,0x00],0xFF8000:[0x7F,0x20,0x00],
        0xF8D200:[0x7F,0x56,0x00],0x32BE44:[0x15,0x67,0x05],
        0x42D4F4:[0x15,0x7F,0x4F],0x0044FF:[0x00,0x0F,0x7F],
        0xAF00CC:[0x4F,0x00,0x5F],0xFCA6D7:[0x7F,0x3F,0x3F],
        0xF2F2FF:[0x60,0x60,0x60],0x000000:[0x00,0x00,0x00],
        0xFF0000:[0x7F,0x00,0x00],0xFFFF00:[0x7F,0x7F,0x00],
        0x00FF00:[0x00,0x7F,0x00],0x00FFFF:[0x00,0x7F,0x7F],
        0x0000FF:[0x00,0x00,0x7F],0xFF00FF:[0x7F,0x00,0x7F],
        0xFF88FF:[0x7F,0x40,0x7F],0xFFFFFF:[0x7F,0x7F,0x7F],
        0x000088:[0x00,0x00,0x40],0x008800:[0x00,0x40,0x00],
        0x008888:[0x00,0x40,0x40],0x228800:[0x10,0x40,0x00],
        0x880000:[0x40,0x00,0x00],0x882200:[0x40,0x10,0x00],
        0x888800:[0x40,0x40,0x00],0x888888:[0x40,0x40,0x40],
        0x88FF00:[0x40,0x7F,0x00],0xFF8800:[0x7F,0x40,0x00]
    },

    DEFAULT_RGB_BRIGHTNESS:     110,
    DEFAULT_RGB_BRIGHTNESS_OFF:  12,

    LAYER_BUTTON_NOTE: 0x0C,
    SHIFT_BUTTON_NOTE: 0x0F,
    K2_RG_THRESHOLD: K2_RG_THRESHOLD,

    // ============================================================
    // HAL — control map
    // ============================================================
    buildBindings: function(ctrl) {
        var ch = ctrl.midiChannel;
        var bindings = {};

        function add(name, status, note, type) {
            var idx = myCatnip.HW_K3.noteToLEDIndex(note);
            bindings[name] = new myCatnip.Binding(
                name,
                { midi: [status + ch, note], type: type, idx: idx },
                ctrl
            );
        }

        for (var i = 0; i < 4; i++) {
            add('encoder' + i, 0xB0, 0x00 + i, 'encoder');
            add('fader' + i,   0xB0, 0x10 + i, 'fader');
            add('press' + i,   0x90, 0x34 + i, 'button');
        }
        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 4; c++) {
                add('knob' + c + '_' + r, 0xB0, 0x04 + r * 4 + c, 'knob');
                add('button' + c + '_' + r, 0x90, 0x30 - r * 4 + c, 'button');
            }
        }
        add('encoderL', 0xB0, 0x14, 'encoder');
        add('encoderR', 0xB0, 0x15, 'encoder');
        add('pressL',   0x90, 0x0D, 'button');
        add('pressR',   0x90, 0x0E, 'button');

        for (var r2 = 0; r2 < 4; r2++) {
            for (var c2 = 0; c2 < 4; c2++) {
                add('grid' + c2 + '_' + r2, 0x90, 0x24 - r2 * 4 + c2, 'button');
            }
        }

        add('layer', 0x90, this.LAYER_BUTTON_NOTE, 'button');
        add('shift', 0x90, this.SHIFT_BUTTON_NOTE, 'button');

        return bindings;
    },

    wireInputs: function(ctrl) {
        var noteOff = 0x80 + ctrl.midiChannel;
        for (var name in ctrl.bindings) {
            if (!ctrl.bindings.hasOwnProperty(name)) continue;
            var b = ctrl.bindings[name];
            if (!b.midi) continue;   // output-only
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

    // ============================================================
    // HAL — LED transport
    // ============================================================
    // rgb is POST-PERCEPTION (mix already applied). hw byte is
    // POST-SOLVE. This method only handles transport-level work:
    // sysex framing, dedupe, pacing, or K2 discretisation.
    send: function(ctrl, idx, rgb, hw) {
        if (!ctrl.sysex) {
            // K2 fallback: discretise post-mix rgb. In K2 mode
            // _perceptionMixActive is false, so mix was skipped —
            // this receives raw scheme rgb, matching v2.0.0.
            this.sendK2Note(ctrl.midiChannel, idx, rgb[0], rgb[1], rgb[2], hw);
            return;
        }

        var r = rgb[0], g = rgb[1], b = rgb[2];
        var val = (((r & 0x7F) << 21) | ((g & 0x7F) << 14) |
                   ((b & 0x7F) << 7) | (hw & 0x7F)) >>> 0;
        if (ctrl._ledCache[idx] === val) return;
        ctrl._ledCache[idx] = val;

        var msg = this.buildSysExLED(idx, r, g, b, hw);
        var pacer = ctrl.pacer('led', { sendFn: _sendSysex });
        pacer.enqueue(idx, msg);
        pacer.start();
    },

    blank: function(ctrl) {
        for (var bi = 0; bi < BLANK_NOTES.length; bi++) {
            midi.sendShortMsg(0x90 + ctrl.midiChannel, BLANK_NOTES[bi], 0x00);
        }

        if (ctrl.sysex === false) return;

        var pacer = ctrl.pacer('led', { sendFn: _sendSysex });
        var zeroVal = 0;
        for (var idx = 0; idx <= 0x21; idx++) {
            if (ctrl._ledCache[idx] === zeroVal) continue;
            ctrl._ledCache[idx] = zeroVal;
            var msg = this.buildSysExLED(idx, 0, 0, 0, 0);
            pacer.enqueue(idx, msg);
        }
        pacer.start();
    },

    anyPendingWrites: function(ctrl) {
        var p = ctrl._pacers && ctrl._pacers.led;
        return p ? p.length() > 0 : false;
    },

    decodeLedCache: function(val) {
        if (typeof val !== 'number') return String(val);
        var r  = (val >>> 21) & 0x7F;
        var g  = (val >>> 14) & 0x7F;
        var b  = (val >>> 7)  & 0x7F;
        var hw =  val          & 0x7F;
        return r + ':' + g + ':' + b + ':' + hw;
    },

    // ============================================================
    // PROTOCOL PRIMITIVES
    // ============================================================
    noteToLEDIndex: function(n) {
        if (n >= 0x28 && n <= 0x33) {
            var i = n - 0x28, r = 2 - (i >> 2);
            return r * 4 + (i & 3);
        }
        if (n >= 0x18 && n <= 0x27) {
            var j = n - 0x18, rf = j >> 2;
            return 0x0C + (3 - rf) * 4 + (j & 3);
        }
        if (n === 0x0C) return 0x1C;
        if (n === 0x0F) return 0x1D;
        if (n >= 0x34 && n <= 0x37) return n - 0x34 + 0x1E;
        return -1;
    },

    buildSysExLED: function(idx, r, g, b, hw) {
        return [ 0xF0,0x00,0x00,0x1A,0x50,0x15,0x00,0x0E,
                 idx & 0x7F,
                 _clamp7f(r), _clamp7f(g), _clamp7f(b), _clamp7f(hw),
                 0xF7 ];
    },

    rgbToK2: function(r, g, b, hw) {
        if (hw <= 0) return -1;
        var peak = Math.max(r, g, b);
        if (peak < 8) return -1;
        var drg = r - g;
        if (drg >  K2_RG_THRESHOLD) return 0;
        if (drg < -K2_RG_THRESHOLD) return 2;
        return 1;
    },

    idxToK2: function(idx) {
        if (idx >= 0x00 && idx <= 0x0B) {
            var r = idx >> 2, c = idx & 3;
            return { base: 0x28 + (2 - r) * 4 + c, step: 36 };
        }
        if (idx >= 0x0C && idx <= 0x1B) {
            var p = idx - 0x0C;
            var rf = 3 - (p >> 2);
            return { base: 0x18 + rf * 4 + (p & 3), step: 36 };
        }
        if (idx === 0x1C) return { base: 0x0C, step: 4 };
        if (idx === 0x1D) return { base: 0x0F, step: 4 };
        if (idx >= 0x1E && idx <= 0x21) return { base: 0x34 + (idx - 0x1E), step: 36 };
        return null;
    },

    sendK2Note: function(ch, idx, r, g, b, hw) {
        var pos = myCatnip.HW_K3.idxToK2(idx); if (!pos) return;
        var bucket = myCatnip.HW_K3.rgbToK2(r, g, b, hw);
        if (bucket < 0) { midi.sendShortMsg(0x90 + ch, pos.base, 0x00); return; }
        var peak = Math.max(r, g, b);
        var vel = Math.max(4, Math.min(127, Math.round(hw * peak / 127)));
        midi.sendShortMsg(0x90 + ch, pos.base + bucket * pos.step, vel);
    }
};

