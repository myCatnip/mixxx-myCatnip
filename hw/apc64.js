// hw/apc64.js — Akai APC64 hardware descriptor.
//
// DAW mode / Session view only (devices/APC64.md). Grid-pad LEDs
// are note-on where CHANNEL = behaviour code (0-15) and VELOCITY =
// palette index (0-127). The host never sends RGB.
//
// hw parameter: string (named mode) or number (0-127, legacy).
// Strings resolve via LED_MODES; numbers snap to the seven static
// channels. Named modes bypass perception.
//
// Palette-only hardware. A LED colour is (paletteIdx, behaviour).
// There is no RGB path on the wire. Config must supply a
// paletteIdx — either directly via { paletteIdx: N }, or indirectly
// via a named alias in PALETTE. hw.send warns once and renders
// black if neither is present.
//
// PALETTE maps names to {rgb:[0,0,0], paletteIdx:N}. The rgb field
// is required by the framework's object-entry shape check; it is
// never read on the wire. NAMED_INDICES exposes the raw
// name → index map for scripts.

var _LED_MODES = {
    '10%':0,'25%':1,'50%':2,'60%':3,'75%':4,'90%':5,'full':6,
    'pulse.16':7,'pulse.8':8,'pulse.quarter':9,'pulse.half':10,
    'blink.24':11,'blink.16':12,'blink.8':13,'blink.quarter':14,'blink.half':15
};

var _LED_MODE_NAMES = [
    '10%','25%','50%','60%','75%','90%','full',
    'pulse.16','pulse.8','pulse.quarter','pulse.half',
    'blink.24','blink.16','blink.8','blink.quarter','blink.half'
];

// Strip LED modes (documented; unbound in v0.1).
var _STRIP_MODES = {
    'off':0,'bar.white':1,'bar.red':2,'bipolar.white':3,'bipolar.red':4
};

// Named palette indices — the default vocabulary. These are the
// Ableton clip-palette names; the value is the wire velocity. The
// browse view in the lab addresses indices directly, so this map
// is only for config convenience.
var _NAMED_INDICES = {
    BLACK: 0, GREY_LO: 1, GREY_MD: 2, WHITE: 3,
    ROSE: 4,
    RED_HI: 5, RED: 6, RED_LO: 7,
    RED_AMBER: 8,
    AMBER_HI: 9, AMBER: 10, AMBER_LO: 11,
    AMBER_YELLOW: 12,
    YELLOW_HI: 13, YELLOW: 14, YELLOW_LO: 15,
    YELLOW_LIME: 16,
    LIME_HI: 17, LIME: 18, LIME_LO: 19,
    LIME_GREEN: 20,
    GREEN_HI: 21, GREEN: 22, GREEN_LO: 23,
    GREEN_SPRING: 24,
    SPRING_HI: 25, SPRING: 26, SPRING_LO: 27,
    SPRING_TURQUOISE: 28,
    TURQUOISE_LO: 29, TURQUOISE: 30, TURQUOISE_HI: 31,
    TURQUOISE_CYAN: 32,
    CYAN_HI: 33, CYAN: 34, CYAN_LO: 35,
    CYAN_SKY: 36,
    SKY_HI: 37, SKY: 38, SKY_LO: 39,
    SKY_OCEAN: 40,
    OCEAN_HI: 41, OCEAN: 42, OCEAN_LO: 43,
    OCEAN_BLUE: 44,
    BLUE_HI: 45, BLUE: 46, BLUE_LO: 47,
    BLUE_ORCHID: 48,
    ORCHID_HI: 49, ORCHID: 50, ORCHID_LO: 51,
    ORCHID_MAGENTA: 52,
    MAGENTA_HI: 53, MAGENTA: 54, MAGENTA_LO: 55,
    MAGENTA_PINK: 56,
    PINK_HI: 57, PINK: 58, PINK_LO: 59
};

