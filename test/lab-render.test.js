// lab-render.test.js
'use strict';

var H = require('./helpers');

// Lab painters. Uses H.bind so cell-discovery helpers see the
// applied bindings, and H.clearLeds(c) to reset both the mock log
// and the controller's _ledCache.
//
// When a test mutates _lab.edit directly (bypassing an input
// func), it must bump _lab._version so _compiledPreview()
// invalidates. setEdit() does both.

function setupLab(overrides) {
    var cfg = Object.assign({
        patches: {
            colorLab:      {},
            colorLabShift: {},
            slots:         {},
            slotsShift:    {},
            colorLabBeat:  {_host: 'colorLab'}
        },
        initialPatches: ['colorLab'],
        ledTargetGroups: {calib: ['grid0_0', 'grid1_0', 'grid2_0']},
        labPreviewTarget: 'button0_0',
        markerTarget:     'grid3_3',
        labPreviewCO: {group: '[QuickEffectRack1_[Channel1]]', name: 'super1'}
    }, overrides || {});
    var c = H.bootLab(cfg);
    H.clearLeds(c);
    return c;
}

// Mutate the edit buffer AND invalidate the compile cache, the way
// a real input func would (via _onInput).
function setEdit(c, scheme) {
    c._lab.edit = scheme;
    c._lab._version++;
}

function setPreviewCO(v) {
    engine._params['[QuickEffectRack1_[Channel1]]|super1'] = v;
}

// Bind the CALIB_TARGET cells the segment painter paints. The real
// colorLab config binds every target via ledSelectTarget; without
// the binding, _renderSegmentGrid treats the cell as unbound and
// paints black (the overlay-null contract), which would mask what
// these tests are trying to assert.
function bindTargets(c, cells) {
    for (var i = 0; i < cells.length; i++) {
        H.bind(c, cells[i], {
            func: XoneK3.FUNCS.ledSelectTarget, args: [cells[i]]
        });
    }
}

// _renderSegmentGrid takes (compiled, onColorLab). Tests target
// that method directly, so supply the same two values _labRenderGrid
// would compute for them. Keeps the unit seam without going
// through marker paint side effects.
function renderSegments(c) {
    c._renderSegmentGrid(c._compiledPreview().compiled,
                         c._patchActive('colorLab'));
}

// ── _buildCellIndex / _findCellsByFunc ─────────────────────

test('_findCellsByFunc: finds cells by func id', function(t) {
    var c = setupLab();
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid0_0']
    });
    var cells = c._findCellsByFunc([XoneK3.FUNCS.ledSelectTarget]);
    t.hasKey(cells, 'grid0_0');
    t.eq(cells.grid0_0, ['grid0_0']);
});

test('_findCellsByFunc: caches until _applied changes', function(t) {
    var c = setupLab();
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid0_0']
    });
    c._findCellsByFunc([XoneK3.FUNCS.ledSelectTarget]);
    t.eq(c._cellIndexFor, c._applied);
});

test('_claimedCells: returns union of painter-owned cells', function(t) {
    var c = setupLab();
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [0]
    });
    var claimed = c._claimedCells();
    // _claimedCells returns a Set — membership via .has(), not hasKey.
    t.ok(claimed.has('grid0_0'));
});

// ── _renderSegmentGrid ────────────────────────────────────

test('_renderSegmentGrid: paints each stop', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0', 'grid2_0']);
    setEdit(c, {colors: [[127,0,0], [0,127,0], [0,0,127]]});
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
});

test('_renderSegmentGrid: in-range cell beyond stop count paints black', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0']);
    setEdit(c, {colors: [[127,0,0]]});   // 1 stop
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
    t.rgb(H.led(c, 'grid1_0'), 0, 0, 0);   // i=1 >= compiled.on.length=1
});

test('_renderSegmentGrid: honours {} null from overlay', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0']);
    setEdit(c, {colors: [[127,0,0]]});
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);

    // An overlay nulls the cell. The segment colour from the layer
    // below must not bleed through.
    H.bind(c, 'grid0_0', {});
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 0, 0, 0);
});

test('_renderSegmentGrid: unbound cell paints black', function(t) {
    var c = setupLab();
    // grid1_0 is in CALIB_TARGETS but has no binding at all.
    bindTargets(c, ['grid0_0']);
    setEdit(c, {colors: [[127,0,0], [0,127,0]]});
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid1_0'), 0, 0, 0);
});

// ── _renderSegmentGrid: shift highlights black cells ──────
//
// With shift held, black stops light white @ 50 so the user can
// find them for shift+press deletion. Display only — the scheme
// keeps black at that stop.

