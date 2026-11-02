// xone-k3-hw-k3.js — Xone K3 hardware descriptor.
//
// The HAL contract a hardware descriptor must satisfy:
//
//   hw.DEFAULTS          boot defaults (midiChannel, sysex,
//                        calibration data, calibrationMode, wbGain,
//                        channelPerceptual, hkBoost, lumGamma).
//                        Preset overrides win.
//   hw.pacing            TIMING overrides ({ sysexThrottleMs, ... }).
//                        Empty object = use framework defaults.
//   hw.LED_TRANSFERS     raw transfer curves for calibration. Shape:
//                        { name: { r: [[hw,lum],...], g: [...], b: [...] } }
//                        Framework's _buildTransferRGB normalises.
//
//   hw.buildBindings(ctrl)               -> { name: Binding, ... }
//   hw.wireInputs(ctrl)                  -> void
//   hw.writeLED(ctrl, idx, r, g, b, hw)  -> void
//   hw.blank(ctrl)                       -> void
//   hw.anyPendingWrites(ctrl)            -> bool
//   hw.decodeLedCache(val)               -> string (diagnostic)
//
// Protocol primitives (note mapping, sysex encoder, K2 palette)
// live here too but are private — framework code never reads them
// directly. Framework treats every LED as (idx, rgb, hw); the wire
// format is the hardware's concern.
//
// LED brightness defaults (XoneK3.DEFAULT_RGB_BRIGHTNESS = 110,
// _OFF = 12) are framework-level and live in lib-core.js — the
// scheme engine requires them at load time and they're
// "medium/dim" universals rather than measured hardware
// calibration. A hardware wanting different defaults can override
// those globals at its module load; the K3 uses framework values.
//
// Loaded after lib-binding.js (buildBindings constructs Binding
// instances), after lib-timing.js (Pacing / TIMING), before
// lib-controller.js (constructor references XoneK3.HW_K3 as the
// default descriptor).

'use strict';

if (typeof XoneK3 === 'undefined') {
    throw new Error('Xone K3: xone-k3-hw-k3.js — xone-k3-lib-core.js must load first');
}
if (typeof XoneK3._requireLoad !== 'function') {
    throw new Error('Xone K3: xone-k3-hw-k3.js — xone-k3-lib-core.js must load first');
}
XoneK3._requireLoad('xone-k3-hw-k3.js',
    ['Binding', 'TIMING', 'Pacing', '_warnOnce']);