// Reverse map for OLED display: index → name. First name wins.
var _INDEX_TO_NAME = {};
(function() {
    for (var name in _NAMED_INDICES) {
        if (!_NAMED_INDICES.hasOwnProperty(name)) continue;
        var idx = _NAMED_INDICES[name];
        if (_INDEX_TO_NAME[idx] === undefined) _INDEX_TO_NAME[idx] = name;
    }
})();

// PALETTE — returned by resolveNamedColour. Values are
// {rgb:[0,0,0], paletteIdx:N}. rgb is required by the framework's
// object-entry shape check and is never read on the wire.
function _buildPalette() {
    var p = {};
    for (var name in _NAMED_INDICES) {
        if (!_NAMED_INDICES.hasOwnProperty(name)) continue;
        p[name] = { rgb: [0, 0, 0], paletteIdx: _NAMED_INDICES[name] };
    }
    // Lowercase aliases for common colours. These are the names
    // config authors reach for; they resolve to the _HI variant
    // of each hue.
    p.off     = p.BLACK;
    p.black   = p.BLACK;
    p.white   = p.WHITE;
    p.gray    = p.GREY_MD;
    p.grey    = p.GREY_MD;
    p.red     = p.RED_HI;
    p.orange  = p.AMBER_HI;
    p.amber   = p.AMBER_HI;
    p.yellow  = p.YELLOW_HI;
    p.lime    = p.LIME_HI;
    p.green   = p.GREEN_HI;
    p.teal    = p.TURQUOISE;
    p.cyan    = p.CYAN_HI;
    p.sky     = p.SKY_HI;
    p.blue    = p.BLUE_HI;
    p.purple  = p.ORCHID_HI;
    p.magenta = p.MAGENTA_HI;
    p.pink    = p.PINK_HI;
    // Raw index aliases: p0..p127 for scripts that want to
    // address an index without naming it.
    for (var i = 0; i < 128; i++) {
        p['p' + i] = { rgb: [0, 0, 0], paletteIdx: i };
    }
    return p;
}

// Visual top-left custom slot 0 = wire note 56. Assumes Custom-mode
// orientation; DAW-mode index→position is [TBD] (PROTOCOL-SPEC.md §5).
function _customNote(n) {
    var row = Math.floor(n / 8), col = n % 8;
    return 56 - 8 * row + col;
}
function _optionNote(o) { return (o < 8) ? (16 + o) : (8 + (o - 8)); }