test('_renderSegmentGrid: shift highlights black cells white @ 50', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0']);
    setEdit(c, {colors: [[127,0,0], [0,0,0]]});
    c.modifiers.shift = true;
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
    var led = H.led(c, 'grid1_0');
    t.rgb(led, 127, 127, 127);
    t.hw(led, 50);
});

test('_renderSegmentGrid: black cells hide when not shifted', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0']);
    setEdit(c, {colors: [[127,0,0], [0,0,0]]});
    c.modifiers.shift = false;
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid1_0'), 0, 0, 0);
});

test('_renderSegmentGrid: shift does not touch non-black cells', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0', 'grid2_0']);
    setEdit(c, {colors: [[127,0,0], [0,127,0], [0,0,127]]});
    c.modifiers.shift = true;
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
    t.rgb(H.led(c, 'grid1_0'), 0, 127, 0);
    t.rgb(H.led(c, 'grid2_0'), 0, 0, 127);
});

test('_renderSegmentGrid: shift does not highlight gap blacks', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0', 'grid1_0']);
    setEdit(c, {
        colors: [[127,0,0], [0,0,0]],
        colorSet: [true, false]
    });
    c.modifiers.shift = true;
    H.clearLeds(c);
    renderSegments(c);
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
    t.rgb(H.led(c, 'grid1_0'), 0, 0, 0, 'gap stays black under shift');
});

test('_renderSegmentGrid: shift does not highlight during preview', function(t) {
    var c = setupLab();
    bindTargets(c, ['grid0_0']);
    setEdit(c, {colors: [[0,0,0]]});
    c._lab.slots[5] = {colors: [[0,0,0]]};
    c._lab.previewSource = 5;
    c._lab.previewing = true;
    c.modifiers.shift = true;
    H.clearLeds(c);
    renderSegments(c);
    // Previewing black stays black under shift — highlight is
    // edit-mode only.
    t.rgb(H.led(c, 'grid0_0'), 0, 0, 0);
});

// ── _renderMarkerLED ──────────────────────────────────────

test('_renderMarkerLED: paints marker colour', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]], markerColor: 'green, 90'});
    var compiled = XoneK3.compileScheme(XoneK3.resolveScheme(c._lab.edit));
    H.clearLeds(c);
    c._renderMarkerLED(compiled);
    t.rgb(H.led(c, 'grid3_3'), 0, 127, 0);
});

test('_renderMarkerLED: no marker → black', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]]});
    var compiled = XoneK3.compileScheme(XoneK3.resolveScheme(c._lab.edit));
    H.clearLeds(c);
    c._renderMarkerLED(compiled);
    t.rgb(H.led(c, 'grid3_3'), 0, 0, 0);
});

// ── _renderSlotLEDs ───────────────────────────────────────

test('_renderSlotLEDs: empty slot → black', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [5]
    });
    H.clearLeds(c);
    c._renderSlotLEDs();
    var led = H.led(c, 'grid0_0');
    t.eq(led.r, 0);
});

test('_renderSlotLEDs: populated save slot → yellow', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    c._lab.slots[5] = {colors: [[0,0,0]]};
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [5]
    });
    H.clearLeds(c);
    c._renderSlotLEDs();
    var led = H.led(c, 'grid0_0');
    t.eq(led.r, 127);
    t.eq(led.g, 127);
});

test('_renderSlotLEDs: slot 0 → green', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [0]
    });
    H.clearLeds(c);
    c._renderSlotLEDs();
    t.rgb(H.led(c, 'grid0_0'), 0, 127, 0);
});

test('_renderSlotLEDs: previewed slot brighter', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    c._lab.slots[5] = {colors: [[0,0,0]]};
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labSlotPress, args: [5]
    });
    H.clearLeds(c);
    c._renderSlotLEDs();
    var dimLed = H.led(c, 'grid0_0');

    c._lab.previewSource = 5;
    H.clearLeds(c);
    c._renderSlotLEDs();
    var brightLed = H.led(c, 'grid0_0');

    t.ok(brightLed.hw > dimLed.hw);
});

// ── _renderBeatGrid ───────────────────────────────────────

test('_renderBeatGrid: target cells painted', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]], beat: {bar: {color: 'red'}}});
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labBeatSelect, args: ['bar']
    });
    H.clearLeds(c);
    c._renderBeatGrid();
    t.rgb(H.led(c, 'grid0_0'), 127, 0, 0);
});

test('_renderBeatGrid: unset target paints white at off-brightness', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]], beat: {barBeats: 4}});
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.labBeatSelect, args: ['bar']
    });
    H.clearLeds(c);
    c._renderBeatGrid();
    var led = H.led(c, 'grid0_0');
    t.rgb(led, 127, 127, 127);
    t.hw(led, XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF);
});

