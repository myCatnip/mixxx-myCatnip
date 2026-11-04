// hw/inpulse500.js
// Hercules DJControl Inpulse 500.
// Loop encoder is relative; loop buttons are momentary (push).
// Master volume knob is hardware-only — no binding exists for it.

function _add(status, note) { return (status << 8) | note; }

var IP500_MODE_NAMES = [
    'hotcue', 'loop', 'slicer', 'sampler',
    'pitch', 'roll', 'effect', 'beatjump'
];

var IP500_PALETTE_ENTRIES = [
    { rgb: [  0,   0,   0], vel: 0x00 },
    { rgb: [  0,   0,  63], vel: 0x02 },
    { rgb: [  0,   0, 127], vel: 0x03 },
    { rgb: [  0,  63,   0], vel: 0x10 },
    { rgb: [  0,  63,  63], vel: 0x12 },
    { rgb: [  0, 127,   0], vel: 0x1C },
    { rgb: [  0, 127, 127], vel: 0x1F },
    { rgb: [ 63,  63,   0], vel: 0x30 },
    { rgb: [ 63,   0,   0], vel: 0x40 },
    { rgb: [127,   0, 127], vel: 0x42 },
    { rgb: [ 63,  30,   0], vel: 0x4C },
    { rgb: [ 63,  63,   0], vel: 0x50 },
    { rgb: [ 63,  63,  63], vel: 0x52 },
    { rgb: [ 63, 127,   0], vel: 0x5C },
    { rgb: [127,   0,   0], vel: 0x60 },
    { rgb: [127,  40, 100], vel: 0x62 },
    { rgb: [127,  63, 127], vel: 0x63 },
    { rgb: [127,  63,   0], vel: 0x74 },
    { rgb: [127, 127,   0], vel: 0x7C },
    { rgb: [127, 127, 127], vel: 0x7F }
];

myCatnip.IP500_JOG = {
    wheelResolution: 720,
    rpm: 33.333,
    alpha: 5 / 6,
    beta: (5 / 6) / 128,
    shiftMultiplier: 4,
    tickMode: 'twosComplement'
};
myCatnip._IP500_JOG_DEFAULTS = Object.assign({}, myCatnip.IP500_JOG);

myCatnip.applyIP500Jog = function(overrides) {
    var D = myCatnip._IP500_JOG_DEFAULTS;
    for (var k in D) if (D.hasOwnProperty(k)) myCatnip.IP500_JOG[k] = D[k];
    if (overrides) {
        for (var k2 in overrides) {
            if (!overrides.hasOwnProperty(k2)) continue;
            if (myCatnip.IP500_JOG[k2] === undefined) continue;
            myCatnip.IP500_JOG[k2] = overrides[k2];
        }
    }
};

myCatnip.ip500JogTick = function(v) {
    if (myCatnip.IP500_JOG.tickMode === 'twosComplement') {
        if (v === 0x00) return 0;
        if (v < 0x40) return v;
        return v - 0x80;
    }
    if (v === 0x40) return 0;
    return v - 0x40;
};

