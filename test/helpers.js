// test/helpers.js

'use strict';

exports.ctrl = function(opts) {
    var cfg = Object.assign({
        label: 'test',
        midiChannel: 0x0E,
        initialDeckA: 1, initialDeckB: 2,
        initialFxA: 1,   initialFxB: 2,
        initialActiveDeck: 'A',
        initialActiveFx:   'A',
        initialPatches: [],
        patches: {},
        calibration: 'linearTest',
        calibrationMode: 'off',
        wbActive: false,
        wbGain: [1, 1, 1],
        channelPerceptual: [1, 1, 1],
        hkBoost: 0,
        lumGamma: 1,
        sysex: true
    }, opts || {});
    var c = new myCatnip.Controller(cfg);
    c.init();
    c.hw.wireInputs(c);
    return c;
};

exports.bootCat = function(overrides) {
    var cfg = Object.assign({
        label: 'test-cat',
        midiChannel: 0x0E,
        calibration: 'linearTest',
        calibrationMode: 'off',
        wbActive: false,
        wbGain: [1, 1, 1],
        channelPerceptual: [1, 1, 1],
        hkBoost: 0,
        lumGamma: 1
    }, overrides || {});
    myCatnip.bootCat(cfg);
    return myCatnip.controllers[myCatnip.controllers.length - 1];
};

exports.bootLab = function(overrides) {
    var cfg = Object.assign({
        label: 'test-lab',
        midiChannel: 0x0D,
        calibration: 'linearTest',
        calibrationMode: 'off',
        wbActive: false,
        wbGain: [1, 1, 1],
        channelPerceptual: [1, 1, 1],
        hkBoost: 0,
        lumGamma: 1,
        modePrints: false,
        debugPrints: false
    }, overrides || {});
    myCatnip.bootLab([cfg]);
    return myCatnip.controllers[myCatnip.controllers.length - 1];
};

exports.bootMulti = function(devices) {
    myCatnip.boot(devices);
    return myCatnip.controllers;
};

// Apply a binding AND update _applied so cell-discovery helpers
// (_findCellsByFunc, _claimedCells, Lab painters) see it.
exports.bind = function(ctrl, name, cfg) {
    var m = Object.assign({}, ctrl._applied);
    if (cfg === null || cfg === undefined) delete m[name];
    else m[name] = cfg;
    ctrl._applyResolved(m);
};

exports.send = function(ctrl, name, value) {
    var b = ctrl.bindings[name];
    if (!b) throw new Error('send: no binding "' + name + '"');
    midi._input(b.midi[0], b.midi[1], value);
};
exports.press   = function(ctrl, name)    { exports.send(ctrl, name, 127); };
exports.release = function(ctrl, name)    { exports.send(ctrl, name, 0);   };
exports.turn    = function(ctrl, name, v) { exports.send(ctrl, name, v);   };

exports.fireCO = function(group, key, value) {
    engine._set(group, key, value);
    engine._trigger(group, key, value);
};
exports.setCO = function(group, key, value) { engine._set(group, key, value); };
exports.getCO = function(group, key)        { return engine.getValue(group, key); };

exports.led = function(ctrl, name) {
    var b = ctrl.bindings[name];
    if (!b || b.idx < 0) return null;
    return exports.ledAt(b.idx);
};

exports.ledAt = function(idx) {
    var arr = midi._sysex;
    for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i][8] === idx) {
            var m = arr[i];
            return { idx: idx, r: m[9], g: m[10], b: m[11], hw: m[12] };
        }
    }
    return null;
};

exports.allLeds = function() {
    var out = [];
    for (var i = 0; i < midi._sysex.length; i++) {
        var m = midi._sysex[i];
        out.push({ idx: m[8], r: m[9], g: m[10], b: m[11], hw: m[12] });
    }
    return out;
};

// Clear the mock message log. Pass a controller to also reset its
// _ledCache, so the next render actually writes (otherwise
// identical-value sends are suppressed and midi._sysex stays
// empty).
exports.clearLeds = function(ctrl) {
    midi._sysex = [];
    midi._short = [];
    if (ctrl) ctrl._ledCache = {};
};