'use strict';

var H = require('./helpers');

// Full colorLab workflow: preview, edit, save, dump.

function setup() {
    return H.bootLab({
        patches: {
            colorLabTop:         {},
            colorLabTopShift:    {},
            colorLab:            {},
            colorLabShift:       {},
            slots:               {},
            slotsShift:          {},
            colorLabBeat:        {_host: 'colorLab'},
            colorLabBeatShift:   {},
            chord:               {}
        },
        initialPatches: ['colorLabTop', 'colorLab'],
        ledTargetGroups: {calib: ['grid0_0', 'grid1_0', 'grid2_0', 'grid3_0']},
        labPreviewTarget: 'button0_0',
        markerTarget:     'grid3_3',
        debugPrints: false,
        modePrints:  false
    });
}

// ── boot ───────────────────────────────────────────────────

test('lab boot: colorLab + colorLabTop active', function(t) {
    var c = setup();
    t.ok(c._patchActive('colorLab'));
    t.ok(c._patchActive('colorLabTop'));
});

test('lab boot: slot 0 seeded with labDefault', function(t) {
    var c = setup();
    t.ok(c._lab.slots[0]);
    t.ok(Array.isArray(c._lab.slots[0].colors));
});

test('lab boot: edit buffer is one-stop default', function(t) {
    var c = setup();
    t.ok(Array.isArray(c._lab.edit.colors));
    t.ok(c._lab.edit.colors.length >= 1);
});

// ── build a ramp via MIDI ─────────────────────────────────

test('build ramp: extend to 2 stops by pressing segment 1', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[127,0,0]]};
    c._lab._version++;

    H.bind(c, 'grid1_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid1_0']
    });
    H.press(c, 'grid1_0');

    t.eq(c._lab.selectedSegment, 1);
    t.eq(c._lab.edit.colors.length, 2);
});

test('build ramp: RGB edit on selected segment', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[0,0,0]]};
    c._lab._version++;
    c._lab.selectedSegment = 0;

    H.bind(c, 'encoder0', {
        func: XoneK3.FUNCS.ledRGB, args: ['r']
    });
    H.send(c, 'encoder0', 1);
    H.send(c, 'encoder0', 1);
    H.send(c, 'encoder0', 1);
    t.eq(c._lab.edit.colors[0][0], 3);
});

test('build ramp: fader writes absolute', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[0,0,0]]};
    c._lab._version++;
    c._lab.selectedSegment = 0;

    H.bind(c, 'fader0', {
        func: XoneK3.FUNCS.ledFader, args: ['g']
    });
    H.send(c, 'fader0', 64);
    var g = c._lab.edit.colors[0][1];
    t.ok(g >= 62 && g <= 65);
});

// ── save arm + slot save ──────────────────────────────────

test('save workflow: arm + press slot', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[100, 50, 25]]};
    c._lab._version++;

    c.replacePatch('colorLab', 'slots');
    t.ok(c._patchActive('slots'));

    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [5]
    });
    H.bind(c, 'pressR', {
        func: XoneK3.FUNCS.labArmSave
    });
    H.press(c, 'pressR');
    t.eq(c._lab.saveArmed, true);

    H.press(c, 'grid0_0');
    t.ok(c._lab.slots[5]);
    t.eq(c._lab.slots[5].colors[0][0], 100);
    t.eq(c._lab.saveArmed, false);
    t.ok(c._patchActive('colorLab'));
});

test('save workflow: slot save loads into edit', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[100, 50, 25]]};
    c._lab._version++;
    c._lab.slots[5] = {colors: [[1, 2, 3]]};

    c.replacePatch('colorLab', 'slots');
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [5]
    });
    H.bind(c, 'pressR', {
        func: XoneK3.FUNCS.labArmSave
    });

    H.press(c, 'pressR');
    H.press(c, 'grid0_0');

    t.eq(c._lab.edit.colors[0][0], 100);
});

// ── dump ──────────────────────────────────────────────────

test('dump preview: prints a scheme block', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[127, 0, 0], [0, 0, 127]]};
    c._lab._version++;

    H.bind(c, 'press0', {
        func: XoneK3.FUNCS.ledDumpScheme
    });
    _printLog.length = 0;
    H.press(c, 'press0');
    var joined = _printLog.join('\n');
    t.contains(joined, 'XoneK3.SCHEMES.NAME');
    t.contains(joined, '[127, 0, 0]');
});

test('dump preview: slot source uses slotN label', function(t) {
    var c = setup();
    c._lab.slots[5] = {colors: [[100, 100, 100]]};
    c._lab.previewSource = 5;
    c._lab.previewing = true;
    _printLog.length = 0;
    c._dumpPreview();
    var joined = _printLog.join('\n');
    t.contains(joined, 'XoneK3.SCHEMES.slot5');
});

