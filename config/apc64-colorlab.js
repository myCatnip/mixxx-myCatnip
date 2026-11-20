// config/apc64-colorlab.js — APC64 palette lab.
//
// APC64ColorLabController extends Controller. State:
//   currentIdx   palette index 0-127 (section*16 + option)
//   currentMode  LED_MODES key ('full', 'pulse.quarter', ...)
//   editSlot     custom-pad index 0-23 being edited
//   armedLoad    yellow button state
//   saved[24]    { idx, mode } or null per custom slot
//
// Every custom pad's LED is a cached {rgb, paletteIdx} scheme
// object; _evaluateScheme's ref-identity memo hits on repeat
// renders so nothing recompiles while state is stable.
//
// DAW-mode handshake + Session-view lock in _initExtra. Exit
// handshake (unconditional) in _shutdownExtra.

var F = myCatnip.FUNCS;

// Fixed-colour button palette indices.
var APC64_WHITE_IDX  = 3;
var APC64_RED_IDX    = 5;
var APC64_GREEN_IDX  = 15;
var APC64_YELLOW_IDX = 18;

// ============================================================
// CONTROLLER
// ============================================================
myCatnip.APC64ColorLabController = function(cfg) {
    myCatnip.Controller.call(this, cfg);

    this._lab = {
        currentIdx:   0,
        currentMode:  'full',
        editSlot:     0,
        armedLoad:    false,
        saved:        new Array(24).fill(null),
        startupIdx:   0,
        startupMode:  'full',
        startupSlot:  0,
        menuSelected: 'dump'
    };

    this._schemeCache = {};
};

myCatnip.APC64ColorLabController.prototype = Object.create(myCatnip.Controller.prototype);
myCatnip.APC64ColorLabController.prototype.constructor = myCatnip.APC64ColorLabController;

// ============================================================
// LIFECYCLE
// ============================================================
myCatnip.APC64ColorLabController.prototype._initExtra = function() {
    this._apc64SendDawEnter();
    this._apc64SetView(0);   // Session
    this._refreshAllLeds('apc64-init');
    this._apc64RefreshOLED();
};

myCatnip.APC64ColorLabController.prototype._shutdownExtra = function() {
    this._dumpPalette();
    this._apc64SendDawExit();
};

// ============================================================
// SYSEX
// ============================================================
myCatnip.APC64ColorLabController.prototype._apc64SendSysex = function(bytes) {
    midi.sendSysexMsg(bytes, bytes.length);
};

myCatnip.APC64ColorLabController.prototype._apc64SendDawEnter = function() {
    this._apc64SendSysex([0xF0,0x47,0x00,0x53,0x1B,0x00,0x01,0x00,0xF7]);
    this._apc64SendSysex([0xF0,0x47,0x00,0x53,0x19,0x00,0x01,0x00,0xF7]);
    this._apc64SendSysex([0xF0,0x7E,0x7F,0x06,0x01,0xF7]);
    this._apc64SendSysex([0xF0,0x47,0x00,0x53,0x1C,0x00,0x01,0x01,0xF7]);
};

myCatnip.APC64ColorLabController.prototype._apc64SendDawExit = function() {
    this._apc64SendSysex([0xF0,0x47,0x00,0x53,0x1C,0x00,0x01,0x00,0xF7]);
};

myCatnip.APC64ColorLabController.prototype._apc64SetView = function(mode) {
    this._apc64SendSysex([0xF0,0x47,0x00,0x53,0x19,0x00,0x01,mode,0xF7]);
};

// Fixed-width OLED frame, verified against apc64-control's
// _apc64_host/protocol/test_sysex.py:
//   F0 47 00 53 10 00 10 <row> <14 chars> 00 F7
// Payload is always 16 bytes: row, 14 space-padded characters,
// one 0x00. A short, unpadded payload leaves the rest of the
// fixed-width field holding stale display RAM — that is what
// produced the garbled "fullEA23..." text.
myCatnip.APC64ColorLabController.prototype._apc64SetOLED = function(row, text) {
    var t = String(text === undefined || text === null ? '' : text);
    if (t.length > 14) t = t.substring(0, 14);
    while (t.length < 14) t += ' ';

    var bytes = [
        0xF0, 0x47, 0x00, 0x53, 0x10,
        0x00, 16,
        row & 0x7F
    ];
    for (var i = 0; i < 14; i++) {
        var b = t.charCodeAt(i);
        bytes.push(b > 127 ? 63 : b);
    }
    bytes.push(0x00, 0xF7);
    this._apc64SendSysex(bytes);
};

myCatnip.APC64ColorLabController.prototype._apc64RefreshOLED = function() {
    var lab = this._lab;
    if (lab.armedLoad) {
        this._apc64SetOLED(0, 'ARMED');
        this._apc64SetOLED(1, 'pick custom pad');
        return;
    }
    var idx = lab.currentIdx;
    var name = (this.hw.INDEX_TO_NAME && this.hw.INDEX_TO_NAME[idx]) || '?';
    this._apc64SetOLED(0, 'idx ' + idx);
    this._apc64SetOLED(1, name + ' ' + lab.currentMode);
};