(function() {
    // Local to this module. rgbToK2 reads it; also exposed on
    // HW_K3 for future diagnostics.
    var K2_RG_THRESHOLD = 60;

    function _clamp7f(x) { return Math.max(0, Math.min(0x7F, x | 0)); }

    XoneK3.HW_K3 = {
        name: 'Xone K3',

        // ============================================================
        // DEFAULTS
        // ============================================================
        // Merged into every boot via
        //   Object.assign({}, hw.DEFAULTS, presetOverrides)
        // Preset overrides win.
        DEFAULTS: {
            midiChannel: 0x0E,
            calibration:       'measuredRGB',
            calibrationMode:   'rms',
            wbGain:            [0.6, 1.0, 0.93],
            channelPerceptual: [1.35, 0.69, 0.19],
            hkBoost:           0.29,
            lumGamma:          0.32,
            // false → whole-controller K2 MIDI mode. true → sysex
            // RGB path. Transport choice is whole-controller, not
            // per-LED — the per-LED k2 flag was removed.
            sysex: true,
        },

        // ============================================================
        // PACING
        // ============================================================
        // Empty — K3 uses all TIMING defaults. A hardware with a
        // slower LED bus could set `{ sysexThrottleMs: 20 }` here.
        pacing: {},

        // ============================================================
        // LED TRANSFER CURVE DATA
        // ============================================================
        // Raw measured [hw, luminance] pairs. Framework's
        // _buildTransferRGB normalises and flattens non-monotonic
        // entries. Consumed by the constructor's calibration-curve
        // lookup (reads this.hw.LED_TRANSFERS[cfg.calibration]).
        LED_TRANSFERS: {
            measuredRGB: {
                r: [
                    [0,     0], [2,    45], [5,   138], [8,   245],
                    [11,  350], [14,  500], [18,  660], [24,  900],
                    [32, 1316], [42, 1867], [53, 2500], [64, 3320],
                    [74, 4221], [85, 4720], [96, 5787], [106, 6500],
                    [114, 6900], [120, 7400], [127, 8200]
                ],
                g: [
                    [0,     0], [2,    68], [5,   195], [8,   340],
                    [11,  520], [14,  700], [18,  970], [24, 1350],
                    [32, 1937], [42, 2754], [53, 3783], [64, 4892],
                    [74, 6524], [85, 7538], [96, 9316], [106, 10371],
                    [114, 10800], [120, 11800], [127, 12700]
                ],
                b: [
                    [0,      0], [2,    377], [5,   1140], [8,   2295],
                    [11,  3430], [14,  5213], [18,  6600], [24,  9200],
                    [32, 14586], [42, 20313], [53, 25430], [64, 30456],
                    [74, 35542], [85, 38931], [96, 42822], [106, 44800],
                    [114, 45800], [120, 47800], [127, 49500]
                ]
            }
        },

        // ============================================================
        // PHYSICAL NOTE CONSTANTS
        // ============================================================
        // Only read by this file's buildBindings. Not part of the
        // HAL contract — a different hardware has its own.
        LAYER_BUTTON_NOTE: 0x0C,
        SHIFT_BUTTON_NOTE: 0x0F,

        // K2 palette discretisation. Only read by rgbToK2.
        K2_RG_THRESHOLD: K2_RG_THRESHOLD,

        // ============================================================
        // HAL — control map
        // ============================================================
        // Enumerates every physical control the K3 exposes and
        // wraps it in a Binding. Called once per controller, from
        // K3Controller's constructor. Returned map keys are the
        // vocabulary config files reference (encoder0..3,
        // knob<col>_<row>, button<col>_<row>, grid<col>_<row>,
        // encoderL/R, pressL/R, layer, shift).
        buildBindings: function(ctrl) {
            var ch = ctrl.midiChannel;
            var bindings = {};

            function add(name, status, note, type) {
                var idx = XoneK3.HW_K3.noteToLEDIndex(note);
                bindings[name] = new XoneK3.Binding(
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

        // ============================================================
        // HAL — input wiring
        // ============================================================
        // Registers one Mixxx input handler per binding. The K3
        // uses:
        //   - CC or note-on for the primary message (b.midi[0..1])
        //   - note-off for the release half of any note-on binding
        //     (status nibble 0x90 → also wire 0x80 at the same note)
        //
        // Encoders and faders arrive as CCs (0xB0) — only one
        // handler per binding. Buttons arrive as notes (0x90) and
        // need both. The status-nibble test distinguishes them.
        //
        // Callback ignores Mixxx's channel arg (always ctrl's
        // channel) and forwards the raw (channel, cc, value, status)
        // tuple to Binding.input, which owns the transaction model,
        // bounce guards, and dispatch.
        wireInputs: function(ctrl) {
            var noteOff = 0x80 + ctrl.midiChannel;
            for (var name in ctrl.bindings) {
                if (!ctrl.bindings.hasOwnProperty(name)) continue;
                (function(b) {
                    function cb(_ch, _cc, v, s) {
                        if (b.input) b.input(_ch, _cc, v, s);
                    }
                    midi.makeInputHandler(b.midi[0], b.midi[1], cb);
                    if ((b.midi[0] & 0xF0) === 0x90) {
                        midi.makeInputHandler(noteOff, b.midi[1], cb);
                    }
                })(ctrl.bindings[name]);
            }
        },

        // ============================================================
        // HAL — LED write
        // ============================================================
        // The framework's sendLED dispatches here after its
        // shutdown/idx guards. This method decides the transport
        // (K2 note vs sysex), applies white balance on the sysex
        // path, deduplicates via ctrl._ledCache, and enqueues into
        // the framework's pacer.
        //
        // Transport choice is whole-controller: ctrl.sysex. Per-LED
        // K2 override removed — to force K2 mode, set sysex: false
        // in the preset override (or hw.DEFAULTS).
        writeLED: function(ctrl, idx, r, g, b, hw) {
            if (!ctrl.sysex) {
                this.sendK2Note(ctrl.midiChannel, idx, r, g, b, hw);
                return;
            }

            // White balance on the sysex path only — K2 has a
            // coarse palette that ignores per-channel scaling.
            if (ctrl.calibrationMode !== 'off' && ctrl.wbActive) {
                var wb = ctrl._wbRGB(r, g, b);
                r = wb[0]; g = wb[1]; b = wb[2];
            }

            var val = (((r & 0x7F) << 21) | ((g & 0x7F) << 14) |
                       ((b & 0x7F) << 7) | (hw & 0x7F)) >>> 0;
            if (ctrl._ledCache[idx] === val) return;
            ctrl._ledCache[idx] = val;

            var msg = this.buildSysExLED(idx, r, g, b, hw);
            var pacer = ctrl.pacer('led');
            pacer.enqueue(idx, msg);
            pacer.start();
        },

        // Short-message sweep runs unconditionally — a previous
        // session may have left K2 notes lit; sysex blanks never
        // reach those. Sysex sweep only when the controller is in
        // sysex mode.
        //
        // Sysex sweep goes through the same dedupe+cache path as
        // writeLED so a subsequent render with a zero target
        // dedupes cleanly. Cache must already be empty when this
        // runs (framework's _blankLeds clears it before calling).
        //
        // No per-LED K2 skip — the K2 fallback (sysex: false) is
        // whole-controller, so the short-msg sweep has already
        // blanked every LED via notes; the sysex sweep is skipped
        // by the early return above.
        blank: function(ctrl) {
            for (var n = 0x0C; n <= 0x37; n++) {
                midi.sendShortMsg(0x90 + ctrl.midiChannel, n, 0x00);
            }

            if (ctrl.sysex === false) return;

            var pacer = ctrl.pacer('led');
            var zeroVal = 0;
            for (var idx = 0; idx <= 0x21; idx++) {
                if (ctrl._ledCache[idx] === zeroVal) continue;
                ctrl._ledCache[idx] = zeroVal;
                var msg = this.buildSysExLED(idx, 0, 0, 0, 0);
                pacer.enqueue(idx, msg);
            }
            pacer.start();
        },

        // Used by shutdown's drain-then-teardown poll.
        anyPendingWrites: function(ctrl) {
            var p = ctrl._pacers && ctrl._pacers.led;
            return p ? p.length() > 0 : false;
        },

        // Diagnostic reverse of the packed-int cache key. Used by
        // inspect('why', name) to print what was last written to
        // an LED index.
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
        // Byte-level translation between framework's (idx, rgb, hw)
        // and the K3 wire format. Not part of the HAL contract —
        // only this file's writeLED / blank call them. Framework
        // never sees a note number or a sysex byte.

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
            var pos = XoneK3.HW_K3.idxToK2(idx); if (!pos) return;
            var bucket = XoneK3.HW_K3.rgbToK2(r, g, b, hw);
            if (bucket < 0) { midi.sendShortMsg(0x90 + ch, pos.base, 0x00); return; }
            var peak = Math.max(r, g, b);
            var vel = Math.max(4, Math.min(127, Math.round(hw * peak / 127)));
            midi.sendShortMsg(0x90 + ch, pos.base + bucket * pos.step, vel);
        }
    };
})();