test('dump preview: slot 0 inlines off/co chain as objects', function(t) {
    var c = setup();
    c._lab.slots[XoneK3.LAB_SLOT.ON] = {colors: [[127, 0, 0]]};
    c._lab.slots[XoneK3.LAB_SLOT.OFF] = {colors: [[10, 10, 10]]};
    c._lab.slots[XoneK3.LAB_SLOT.CO]  = {colors: [[40, 40, 40]]};
    c._lab.previewSource = XoneK3.LAB_SLOT.ON;
    _printLog.length = 0;
    c._dumpPreview();
    var joined = _printLog.join('\n');
    // LAB.md: slot 0 dumps the whole chain as one scheme object
    // with nested inline offScheme / coScheme objects (not string
    // references to sibling slots).
    t.contains(joined, 'offScheme: {');
    t.contains(joined, 'coScheme: {');
});

// ── beat edit overlay ──────────────────────────────────────
//
// grid2_3 must live inside a patch that stays active, otherwise
// addPatch()'s _recompute unbinds it between the two presses.
// Define it on colorLab (which is a base patch).

test('beat edit toggle: grid2_3 toggles colorLabBeat', function(t) {
    var c = H.bootLab({
        patches: {
            colorLabTop: {},
            colorLab: {
                grid2_3: { func: XoneK3.FUNCS.labBeatEditToggle, noLED: true }
            },
            colorLabBeat:     {_host: 'colorLab'},
            colorLabBeatShift:{},
            slots:      {},
            slotsShift: {},
            colorLabShift: {},
            chord:      {}
        },
        initialPatches: ['colorLabTop', 'colorLab'],
        ledTargetGroups: {calib: ['grid0_0']},
        labPreviewTarget: 'button0_0',
        markerTarget:     'grid3_3'
    });

    H.press(c, 'grid2_3');
    t.ok(c._patchActive('colorLabBeat'));
    H.release(c, 'grid2_3');
    H.press(c, 'grid2_3');
    t.notOk(c._patchActive('colorLabBeat'));
});

test('beat edit: select target and edit colour', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[0,0,0]], beat: {enabled: true}};
    c._lab._version++;
    c.activePatches = ['colorLabTop', 'colorLab', 'colorLabBeat'];

    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labBeatSelect, args: ['bar']
    });
    H.press(c, 'grid0_0');
    t.eq(c._lab.beatTarget, 'bar');

    H.bind(c, 'encoder0', {
        func: XoneK3.FUNCS.ledRGB, args: ['r']
    });
    H.send(c, 'encoder0', 1);
    H.send(c, 'encoder0', 1);
    t.eq(c._lab.edit.beat.bar.color[0], 2);
});

test('beat edit: toggle enabled', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[0,0,0]], beat: {enabled: true}};
    c._lab._version++;
    H.bind(c, 'grid0_1', {
        func: XoneK3.FUNCS.labBeatToggleEnabled
    });
    H.press(c, 'grid0_1');
    t.eq(c._lab.edit.beat.enabled, false);
});

test('beat edit: barBeats encoder', function(t) {
    var c = setup();
    c._lab.edit = {colors: [[0,0,0]], beat: {enabled: true}};
    c._lab._version++;
    H.bind(c, 'encoderL', {
        func: XoneK3.FUNCS.labBeatBarBeats
    });
    H.send(c, 'encoderL', 1);
    t.eq(c._lab.edit.beat.barBeats, 5);
});

// ── registry scroll ────────────────────────────────────────

test('scheme scroll: cycles through registry', function(t) {
    var c = setup();
    H.bind(c, 'encoderL', {
        func: XoneK3.FUNCS.labSchemeScroll
    });
    H.send(c, 'encoderL', 1);
    t.ok(c._lab.schemeName);
    t.eq(c._lab.previewing, true);
});

// ── slot grid paint ────────────────────────────────────────

test('slots grid: on-slot 0 painted green', function(t) {
    var c = setup();
    c.replacePatch('colorLab', 'slots');
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [0]
    });
    H.clearLeds(c);
    c._renderSlotLEDs();
    t.rgb(H.led(c, 'grid0_0'), 0, 127, 0);
});

// ── shutdown dump ──────────────────────────────────────────

test('shutdown: dumps populated slots', function(t) {
    var c = setup();
    c._lab.slots[5] = {colors: [[100, 100, 100]]};
    _printLog.length = 0;
    c.shutdown();
    var joined = _printLog.join('\n');
    t.contains(joined, 'slot 5');
});

test('shutdown: LAB_DUMP_ON_SHUTDOWN false silences', function(t) {
    XoneK3.LAB_DUMP_ON_SHUTDOWN = false;
    var c = setup();
    c._lab.slots[5] = {colors: [[100, 100, 100]]};
    _printLog.length = 0;
    c.shutdown();
    t.eq(_printLog.length, 0);
    XoneK3.LAB_DUMP_ON_SHUTDOWN = true;
});