// ============================================================
// SCHEME CACHE
// ============================================================
myCatnip.APC64ColorLabController.prototype._paletteScheme = function(idx, mode) {
    var key = idx + ':' + mode;
    if (this._schemeCache[key]) return this._schemeCache[key];
    // The APC64 has no RGB path; the entry carries paletteIdx only.
    // rgb is required by the framework's object-entry shape check
    // and is never read on the wire.
    var scheme = {
        colors: [{ rgb: [0, 0, 0], brightness: mode, paletteIdx: idx }]
    };
    this._schemeCache[key] = scheme;
    return scheme;
};

// ============================================================
// PER-PAD SCHEMES
// ============================================================
myCatnip.APC64ColorLabController.prototype._renderCustomPadScheme = function(n) {
    var lab = this._lab;
    if (n === lab.editSlot) {
        return this._paletteScheme(lab.currentIdx, lab.currentMode);
    }
    var saved = lab.saved[n];
    if (!saved) return this._paletteScheme(0, 'full');
    return this._paletteScheme(saved.idx, saved.mode);
};

myCatnip.APC64ColorLabController.prototype._renderSectionScheme = function(s) {
    return this._paletteScheme(s * 16, this._lab.currentMode);
};

myCatnip.APC64ColorLabController.prototype._renderOptionScheme = function(o) {
    var section = Math.floor(this._lab.currentIdx / 16);
    return this._paletteScheme(section * 16 + o, this._lab.currentMode);
};

myCatnip.APC64ColorLabController.prototype._renderBrightPlusPreview = function() {
    return this._paletteScheme(APC64_WHITE_IDX,
        this._stepScalar(this._lab.currentMode, 1, 0, 6));
};
myCatnip.APC64ColorLabController.prototype._renderBrightMinusPreview = function() {
    return this._paletteScheme(APC64_WHITE_IDX,
        this._stepScalar(this._lab.currentMode, -1, 0, 6));
};
myCatnip.APC64ColorLabController.prototype._renderModePlusPreview = function() {
    return this._paletteScheme(APC64_WHITE_IDX,
        this._stepScalar(this._lab.currentMode, 1, 7, 15));
};
myCatnip.APC64ColorLabController.prototype._renderModeMinusPreview = function() {
    return this._paletteScheme(APC64_WHITE_IDX,
        this._stepScalar(this._lab.currentMode, -1, 7, 15));
};

myCatnip.APC64ColorLabController.prototype._renderArmLoadButton = function() {
    return this._paletteScheme(
        this._lab.armedLoad ? APC64_GREEN_IDX : APC64_YELLOW_IDX, 'full');
};

myCatnip.APC64ColorLabController.prototype._renderSaveButton = function() {
    var lab = this._lab;
    var saved = lab.saved[lab.editSlot];
    var matches = saved && saved.idx === lab.currentIdx && saved.mode === lab.currentMode;
    return this._paletteScheme(matches ? APC64_GREEN_IDX : APC64_RED_IDX, 'full');
};