test('_renderBeatGrid: toggle cell green when on', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]], beat: {color: 'red'}});
    H.bind(c, 'grid0_1', {
        func: XoneK3.FUNCS.labBeatToggleEnabled
    });
    H.clearLeds(c);
    c._renderBeatGrid();
    t.rgb(H.led(c, 'grid0_1'), 0, 127, 0);
});

test('_renderBeatGrid: toggle cell red when off', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]], beat: {enabled: false, color: 'red'}});
    H.bind(c, 'grid0_1', {
        func: XoneK3.FUNCS.labBeatToggleEnabled
    });
    H.clearLeds(c);
    c._renderBeatGrid();
    t.rgb(H.led(c, 'grid0_1'), 127, 0, 0);
});

// ── _renderPreviewLED ────────────────────────────────────

test('_renderPreviewLED: unknown knob → white', function(t) {
    var c = setupLab();
    c._lab.previewKnown = false;
    H.clearLeds(c);
    c._renderPreviewLED();
    t.rgb(H.led(c, 'button0_0'), 127, 127, 127);
});

test('_renderPreviewLED: samples ramp at previewPos', function(t) {
    var c = setupLab();
    c._lab.previewKnown = true;
    c._lab.previewPos = 0.25;
    c._lab.previewOn = true;
    setEdit(c, {colors: [[127,0,0], [0,0,127]], coScheme: null});
    setPreviewCO(0.25);
    H.clearLeds(c);
    c._renderPreviewLED();
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0, 3);
});

test('_renderPreviewLED: marker at center shows marker colour', function(t) {
    var c = setupLab();
    c._lab.previewKnown = true;
    c._lab.previewPos = 0.5;
    c._lab.previewOn = true;
    setEdit(c, {colors: [[127,0,0], [0,0,127]],
                 markerColor: 'green, 90', markerWidth: 20});
    setPreviewCO(0.5);
    H.clearLeds(c);
    c._renderPreviewLED();
    t.rgb(H.led(c, 'button0_0'), 0, 127, 0);
});

test('_renderPreviewLED: off-phase shows off-ramp', function(t) {
    var c = setupLab();
    c._lab.previewKnown = true;
    c._lab.previewPos = 0.25;
    c._lab.previewOn = false;
    setEdit(c, {colors: [[127,0,0], [0,0,127]], coScheme: null});
    setPreviewCO(0.25);
    H.clearLeds(c);
    c._renderPreviewLED();
    var led = H.led(c, 'button0_0');
    t.ok(led.hw <= 20);
});

// ── _compiledPreview cache ────────────────────────────────

test('_compiledPreview: returns object with resolved + compiled', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]]});
    var r = c._compiledPreview();
    t.ok(r.resolved);
    t.ok(r.compiled);
});

test('_compiledPreview: cache hit between reads', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]]});
    var r1 = c._compiledPreview();
    var r2 = c._compiledPreview();
    t.eq(r1, r2);
});

test('_compiledPreview: cache miss after _version bump', function(t) {
    var c = setupLab();
    setEdit(c, {colors: [[127,0,0]]});
    var r1 = c._compiledPreview();
    c._lab._version++;
    var r2 = c._compiledPreview();
    t.neq(r1, r2);
});

test('_onInput bumps version', function(t) {
    var c = setupLab();
    var v0 = c._lab._version;
    c._onInput(c.bindings.button0_0);
    t.ok(c._lab._version > v0);
});

// ── _needsBeatClocks override ─────────────────────────────

test('_needsBeatClocks: true when _onBeat set', function(t) {
    var c = setupLab();
    t.eq(c._needsBeatClocks(), true);
});

// ── _paintRGB / _paintLED ─────────────────────────────────

test('_paintRGB: paints through sendLED', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintRGB('button0_0', 100, 50, 25, 100);
    t.rgb(H.led(c, 'button0_0'), 100, 50, 25);
});

test('_paintLED: parses colour spec', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'red, 80');
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
    t.hw(H.led(c, 'button0_0'), 80);
});

test('_paintLED: no rgb → no write', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'mixxx');
    t.eq(midi._sysex.length, 0);
});

test('_paintLED: on=true uses scheme on-brightness', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'red, 80, 20', true);
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
    t.hw(H.led(c, 'button0_0'), 80);
});

test('_paintLED: on=false uses scheme off-brightness', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'red, 80, 20', false);
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
    t.hw(H.led(c, 'button0_0'), 20);
});

test('_paintLED: on=false without scheme off-brightness falls back', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'red, 80', false);
    t.hw(H.led(c, 'button0_0'), XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF);
});

test('_paintLED: numeric third arg overrides everything', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._paintLED('button0_0', 'red, 80, 20', 55);
    t.hw(H.led(c, 'button0_0'), 55);
});