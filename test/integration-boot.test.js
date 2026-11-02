'use strict';

var H = require('./helpers');

// End-to-end boot: real Cat config, real _bootWith, real wiring.

// ── Cat default boot ────────────────────────────────────────

test('bootCat: registers one controller', function(t) {
    H.bootCat();
    t.eq(XoneK3.controllers.length, 1);
    t.eq(XoneK3.controllers[0].label, 'test-cat');
});

test('bootCat: initialPatches honoured', function(t) {
    var c = H.bootCat();
    t.contains(c.activePatches, 'topShared');
    t.contains(c.activePatches, 'fxLayout1');
    t.contains(c.activePatches, 'cue');
});

test('bootCat: focus boots to deck A / fx A', function(t) {
    var c = H.bootCat();
    t.eq(c.activeDeck, 'A');
    t.eq(c.activeFx, 'A');
    t.eq(c.selectedDeckCurrent, 1);
    t.eq(c.selectedFxCurrent, 1);
});

test('bootCat: fxLayout alignment when initialFxA differs', function(t) {
    var c = H.bootCat({
        initialPatches: ['topShared', 'fxLayout2', 'cue'],
        initialFxA: 3
    });
    t.contains(c.activePatches, 'fxLayout3');
    t.notOk(c.activePatches.indexOf('fxLayout2') !== -1);
});

test('bootCat: every binding wired to midi input handler', function(t) {
    var c = H.bootCat();
    var fired = 0;
    c._applyBinding('press0', {
        func: function() { fired++; }
    });
    H.press(c, 'press0');
    t.eq(fired, 1);
});

// ── oneK3-equivalent boot ───────────────────────────────────

test('bootCat: twoDeck initialPatches', function(t) {
    // initialFxB=2 makes fxLayoutB1 align to fxLayoutB2.
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue'],
        initialFxB: 2
    });
    t.contains(c.activePatches, 'twoDeck');
    t.contains(c.activePatches, 'fxLayoutA1');
    t.contains(c.activePatches, 'fxLayoutB2');
});

// ── mini boot ──────────────────────────────────────────────

test('bootCat: twoDeckMini initialPatches', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeckMini', 'fxMini1', 'cue']});
    t.contains(c.activePatches, 'twoDeckMini');
    t.contains(c.activePatches, 'fxMini1');
});

// ── Kitten-equivalent boot ─────────────────────────────────

test('bootCat: initialActiveDeck B / initialActiveFx B', function(t) {
    // Force 2/2 so selectedDeckCurrent / selectedFxCurrent land
    // on a specific channel independent of the test fixture's
    // slot B defaults.
    var c = H.bootCat({
        initialActiveDeck: 'B',
        initialActiveFx: 'B',
        initialDeckB: 2,
        initialFxB: 2
    });
    t.eq(c.activeDeck, 'B');
    t.eq(c.activeFx, 'B');
    t.eq(c.selectedDeckCurrent, 2);
    t.eq(c.selectedFxCurrent, 2);
});

// ── multi-device ────────────────────────────────────────────

test('bootMulti: two controllers, distinct channels', function(t) {
    var cs = H.bootMulti([
        {label: 'a', midiChannel: 0x0E, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1},
        {label: 'b', midiChannel: 0x0D, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1}
    ]);
    t.eq(cs.length, 2);
    t.eq(cs[0].midiChannel, 0x0E);
    t.eq(cs[1].midiChannel, 0x0D);
    t.neq(cs[0], cs[1]);
});

test('bootMulti: each owns its own bindings map', function(t) {
    var cs = H.bootMulti([
        {label: 'a', midiChannel: 0x0E, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1},
        {label: 'b', midiChannel: 0x0D, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1}
    ]);
    t.neq(cs[0].bindings, cs[1].bindings);
});

// ── halt ───────────────────────────────────────────────────

test('halt: shuts down every controller, clears array', function(t) {
    H.bootMulti([
        {label: 'a', midiChannel: 0x0E, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1},
        {label: 'b', midiChannel: 0x0D, patches: {}, initialPatches: [],
         calibration: 'linearTest', calibrationMode: 'off',
         wbActive: false, wbGain: [1,1,1],
         channelPerceptual: [1,1,1], hkBoost: 0, lumGamma: 1}
    ]);
    XoneK3.halt();
    t.eq(XoneK3.controllers.length, 0);
});

// ── boot reset of per-process state ─────────────────────────

test('boot resets _warned', function(t) {
    XoneK3._warned['pretend'] = true;
    H.bootCat();
    t.notOk(XoneK3._warned['pretend']);
});

test('boot resets _schemeCache / _compiledCache', function(t) {
    XoneK3._schemeCache['junk'] = 1;
    XoneK3._compiledCache['junk'] = 1;
    H.bootCat();
    t.notOk(XoneK3._schemeCache['junk']);
    t.notOk(XoneK3._compiledCache['junk']);
});

// ── all LEDs blanked at boot ────────────────────────────────

test('boot blanks every LED', function(t) {
    H.bootCat();
    var blacks = 0;
    for (var i = 0; i < midi._sysex.length; i++) {
        var m = midi._sysex[i];
        if (m[9] === 0 && m[10] === 0 && m[11] === 0 && m[12] === 0) blacks++;
    }
    t.ok(blacks > 10, 'only ' + blacks + ' black frames sent at boot');
});