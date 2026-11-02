'use strict';

var H = require('./helpers');

function setupLab() {
    return H.bootLab({
        patches: {colorLab: {}},
        initialPatches: ['colorLab']
    });
}

// ── bakeScheme: structural ─────────────────────────────────

test('bakeScheme: structural, one entry per stop', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,127,0], [0,0,127]]};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.colors.length, 3);
    t.eq(out.colors[0][0], 127);
    t.eq(out.colors[1][1], 127);
    t.eq(out.colors[2][2], 127);
});

test('bakeScheme: structural preserves brightness', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0, 60]]};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.colors[0][3], 60);
});

test('bakeScheme: structural preserves ratio as span fractions', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,127,0], [0,0,127]], ratio: [3, 1, 1]};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.ratio.length, 3);
    t.approx(out.ratio[0], 0.6, 1e-6);
    t.approx(out.ratio[1], 0.2, 1e-6);
    t.approx(out.ratio[2], 0.2, 1e-6);
});

test('bakeScheme: structural preserves schemePosition', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], schemePosition: 90};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.schemePosition, 90);
});

test('bakeScheme: structural preserves curve', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], curve: 0.5};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.curve, 0.5);
});

test('bakeScheme: structural omits default schemePosition', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], schemePosition: 63.5};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.schemePosition, undefined);
});

test('bakeScheme: structural omits zero curve', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], curve: 0};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.curve, undefined);
});

// ── bakeScheme: all baked levels keep source stop count ────

test('bakeScheme: bakedInterp keeps source stop count', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127], [0,127,0]]};
    var out = XoneK3.bakeScheme(s, c, 'bakedInterp');
    t.eq(out.colors.length, 3);
});

test('bakeScheme: baked keeps source stop count', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127], [0,127,0]]};
    var out = XoneK3.bakeScheme(s, c, 'baked');
    t.eq(out.colors.length, 3);
});

test('bakeScheme: export keeps source stop count', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127], [0,127,0]]};
    var out = XoneK3.bakeScheme(s, c, 'export');
    t.eq(out.colors.length, 3);
});

// ── bakeScheme: calibration baked into brightness ─────────

test('bakeScheme: bakedInterp sets calibration false', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]]};
    var out = XoneK3.bakeScheme(s, c, 'bakedInterp');
    t.eq(out.calibration, false);
});

test('bakeScheme: baked sets calibration false', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]]};
    var out = XoneK3.bakeScheme(s, c, 'baked');
    t.eq(out.calibration, false);
});

test('bakeScheme: export sets calibration false', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]]};
    var out = XoneK3.bakeScheme(s, c, 'export');
    t.eq(out.calibration, false);
});

test('bakeScheme: structural leaves calibration alone', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]]};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.calibration, undefined);
});

// ── bakeScheme: interp ────────────────────────────────────

test('bakeScheme: bakedInterp forces interp true', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]], interp: false};
    var out = XoneK3.bakeScheme(s, c, 'bakedInterp');
    t.eq(out.interp, true);
});

test('bakeScheme: baked forces interp false', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]], interp: true};
    var out = XoneK3.bakeScheme(s, c, 'baked');
    t.eq(out.interp, false);
});

test('bakeScheme: export keeps source interp', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,0,127]], interp: false};
    var out = XoneK3.bakeScheme(s, c, 'export');
    t.eq(out.interp, false);
});

// ── bakeScheme: brightnessScale ───────────────────────────

test('bakeScheme: brightnessScale kept on structural', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], brightnessScale: 0.5};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.brightnessScale, 0.5);
});

test('bakeScheme: brightnessScale dropped on baked levels', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], brightnessScale: 0.5};
    var levels = ['bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.eq(out.brightnessScale, undefined, levels[i]);
    }
});

// ── bakeScheme: curve / schemePosition / ratio live ────────

test('bakeScheme: curve live on every level', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], curve: 0.5};
    var levels = ['structural', 'bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.eq(out.curve, 0.5, levels[i]);
    }
});

test('bakeScheme: schemePosition live on every level', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], schemePosition: 90};
    var levels = ['structural', 'bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.eq(out.schemePosition, 90, levels[i]);
    }
});

test('bakeScheme: ratio live on every level', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,127,0], [0,0,127]], ratio: [3, 1, 1]};
    var levels = ['structural', 'bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.approx(out.ratio[0], 0.6, 1e-6, levels[i]);
        t.approx(out.ratio[1], 0.2, 1e-6, levels[i]);
        t.approx(out.ratio[2], 0.2, 1e-6, levels[i]);
    }
});

// ── bakeScheme: inheritance ────────────────────────────────

test('bakeScheme: beat survives every level', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], beat: {color: 'red'}};
    var levels = ['structural', 'bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.ok(out.beat, 'beat missing at ' + levels[i]);
    }
});

test('bakeScheme: marker carried through every level', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0], [0,127,0]],
             markerColor: 'white', markerWidth: 4};
    var levels = ['structural', 'bakedInterp', 'baked', 'export'];
    for (var i = 0; i < levels.length; i++) {
        var out = XoneK3.bakeScheme(s, c, levels[i]);
        t.eq(out.markerWidth, 4);
        t.ok(out.markerColor);
    }
});

test('bakeScheme: offScheme carried', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], offScheme: 'myOff'};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.offScheme, 'myOff');
});