// ============================================================
// STATE MUTATIONS
// ============================================================
myCatnip.APC64ColorLabController.prototype._selectCustomSlot = function(n) {
    var lab = this._lab;
    if (lab.armedLoad) {
        lab.armedLoad = false;
        var saved = lab.saved[n];
        if (!saved) {
            lab.currentIdx  = lab.startupIdx;
            lab.currentMode = lab.startupMode;
            lab.editSlot    = lab.startupSlot;
        } else {
            lab.currentIdx  = saved.idx;
            lab.currentMode = saved.mode;
            lab.editSlot    = n;
        }
        this._labRender();
        return;
    }
    lab.editSlot = n;
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._selectSection = function(s) {
    this._lab.currentIdx = s * 16;
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._selectOption = function(o) {
    var section = Math.floor(this._lab.currentIdx / 16);
    this._lab.currentIdx = section * 16 + o;
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._stepBrightness = function(dir) {
    this._lab.currentMode = this._stepScalar(this._lab.currentMode, dir, 0, 6);
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._stepMode = function(dir) {
    this._lab.currentMode = this._stepScalar(this._lab.currentMode, dir, 7, 15);
    this._labRender();
};

// Step within [lo, hi] behaviour codes, wrapping. From outside
// the range, enter at lo (dir>0) or hi (dir<0).
myCatnip.APC64ColorLabController.prototype._stepScalar = function(mode, dir, lo, hi) {
    var codes = this.hw.LED_MODES;
    var names = this.hw.LED_MODE_NAMES;
    var cur = codes[mode];
    if (cur === undefined) cur = 6;
    var target;
    if (cur < lo || cur > hi) {
        target = (dir > 0) ? lo : hi;
    } else {
        var span = hi - lo + 1;
        target = lo + (((cur - lo) + dir) % span + span) % span;
    }
    return names[target];
};

myCatnip.APC64ColorLabController.prototype._toggleArmLoad = function() {
    this._lab.armedLoad = !this._lab.armedLoad;
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._saveCurrent = function() {
    var lab = this._lab;
    lab.saved[lab.editSlot] = { idx: lab.currentIdx, mode: lab.currentMode };
    this._labRender();
};

myCatnip.APC64ColorLabController.prototype._executeMenu = function() {
    if (this._lab.menuSelected === 'dump') this._dumpPalette();
};

myCatnip.APC64ColorLabController.prototype._dumpPalette = function() {
    var lab = this._lab;
    var lines = ['myCatnip.APC64_USER_PALETTE = ['];
    for (var i = 0; i < 24; i++) {
        var s = lab.saved[i];
        if (s) {
            lines.push("    { paletteIdx: " + s.idx + ", mode: '" + s.mode + "' },");
        } else {
            lines.push('    null,');
        }
    }
    lines.push('];');
    print('\n' + lines.join('\n') + '\n');
};

myCatnip.APC64ColorLabController.prototype._labRender = function() {
    this._refreshAllLeds('apc64-lab');
    this._apc64RefreshOLED();
};

// ============================================================
// FUNCS
// ============================================================
F.apc64SelectCustomSlot = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0 || n >= 24) return;
    this._ctrl._selectCustomSlot(n);
};
F.apc64SelectSection = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0 || n > 7) return;
    this._ctrl._selectSection(n);
};
F.apc64SelectOption = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var n = parseInt(args[0], 10);
    if (isNaN(n) || n < 0 || n > 15) return;
    this._ctrl._selectOption(n);
};
F.apc64BrightStep = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._stepBrightness(parseInt(args[0], 10));
};
F.apc64ModeStep = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._stepMode(parseInt(args[0], 10));
};
F.apc64ArmLoad = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._toggleArmLoad();
};
F.apc64SaveTo = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._saveCurrent();
};
F.apc64EncoderTurn = function(args, ch, c, v, s) {
    this._ctrl._apc64RefreshOLED();
};
F.apc64EncoderPress = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._executeMenu();
};

// ============================================================
// LAYER
// ============================================================
(function buildLayer() {
    var layer = {};

    for (var n = 0; n < 24; n++) {
        (function(n) {
            layer['customPad' + n] = {
                func: F.apc64SelectCustomSlot, args: [n],
                type: 'push',
                colorScheme: {
                    scheme: function() { return this._ctrl._renderCustomPadScheme(n); },
                    on: true
                }
            };
        })(n);
    }

    for (var s = 0; s < 8; s++) {
        (function(s) {
            layer['section' + s] = {
                func: F.apc64SelectSection, args: [s],
                colorScheme: {
                    scheme: function() { return this._ctrl._renderSectionScheme(s); },
                    on: true
                }
            };
        })(s);
    }

    for (var o = 0; o < 16; o++) {
        (function(o) {
            layer['palOption' + o] = {
                func: F.apc64SelectOption, args: [o],
                colorScheme: {
                    scheme: function() { return this._ctrl._renderOptionScheme(o); },
                    on: true
                }
            };
        })(o);
    }

    layer.brightPlus  = { func: F.apc64BrightStep, args: [1],
        colorScheme: { scheme: function() { return this._ctrl._renderBrightPlusPreview(); }, on: true } };
    layer.brightMinus = { func: F.apc64BrightStep, args: [-1],
        colorScheme: { scheme: function() { return this._ctrl._renderBrightMinusPreview(); }, on: true } };
    layer.modePlus    = { func: F.apc64ModeStep, args: [1],
        colorScheme: { scheme: function() { return this._ctrl._renderModePlusPreview(); }, on: true } };
    layer.modeMinus   = { func: F.apc64ModeStep, args: [-1],
        colorScheme: { scheme: function() { return this._ctrl._renderModeMinusPreview(); }, on: true } };

    layer.armLoad = { func: F.apc64ArmLoad,
        colorScheme: { scheme: function() { return this._ctrl._renderArmLoadButton(); }, on: true } };
    layer.saveTo  = { func: F.apc64SaveTo,
        colorScheme: { scheme: function() { return this._ctrl._renderSaveButton(); }, on: true } };

    layer.demoPlay = { group: '[Channel1]', inKey: 'play', outKey: 'play_indicator',
        colorScheme: { scheme: { colors: ['green, full'] } } };
    layer.demoCue  = { group: '[Channel1]', inKey: 'cue_default', outKey: 'cue_indicator',
        colorScheme: { scheme: { colors: ['orange, full'] } } };

    layer.encoderTurn  = { func: F.apc64EncoderTurn };
    layer.encoderPress = { func: F.apc64EncoderPress };

    myCatnip.APC64_LAB_LAYER = layer;
})();