myCatnip.HW_APC64 = {
    name: 'Akai APC64',

    DEFAULTS: { midiChannel: 0, sysex: false },
    pacing: {},

    PALETTE: _buildPalette(),
    NAMED_INDICES: _NAMED_INDICES,
    INDEX_TO_NAME: _INDEX_TO_NAME,
    LED_MODES: _LED_MODES,
    LED_MODE_NAMES: _LED_MODE_NAMES,
    STRIP_MODES: _STRIP_MODES,

    DEFAULT_RGB_BRIGHTNESS:     'full',
    DEFAULT_RGB_BRIGHTNESS_OFF: '10%',

    buildBindings: function(ctrl) {
        var bindings = {};
        function addPad(name, note) {
            bindings[name] = new myCatnip.Binding(name, {
                midi: [0x96, note], type: 'button', idx: note
            }, ctrl);
        }
        for (var n = 0; n < 24; n++) addPad('customPad' + n, _customNote(n));
        addPad('demoPlay', 32);
        addPad('demoCue', 33);
        for (var s = 0; s < 8; s++) addPad('section' + s, 24 + s);
        for (var o = 0; o < 16; o++) addPad('palOption' + o, _optionNote(o));
        addPad('brightPlus', 0);
        addPad('brightMinus', 1);
        addPad('modePlus', 2);
        addPad('modeMinus', 3);
        addPad('armLoad', 6);
        addPad('saveTo', 7);

        bindings.encoderTurn = new myCatnip.Binding('encoderTurn', {
            midi: [0xB0, 0x5A], type: 'encoder', idx: -1
        }, ctrl);
        bindings.encoderPress = new myCatnip.Binding('encoderPress', {
            midi: [0x90, 0x5A], type: 'button', idx: -1
        }, ctrl);
        return bindings;
    },

    wireInputs: function(ctrl) {
        function reg(status, note, name) {
            function cb(ch, cc, v, s) {
                var b = ctrl.bindings[name];
                if (b && b.input) b.input(ch, cc, v, s);
            }
            midi.makeInputHandler(status, note, cb);
            if ((status & 0xF0) === 0x90) {
                midi.makeInputHandler(0x80 + (status & 0x0F), note, cb);
            }
        }
        // Grid-pad notes arrive on MIDI channel 7 (1-indexed) =
        // status 0x96. Reference "ch 7" is 1-indexed.
        for (var n = 0; n < 24; n++) reg(0x96, _customNote(n), 'customPad' + n);
        reg(0x96, 32, 'demoPlay');
        reg(0x96, 33, 'demoCue');
        for (var s = 0; s < 8; s++) reg(0x96, 24 + s, 'section' + s);
        for (var o = 0; o < 16; o++) reg(0x96, _optionNote(o), 'palOption' + o);
        reg(0x96, 0, 'brightPlus');
        reg(0x96, 1, 'brightMinus');
        reg(0x96, 2, 'modePlus');
        reg(0x96, 3, 'modeMinus');
        reg(0x96, 6, 'armLoad');
        reg(0x96, 7, 'saveTo');

        // [LIVE] NOTES-daw-mode.md line 95: B0 5A 01 right /
        // 7F left per detent, also while Shift held. Confirmed
        // only in Custom view; Session view has not been
        // observed to send this. Handler is correct; may not fire.
        midi.makeInputHandler(0xB0, 0x5A, function(ch, cc, v, s) {
            var b = ctrl.bindings.encoderTurn;
            if (b && b.input) b.input(ch, cc, v, s);
        });
        // [CODE] note 0x5A; live capture saw nothing (NOTES-daw-mode.md
        // line 97). Handler safe; may never fire.
        reg(0x90, 0x5A, 'encoderPress');
    },

    // Palette-only LED output. paletteIdx (when present) is the
    // wire velocity. When absent — which happens when config uses
    // a plain RGB or 'mixxx' scheme — we fall back to palette 0
    // (black) and warn once, because the APC64 has no RGB path.
    send: function(ctrl, idx, rgb, hw, paletteIdx) {
        if (idx < 0) return;
        if (idx >= 0x100) return;   // strip LED range reserved

        var code = this._resolveHw(hw);
        var pal;
        if (typeof paletteIdx === 'number') {
            pal = paletteIdx & 0x7F;
        } else {
            myCatnip._warnOnce('apc64NoRGB',
                'APC64: LED write without paletteIdx — the device has no ' +
                'RGB path. Use a named index (e.g. \'yellow\') or ' +
                '{ paletteIdx: N } in the scheme.');
            pal = 0;
        }

        var packed = (code << 8) | pal;
        if (ctrl._ledCache[idx] === packed) return;
        ctrl._ledCache[idx] = packed;

        midi.sendShortMsg(0x90 + code, idx, pal);
    },

    blank: function(ctrl) {
        for (var i = 0; i <= 0x3F; i++) midi.sendShortMsg(0x90 + 6, i, 0);
    },

    anyPendingWrites: function(ctrl) { return false; },

    decodeLedCache: function(val) {
        if (typeof val !== 'number') return String(val);
        var code = (val >> 8) & 0x0F, pal = val & 0xFF;
        var name = _LED_MODE_NAMES[code] || ('?' + code);
        return name + ':' + pal;
    },

    _resolveHw: function(hw) {
        if (typeof hw === 'string') {
            var c = this.LED_MODES[hw];
            if (c === undefined) {
                myCatnip._warnOnce('apc64LedMode:' + hw,
                    'APC64: unknown LED mode "' + hw + '" — using full');
                return this.LED_MODES['full'];
            }
            return c;
        }
        if (typeof hw === 'number') {
            if (hw <= 0) return 0;
            if (hw >= 127) return 6;
            return Math.min(6, Math.round(hw / 127 * 6));
        }
        return 6;
    }
};