test('bakeScheme: coScheme carried', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], coScheme: 'myCo'};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.coScheme, 'myCo');
});

test('bakeScheme: reverse carried', function(t) {
    var c = setupLab();
    var s = {colors: [[127,0,0]], reverse: true};
    var out = XoneK3.bakeScheme(s, c, 'structural');
    t.eq(out.reverse, true);
});

// ── bakeScheme: edge cases ─────────────────────────────────

test('bakeScheme: null for missing ref', function(t) {
    var c = setupLab();
    t.eq(XoneK3.bakeScheme(null, c, 'structural'), null);
    t.eq(XoneK3.bakeScheme('noSuchScheme', c, 'structural'), null);
});

test('bakeScheme: null for partial without colors', function(t) {
    var c = setupLab();
    t.eq(XoneK3.bakeScheme({markerWidth: 2}, c, 'structural'), null);
});

// ── emitSchemeLines: header / defaults ─────────────────────

function emit(name, scheme, offOverride, coOverride) {
    var L = [];
    XoneK3._emitSchemeLines(L, name,
        XoneK3.resolveScheme(scheme), offOverride, coOverride);
    return L.join('\n');
}

test('emitSchemeLines: minimal scheme header', function(t) {
    var txt = emit('test', {colors: [[127,0,0]]});
    t.contains(txt, 'XoneK3.SCHEMES.test = {');
    t.contains(txt, 'colors:');
    t.contains(txt, '[127, 0, 0]');
});

test('emitSchemeLines: default fields elided', function(t) {
    var txt = emit('test', {colors: [[127,0,0]]});
    t.notOk(txt.indexOf('markerColor')   !== -1);
    t.notOk(txt.indexOf('curve')         !== -1);
    t.notOk(txt.indexOf('brightnessScale') !== -1);
});

test('emitSchemeLines: non-default fields present', function(t) {
    var txt = emit('test', {colors: [[127,0,0]], curve: 0.5, brightnessScale: 0.8});
    t.contains(txt, 'curve: 0.5');
    t.contains(txt, 'brightnessScale: 0.8');
});

test('emitSchemeLines: marker emitted when non-default', function(t) {
    var txt = emit('test', {colors: [[127,0,0]], markerColor: 'red'});
    t.contains(txt, 'markerColor:');
});

// ── emitSchemeLines: colors forms ──────────────────────────

test('emitSchemeLines: array color with brightness', function(t) {
    var txt = emit('test', {colors: [[127,0,0,80]]});
    t.contains(txt, '[127, 0, 0, 80]');
});

test('emitSchemeLines: palette names quoted', function(t) {
    var txt = emit('test', {colors: ['red', 'green, 40']});
    t.contains(txt, "'red'");
    t.contains(txt, "'green, 40'");
});

// ── emitSchemeLines: beat block ────────────────────────────

test('emitSchemeLines: beat block one field per line', function(t) {
    var txt = emit('test', {colors: [[127,0,0]],
                             beat: {color: 'red', barBeats: 4, phraseBars: 4}});
    t.contains(txt, 'beat: {');
    t.contains(txt, 'barBeats:');
    t.contains(txt, 'color:');
});

test('emitSchemeLines: beat sub-objects inline', function(t) {
    var txt = emit('test', {colors: [[127,0,0]],
                             beat: {bar: {color: 'green'},
                                    phrase: {color: [10,20,30], brightness: 50}}});
    t.contains(txt, 'bar: {');
    t.contains(txt, 'phrase: {');
    t.contains(txt, 'brightness: 50');
});

test('emitSchemeLines: disabled beat omitted', function(t) {
    var txt = emit('test', {colors: [[127,0,0]],
                             beat: {enabled: false, color: 'red'}});
    t.notOk(txt.indexOf('beat:') !== -1);
});

// ── emitSchemeLines: ratio trim ────────────────────────────

test('emitSchemeLines: trailing ones trimmed from ratio', function(t) {
    var txt = emit('test', {
        colors: [[127,0,0], [0,127,0], [0,0,127]],
        ratio: [3, 1, 1]
    });
    t.contains(txt, 'ratio: [3]');
});

test('emitSchemeLines: all-ones ratio omitted', function(t) {
    var txt = emit('test', {
        colors: [[127,0,0], [0,127,0]],
        ratio: [1, 1]
    });
    t.notOk(txt.indexOf('ratio:') !== -1);
});

// ── emitSchemeLines: off/co linking ────────────────────────

test('emitSchemeLines: off override links the slot', function(t) {
    var txt = emit('name', {colors: [[127,0,0]]}, 'name_off');
    t.contains(txt, "offScheme: 'name_off'");
});

test('emitSchemeLines: co override links the slot', function(t) {
    var txt = emit('name', {colors: [[127,0,0]]}, undefined, 'name_co');
    t.contains(txt, "coScheme: 'name_co'");
});

test('emitSchemeLines: co override null is elided', function(t) {
    // _emitSchemeFields deliberately skips coScheme when null —
    // emitting coScheme: null on reload would disable the default
    // coMatch steering ramp (see compileScheme). Passing null as
    // coOverride means "no override", not "emit null".
    var txt = emit('name', {colors: [[127,0,0]]}, undefined, null);
    t.notOk(txt.indexOf('coScheme:') !== -1);
});