myCatnip.HW_INPULSE500 = {
    name: 'Hercules DJControl Inpulse 500',

    DEFAULTS: {
        midiChannel: 0,
        sysex: false,
        perceptionMixActive: false
    },

    // No `pacing` field — the Inpulse transport uses 3-byte short
    // messages (midi.sendShortMsg), which don't require throttling.
    // A pacer is never constructed for this hardware.

    PALETTE: {
        off:         [  0,   0,   0],
        darkblue:    [  0,   0,  63],
        blue:        [  0,   0, 127],
        darkgreen:   [  0,  63,   0],
        green:       [  0, 127,   0],
        darkteal:    [  0,  63,  63],
        cyan:        [  0, 127, 127],
        olive:       [ 63,  63,   0],
        yellow:      [127, 127,   0],
        darkred:     [ 63,   0,   0],
        red:         [127,   0,   0],
        magenta:     [127,   0, 127],
        pink:        [127,  63, 127],
        brown:       [ 63,  30,   0],
        gray:        [ 63,  63,  63],
        darkgray:    [ 30,  30,  30],
        yellowgreen: [ 63, 127,   0],
        orange:      [127,  63,   0],
        white:       [127, 127, 127]
    },

    MIXXX_COLORS: {
        0xC50A08:[127,  10,   0], 0xFF8000:[127,  63,   0],
        0xF8D200:[127, 107,   0], 0x32BE44:[ 27, 127,  10],
        0x42D4F4:[ 27, 127, 100], 0x0044FF:[  0,  30, 127],
        0xAF00CC:[100,   0, 120], 0xFCA6D7:[127,  80,  80],
        0xF2F2FF:[ 96,  96,  96], 0x000000:[  0,   0,   0],
        0xFF0000:[127,   0,   0], 0xFFFF00:[127, 127,   0],
        0x00FF00:[  0, 127,   0], 0x00FFFF:[  0, 127, 127],
        0x0000FF:[  0,   0, 127], 0xFF00FF:[127,   0, 127],
        0xFF88FF:[127,  63, 127], 0xFFFFFF:[127, 127, 127],
        0x000088:[  0,   0,  63], 0x008800:[  0,  63,   0],
        0x008888:[  0,  63,  63], 0x228800:[ 30,  63,   0],
        0x880000:[ 63,   0,   0], 0x882200:[ 63,  30,   0],
        0x888800:[ 63,  63,   0], 0x888888:[ 63,  63,  63],
        0x88FF00:[ 63, 127,   0], 0xFF8800:[127,  63,   0]
    },

    DEFAULT_RGB_BRIGHTNESS:     0x7F,
    DEFAULT_RGB_BRIGHTNESS_OFF: 0x00,

    IP500_MODE_NAMES: IP500_MODE_NAMES,
    IP500_PALETTE_ENTRIES: IP500_PALETTE_ENTRIES,

    buildBindings: function(ctrl) {
        var bindings = {};

        function add(name, status, note, type, idx) {
            var spec = { midi: [status, note], type: type, idx: idx };
            if (type === 'knob14' || type === 'fader14') {
                spec.bits = 14;
                spec.type = (type === 'fader14') ? 'fader' : 'knob';
            }
            bindings[name] = new myCatnip.Binding(name, spec, ctrl);
        }

        // pfl / slip / quant are toggle buttons: type 'button' with
        // the default buttonMode ('toggle') is the correct path.
        // 'toggle' as a spec.type is not a valid Binding.type and
        // would silently drop input dispatch.
        var deckDefs = [
            [0x07, 'play',   'push'],
            [0x06, 'cue',    'push'],
            [0x05, 'sync',   'push'],
            [0x0C, 'pfl',    'button'],
            [0x0D, 'load',   'push'],
            [0x03, 'vinyl',  'push'],
            [0x01, 'slip',   'button'],
            [0x02, 'quant',  'button'],
            [0x09, 'loopIn', 'push'],
            [0x0A, 'loopOut','push'],
            [0x2C, 'loopPush','push']
        ];
        var dn = ['A', 'B'];
        var statuses = [[0x91, 0x94], [0x92, 0x95]];

        for (var d = 0; d < 2; d++) {
            var base = statuses[d][0], shift = statuses[d][1], n = dn[d];
            add('shift' + n, base, 0x04, 'push', -1);
            for (var i = 0; i < deckDefs.length; i++) {
                var note = deckDefs[i][0], nm = deckDefs[i][1], tp = deckDefs[i][2];
                add(nm + n, base, note, tp, _add(base, note));
                add(nm + n + '_shift', shift, note, tp, _add(shift, note));
            }
            for (var ps = 1; ps <= 8; ps++) {
                add('padSelect' + n + ps, base, 0x0E + ps, 'push', -1);
            }

            var padStatus = 0x96 + d;
            for (var mode = 0; mode < 8; mode++) {
                for (var pad = 0; pad < 8; pad++) {
                    var un = (mode << 4) | pad;
                    var sh = un | 0x08;
                    var mname = IP500_MODE_NAMES[mode];
                    var pn = pad + 1;
                    add('pad' + n + pn + '_' + mname, padStatus, un,
                        'push', _add(padStatus, un));
                    add('pad' + n + pn + '_' + mname + '_shift', padStatus, sh,
                        'push', _add(padStatus, sh));
                }
            }

            var ccBase = 0xB1 + d;
            add('volume' + n, ccBase, 0x00, 'fader14', -1);
            add('filter' + n, ccBase, 0x01, 'knob',    -1);
            add('eqLow' + n,  ccBase, 0x02, 'knob14',  -1);
            add('eqMid' + n,  ccBase, 0x03, 'knob14',  -1);
            add('eqHigh' + n, ccBase, 0x04, 'knob14',  -1);
            add('gain' + n,   ccBase, 0x05, 'knob14',  -1);
            add('pitch' + n,  ccBase, 0x08, 'fader14', -1);
            add('loopEncoder' + n, ccBase, 0x0E, 'encoder', -1);
        }

        // Master — browser, assistant, crossfader, deck select
        add('browserPush', 0x90, 0x00, 'push', -1);
        add('assistant',   0x90, 0x03, 'push', -1);
        add('fxSel1',      0x90, 0x14, 'push', _add(0x90, 0x14));
        add('fxSel2',      0x90, 0x15, 'push', _add(0x90, 0x15));
        add('fxSel3',      0x90, 0x16, 'push', _add(0x90, 0x16));
        add('fxSel4',      0x90, 0x17, 'push', _add(0x90, 0x17));
        add('xfaderEnable',0x90, 0x18, 'push', -1);
        add('crossfader',  0xB0, 0x00, 'fader',  -1);
        add('browserKnob', 0xB0, 0x01, 'encoder', -1);
        add('xfaderCurve', 0xB0, 0x0B, 'knob',   -1);

        return bindings;
    },

    wireInputs: function(ctrl) {
        function register(status, note, bindingName) {
            function cb(ch, cc, v, s) {
                var b = ctrl.bindings[bindingName];
                if (b && b.input) b.input(ch, cc, v, s);
            }
            midi.makeInputHandler(status, note, cb);
            if ((status & 0xF0) === 0x90) {
                midi.makeInputHandler(0x80 + (status & 0x0F), note, cb);
            }
        }

        for (var d = 0; d < 2; d++) {
            var n = ['A', 'B'][d];
            var base = [0x91, 0x92][d];
            var shift = [0x94, 0x95][d];
            var deckDefs = [
                [0x07, 'play'], [0x06, 'cue'], [0x05, 'sync'],
                [0x0C, 'pfl'],  [0x0D, 'load'], [0x03, 'vinyl'],
                [0x01, 'slip'], [0x02, 'quant'],
                [0x09, 'loopIn'], [0x0A, 'loopOut'], [0x2C, 'loopPush']
            ];
            register(base, 0x04, 'shift' + n);
            for (var i = 0; i < deckDefs.length; i++) {
                var nt = deckDefs[i][0], nm = deckDefs[i][1];
                register(base, nt, nm + n);
                register(shift, nt, nm + n + '_shift');
            }
            for (var ps = 0; ps < 8; ps++) {
                register(base, 0x0F + ps, 'padSelect' + n + (ps + 1));
            }
            var padStatus = 0x96 + d;
            for (var note = 0; note <= 0x7F; note++) {
                var mode = note >> 4;
                var pad = (note & 0x07) + 1;
                var isShift = (note & 0x08) !== 0;
                var mname = IP500_MODE_NAMES[mode];
                var target = 'pad' + n + pad + '_' + mname +
                             (isShift ? '_shift' : '');
                register(padStatus, note, target);
            }
            register(0xB1 + d, 0x01, 'filter' + n);
            register(0xB1 + d, 0x0E, 'loopEncoder' + n);
        }

        register(0x90, 0x00, 'browserPush');
        register(0x93, 0x00, 'browserPush');
        register(0x90, 0x03, 'assistant');
        register(0x90, 0x14, 'fxSel1');
        register(0x90, 0x15, 'fxSel2');
        register(0x90, 0x16, 'fxSel3');
        register(0x90, 0x17, 'fxSel4');
        register(0x90, 0x18, 'xfaderEnable');
        register(0xB0, 0x00, 'crossfader');
        register(0xB0, 0x0B, 'xfaderCurve');
        function browserKnobHandler(ch, cc, v, s) {
            var b = ctrl.bindings.browserKnob;
            if (b && b.input) b.input(ch, cc, v, s);
        }
        midi.makeInputHandler(0xB0, 0x01, browserKnobHandler);
        midi.makeInputHandler(0xB0, 0x02, browserKnobHandler);
        midi.makeInputHandler(0xB3, 0x01, browserKnobHandler);

        var ctrl14 = [
            ['volume',   0x00, 0x20],
            ['eqLow',    0x02, 0x22],
            ['eqMid',    0x03, 0x23],
            ['eqHigh',   0x04, 0x24],
            ['gain',     0x05, 0x25],
            ['pitch',    0x08, 0x28]
        ];
        ctrl._ip500Pending14 = ctrl._ip500Pending14 || {};
        for (var d2 = 0; d2 < 2; d2++) {
            var n2 = ['A', 'B'][d2];
            var ccCh = 0xB1 + d2;
            for (var k = 0; k < ctrl14.length; k++) {
                (function(ccCh, msbN, lsbN, bindName) {
                    var key = ccCh + ':' + msbN;
                    midi.makeInputHandler(ccCh, msbN, function(ch, cc, v, s) {
                        var cur = ctrl._ip500Pending14[key] || 0;
                        ctrl._ip500Pending14[key] = (cur & 0x7F) | (v << 7);
                        var b = ctrl.bindings[bindName];
                        if (b && b.input) {
                            b.input(ch, cc, ctrl._ip500Pending14[key], s);
                        }
                    });
                    midi.makeInputHandler(ccCh, lsbN, function(ch, cc, v, s) {
                        var cur = ctrl._ip500Pending14[key] || 0;
                        ctrl._ip500Pending14[key] = (cur & 0x3F80) | v;
                        var b = ctrl.bindings[bindName];
                        if (b && b.input) {
                            b.input(ch, cc, ctrl._ip500Pending14[key], s);
                        }
                    });
                })(ccCh, ctrl14[k][1], ctrl14[k][2], ctrl14[k][0] + n2);
            }
        }

        for (var dj = 0; dj < 2; dj++) {
            (function(side, baseCC, shiftCC, baseNote, shiftNote) {
                var touchSources = { nb: false, ns: false, cb: false, cs: false };
                function anyTouch() {
                    return touchSources.nb || touchSources.ns ||
                           touchSources.cb || touchSources.cs;
                }
                function currentChannel() {
                    return (side === 'A') ? ctrl.selectedDeckA : ctrl.selectedDeckB;
                }
                function vinylOn() {
                    return (side === 'A') ? ctrl._ip500VinylA : ctrl._ip500VinylB;
                }
                function refreshTouch() {
                    var chNum = currentChannel();
                    if (!chNum) return;
                    if (anyTouch() && vinylOn()) {
                        var J = myCatnip.IP500_JOG;
                        engine.scratchEnable(chNum, J.wheelResolution,
                            J.rpm, J.alpha, J.beta);
                    } else {
                        engine.scratchDisable(chNum);
                    }
                }
                // Expose refresh on controller so _ip500ResendSideVU can
                // re-establish scratch after a deck switch mid-touch.
                ctrl['_ip500RefreshJogTouch' + side] = refreshTouch;
                function onTouchSource(key) {
                    return function(ch, cc, v, s) {
                        touchSources[key] = (v > 0x3F);
                        refreshTouch();
                    };
                }
                function registerNote(status, note, cb) {
                    midi.makeInputHandler(status, note, cb);
                    midi.makeInputHandler(
                        (status & 0xF0) | 0x80 | (status & 0x0F), note, cb);
                }
                registerNote(baseNote,  0x08, onTouchSource('nb'));
                registerNote(shiftNote, 0x08, onTouchSource('ns'));
                midi.makeInputHandler(baseCC,  0x0C, onTouchSource('cb'));
                midi.makeInputHandler(shiftCC, 0x0C, onTouchSource('cs'));

                function onTick(mult) {
                    return function(ch, cc, v, s) {
                        var ticks = myCatnip.ip500JogTick(v) * mult;
                        if (ticks === 0) return;
                        var chNum = currentChannel();
                        if (!chNum) return;
                        if (engine.isScratching(chNum)) {
                            engine.scratchTick(chNum, ticks);
                        } else {
                            engine.setValue('[Channel' + chNum + ']', 'jog', ticks);
                        }
                    };
                }
                midi.makeInputHandler(baseCC,  0x0A, onTick(1));
                midi.makeInputHandler(baseCC,  0x09, onTick(1));
                midi.makeInputHandler(shiftCC, 0x0A,
                    onTick(myCatnip.IP500_JOG.shiftMultiplier));
                midi.makeInputHandler(shiftCC, 0x09,
                    onTick(myCatnip.IP500_JOG.shiftMultiplier));
            })(['A', 'B'][dj], 0xB1 + dj, 0xB4 + dj, 0x91 + dj, 0x94 + dj);
        }
    },

    send: function(ctrl, idx, rgb, hw) {
        if (idx < 0) return;
        var vel = this._quantizeToPalette(rgb, hw);
        if (ctrl._ledCache[idx] === vel) return;
        ctrl._ledCache[idx] = vel;
        var status = (idx >> 8) & 0xFF;
        var note   = idx & 0xFF;
        if (status === 0) return;
        midi.sendShortMsg(status, note, vel);
    },

    blank: function(ctrl) {
        for (var note = 0; note <= 0x7F; note++) {
            midi.sendShortMsg(0x96, note, 0x00);
            midi.sendShortMsg(0x97, note, 0x00);
        }
        var transportNotes = [0x01, 0x02, 0x03, 0x05, 0x06, 0x07,
                              0x09, 0x0A, 0x0C, 0x0D, 0x2C, 0x30];
        for (var i = 0; i < transportNotes.length; i++) {
            midi.sendShortMsg(0x91, transportNotes[i], 0x00);
            midi.sendShortMsg(0x92, transportNotes[i], 0x00);
        }
        midi.sendShortMsg(0x90, 0x03, 0x00);
        midi.sendShortMsg(0x90, 0x05, 0x00);
        midi.sendShortMsg(0x90, 0x14, 0x00);
        midi.sendShortMsg(0x90, 0x15, 0x00);
        midi.sendShortMsg(0x90, 0x16, 0x00);
        midi.sendShortMsg(0x90, 0x17, 0x00);
        midi.sendShortMsg(0x91, 0x39, 0x00);
        midi.sendShortMsg(0x92, 0x39, 0x00);
        [0x1C, 0x1D, 0x1E, 0x1F, 0x2C, 0x2D].forEach(function(nt) {
            midi.sendShortMsg(0x91, nt, 0x00);
            midi.sendShortMsg(0x92, nt, 0x00);
        });
    },

    anyPendingWrites: function(ctrl) { return false; },

    decodeLedCache: function(val) {
        if (typeof val !== 'number') return String(val);
        return 'vel:0x' + val.toString(16);
    },

    _quantizeToPalette: function(rgb, hw) {
        if (hw === 0 || (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0)) {
            return 0x00;
        }
        var dim = (hw < 0x40);
        var target = dim
            ? [rgb[0] / 2, rgb[1] / 2, rgb[2] / 2]
            : rgb;
        var best = null, bestDist = Infinity;
        for (var i = 0; i < IP500_PALETTE_ENTRIES.length; i++) {
            var e = IP500_PALETTE_ENTRIES[i];
            if (e.vel === 0x00) continue;
            var dr = target[0] - e.rgb[0];
            var dg = target[1] - e.rgb[1];
            var db = target[2] - e.rgb[2];
            var dist = dr*dr + dg*dg + db*db;
            if (dist < bestDist) { bestDist = dist; best = e; }
        }
        return best ? best.vel : 0x00;
    }
};