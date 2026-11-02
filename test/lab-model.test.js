'use strict';

var H = require('./helpers');

function setupLab(overrides) {
    var cfg = Object.assign({
        patches: {
            colorLab:      {},
            colorLabShift: {},
            slots:         {},
            slotsShift:    {}
        },
        initialPatches: ['colorLab'],
        ledTargetGroups: {calib: ['grid0_0', 'grid1_0']},
        labPreviewTarget: 'button0_0',
        markerTarget:     'grid3_3'
    }, overrides || {});
    return H.bootLab(cfg);
}

// ── construction ─────────────────────────────────────────────

test('LabController extends K3Controller', function(t) {
    var c = setupLab();
    t.ok(c instanceof XoneK3.LabController);
    t.ok(c instanceof XoneK3.K3Controller);
});

test('boot seeds slot 0 with labDefault', function(t) {
    var c = setupLab();
    t.ok(c._lab.slots[0]);
    t.ok(c._lab.slots[0].colors);
});

test('boot initializes _lab state', function(t) {
    var c = setupLab();
    t.eq(c._lab.previewSource, 'edit');
    t.eq(c._lab.previewing,    false);
    t.eq(c._lab.saveArmed,     false);
    t.eq(c._lab.selectedSegment, 0);
    t.eq(c._lab.ratioEdit,     false);
    t.eq(c._lab.beatTarget,    null);
    t.eq(c._lab._version,      0);
});

// ── _cloneScheme ─────────────────────────────────────────────

test('_cloneScheme: deep copy', function(t) {
    var c = setupLab();
    var src = {colors: [[127,0,0]]};
    var cpy = c._cloneScheme(src);
    t.neq(cpy, src);
    t.neq(cpy.colors, src.colors);
    cpy.colors[0][0] = 0;
    t.eq(src.colors[0][0], 127);
});

test('_cloneScheme: null passthrough', function(t) {
    var c = setupLab();
    t.eq(c._cloneScheme(null), null);
});

test('_cloneScheme: strips colorSet', function(t) {
    var c = setupLab();
    var src = {colors: [[127,0,0]], colorSet: [true]};
    var cpy = c._cloneScheme(src);
    t.eq(cpy.colorSet, undefined);
});

// ── _editableScheme / _previewScheme / _labLEDScheme ────────

test('_editableScheme: returns edit buffer when colorLab active', function(t) {
    var c = setupLab();
    t.eq(c._editableScheme(), c._lab.edit);
});

test('_editableScheme: null outside colorLab', function(t) {
    var c = setupLab();
    c.activePatches = ['slots'];
    t.eq(c._editableScheme(), null);
});

test('_previewScheme: edit source', function(t) {
    var c = setupLab();
    c._lab.previewSource = 'edit';
    t.eq(c._previewScheme(), c._lab.edit);
});

test('_previewScheme: slot index', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[0,127,0]]};
    c._lab.previewSource = 5;
    t.eq(c._previewScheme(), c._lab.slots[5]);
});

test('_previewScheme: registry name', function(t) {
    var c = setupLab();
    c._lab.previewSource = 'coMatch';
    var s = c._previewScheme();
    t.ok(s);
    t.ok(Array.isArray(s.colors));
});

test('_previewScheme: unknown name → null', function(t) {
    var c = setupLab();
    c._lab.previewSource = 'noSuchScheme';
    t.eq(c._previewScheme(), null);
});

test('_labLEDScheme: edit mode not previewing → edit', function(t) {
    var c = setupLab();
    t.eq(c._labLEDScheme(), c._lab.edit);
});

test('_labLEDScheme: edit mode previewing → preview', function(t) {
    var c = setupLab();
    c._lab.slots[3] = {colors: [[0,127,0]]};
    c._lab.previewSource = 3;
    c._lab.previewing = true;
    t.eq(c._labLEDScheme(), c._lab.slots[3]);
});

test('_labLEDScheme: slots mode → preview', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    c._lab.slots[3] = {colors: [[0,127,0]]};
    c._lab.previewSource = 3;
    t.eq(c._labLEDScheme(), c._lab.slots[3]);
});

// ── _commitPreview ──────────────────────────────────────────
//
// _commitPreview is a GATE, not a copier. Returns _lab.edit when
// previewSource === 'edit' (edit mode, not previewing), null
// otherwise (with a warn-once keyed labEditWhilePreviewing). It
// never copies a preview into edit and never clears any flag —
// those are the jobs of _loadPreview (shift+R), _editThis (slots
// mode), and the armed-slot save in _selectSlot. See INTERNALS §17.

test('_commitPreview: null while previewing (gate — no side effects)', function(t) {
    var c = setupLab();
    c._lab.slots[3] = {colors: [[0,127,0]]};
    c._lab.previewSource = 3;
    c._lab.previewing = true;
    var before = c._lab.edit;
    var result = c._commitPreview();
    t.eq(result, null);
    t.eq(c._lab.edit, before);
    t.eq(c._lab.previewSource, 3);
    t.eq(c._lab.previewing, true);
});

test('_commitPreview: returns edit buffer when previewSource is edit', function(t) {
    var c = setupLab();
    var before = c._lab.edit;
    c._lab.previewSource = 'edit';
    c._lab.previewing = false;
    t.eq(c._commitPreview(), before);
});

test('_commitPreview: no preview → returns edit unchanged', function(t) {
    var c = setupLab();
    var edit = c._lab.edit;
    t.eq(c._commitPreview(), edit);
});

test('_commitPreview: not in colorLab → null', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    t.eq(c._commitPreview(), null);
});

// ── _setPreview ─────────────────────────────────────────────

test('_setPreview: sets source and flag, runs auto-bake', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[100, 100, 100]]};
    c._setPreview(5, 'slot5');
    t.eq(c._lab.previewSource, 5);
    t.eq(c._lab.previewing, true);
    t.ok(c._lab.slots[XoneK3.LAB_SLOT.STRUCTURAL]);
    t.ok(c._lab.slots[XoneK3.LAB_SLOT.BAKED_INTERP]);
    t.ok(c._lab.slots[XoneK3.LAB_SLOT.BAKED]);
    t.ok(c._lab.slots[XoneK3.LAB_SLOT.EXPORT]);
});

// ── _editSegmentTarget: no auto-trim ───────────────────────
//
// Trailing black stops are not trimmed on edit. A scheme loaded
// from a slot with trailing blacks (fully set — no colorSet array
// → all true) keeps them; editing an earlier cell doesn't delete
// them.

test('_editSegmentTarget: does not trim trailing blacks', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[50,0,0], [0,0,0], [0,0,0]]};
    c._lab.selectedSegment = 0;
    c._editColorField('r', 'step', 5);
    t.eq(c._lab.edit.colors.length, 3, 'trailing blacks stay');
    t.eq(c._lab.edit.colors[0][0], 55, 'edit landed');
});

// ── Fill gaps: colorSet model ──────────────────────────────
//
// Anchors are colorSet cells only. Non-colorSet cells are gaps
// and get painted. colorSet blacks anchor; gap blacks don't.

test('ledFillGaps: interpolates between colorSet anchors', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,0,0], [0,0,127]],
        colorSet: [true, false, true]
    };
    var bl = {_ctrl: c};
    XoneK3.FUNCS.ledFillGaps.call(bl, [], 0, 0, 127, 0x90);
    t.approx(c._lab.edit.colors[1][0], 63, 2);
    t.approx(c._lab.edit.colors[1][2], 63, 2);
});

test('ledFillGaps: paints multiple gap cells', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[0,127,0], [0,0,0], [0,0,0], [127,0,0]],
        colorSet: [true, false, false, true]
    };
    var bl = {_ctrl: c};
    XoneK3.FUNCS.ledFillGaps.call(bl, [], 0, 0, 127, 0x90);
    t.approx(c._lab.edit.colors[1][1], 85, 2);
    t.approx(c._lab.edit.colors[2][0], 85, 2);
});

test('ledFillGaps: does not paint colorSet cells', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,127,0], [0,0,127]],
        colorSet: [true, true, true]
    };
    var bl = {_ctrl: c};
    XoneK3.FUNCS.ledFillGaps.call(bl, [], 0, 0, 127, 0x90);
    t.eq(c._lab.edit.colors[1], [0, 127, 0]);
});

test('ledFillGaps: needs 2+ colorSet anchors', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[0,0,0], [0,0,0]],
        colorSet: [true, false]
    };
    var bl = {_ctrl: c};
    _printLog.length = 0;
    XoneK3.FUNCS.ledFillGaps.call(bl, [], 0, 0, 127, 0x90);
    t.ok(_printLog.join('\n').indexOf('need 2+') !== -1);
});

// ── colorSet: press, delete, cascade, edit ─────────────────

test('ledSelectTarget: unshifted press marks colorSet true', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]]};
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid0_0']
    });
    H.press(c, 'grid0_0');
    t.eq(c._lab.edit.colorSet[0], true);
});

test('ledSelectTarget: unshifted press extends + marks colorSet', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]]};
    H.bind(c, 'grid1_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid1_0']
    });
    H.press(c, 'grid1_0');
    t.eq(c._lab.edit.colors.length, 2);
    t.eq(c._lab.edit.colorSet[0], true);
    t.eq(c._lab.edit.colorSet[1], true);
});

test('ledSelectTarget: shift+press on real stop removes it', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,127,0]],
        colorSet: [true, true]
    };
    c.modifiers.shift = true;
    H.bind(c, 'grid1_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid1_0']
    });
    H.press(c, 'grid1_0');
    t.eq(c._lab.edit.colors.length, 1);
    t.eq(c._lab.edit.colors[0], [127, 0, 0]);
    t.eq(c._lab.selectedSegment, 0, 'selection jumps to cell 0');
});

test('ledSelectTarget: delete real stop cascades adjacent gaps', function(t) {
    var c = setupLab({ledTargetGroups: {calib: ['grid0_0', 'grid1_0', 'grid2_0']}});
    // [0(T), 1(F), 2(T), 3(F), 4(T)] — delete cell 2
    c._lab.edit = {
        colors: [[10,0,0], [0,0,0], [0,10,0], [0,0,0], [0,0,10]],
        colorSet: [true, false, true, false, true]
    };
    c.modifiers.shift = true;
    H.bind(c, 'grid2_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid2_0']
    });
    H.press(c, 'grid2_0');
    t.eq(c._lab.edit.colors.length, 2, 'cells 1-3 removed');
    t.eq(c._lab.edit.colors[0], [10, 0, 0]);
    t.eq(c._lab.edit.colors[1], [0, 0, 10]);
    t.eq(c._lab.edit.colorSet[0], true);
    t.eq(c._lab.edit.colorSet[1], true);
});

test('ledSelectTarget: delete cell 0 is no-op', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[127,0,0]], colorSet: [true]};
    c.modifiers.shift = true;
    H.bind(c, 'grid0_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid0_0']
    });
    H.press(c, 'grid0_0');
    t.eq(c._lab.edit.colors.length, 1);
    t.eq(c._lab.edit.colors[0], [127, 0, 0]);
});

test('ledSelectTarget: delete gap splices that cell', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,0,0]],
        colorSet: [true, false]
    };
    c.modifiers.shift = true;
    H.bind(c, 'grid1_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid1_0']
    });
    H.press(c, 'grid1_0');
    t.eq(c._lab.edit.colors.length, 1);
    t.eq(c._lab.edit.colors[0], [127, 0, 0]);
});

test('ledSelectTarget: delete gap shifts subsequent cells down', function(t) {
    var c = setupLab();
    c.ledTargetGroups.calib = [
        'grid0_0','grid1_0','grid2_0','grid3_0',
        'button0_0','button1_0','button2_0','button3_0',
        'grid0_1','grid1_1'
    ];
    // [0(T),1-8(F),9(T)]
    var colors = [[10,0,0]];
    var colorSet = [true];
    for (var i = 1; i <= 8; i++) { colors.push([0,0,0]); colorSet.push(false); }
    colors.push([0,0,10]); colorSet.push(true);
    c._lab.edit = { colors: colors, colorSet: colorSet };

    H.bind(c, 'grid2_0', {
        func: XoneK3.FUNCS.ledSelectTarget,
        args: ['button2_0']   // calib index 6
    });
    c.modifiers.shift = true;
    H.press(c, 'grid2_0');

    t.eq(c._lab.edit.colors.length, 9, 'one cell removed');
    t.eq(c._lab.edit.colors[8][2], 10, 'former cell 9 now at index 8');
    t.eq(c._lab.edit.colorSet[8], true, 'still colorSet true');
});

test('_editSegmentTarget: step -1 on black keeps colorSet false', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,0,0]],
        colorSet: [true, false]
    };
    c._lab.selectedSegment = 1;
    c._editColorField('r', 'step', -1);
    t.eq(c._lab.edit.colorSet[1], false, 'stays gap when still black');
});

test('_editSegmentTarget: non-black edit marks colorSet true', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0], [0,0,0]],
        colorSet: [true, false]
    };
    c._lab.selectedSegment = 1;
    c._editColorField('r', 'step', 1);
    t.eq(c._lab.edit.colorSet[1], true, 'becomes real stop when non-black');
});

test('ledSelectTarget: delete then edit recreates', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[0,0,0], [127,127,127]],
        colorSet: [true, true]
    };
    c._lab.selectedSegment = 1;
    c.modifiers.shift = true;
    H.bind(c, 'grid1_0', {
        func: XoneK3.FUNCS.ledSelectTarget, args: ['grid1_0']
    });
    H.press(c, 'grid1_0');
    t.eq(c._lab.edit.colors.length, 1, 'cell 1 removed');

    c.modifiers.shift = false;
    c._lab.selectedSegment = 1;
    c._editColorField('r', 'abs', 100);
    t.eq(c._lab.edit.colors.length, 2);
    t.eq(c._lab.edit.colors[1][0], 100);
    t.eq(c._lab.edit.colorSet[1], true);
});

// ── _applyAutoBake ─────────────────────────────────────────

test('_applyAutoBake: fills slots 12-15', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[127,0,0], [0,0,127]]};
    c._lab.previewSource = 'edit';
    c._applyAutoBake();
    var S = XoneK3.LAB_SLOT;
    t.ok(c._lab.slots[S.STRUCTURAL]);
    t.ok(c._lab.slots[S.BAKED_INTERP]);
    t.ok(c._lab.slots[S.BAKED]);
    t.ok(c._lab.slots[S.EXPORT]);
});

test('_applyAutoBake: skips bake slots', function(t) {
    var c = setupLab();
    c._lab.slots[XoneK3.LAB_SLOT.STRUCTURAL] = 'sentinel';
    c._lab.previewSource = XoneK3.LAB_SLOT.STRUCTURAL;
    c._applyAutoBake();
    t.eq(c._lab.slots[XoneK3.LAB_SLOT.STRUCTURAL], 'sentinel');
});

test('_applyAutoBake: skips registry names', function(t) {
    var c = setupLab();
    var before = c._lab.slots[XoneK3.LAB_SLOT.STRUCTURAL];
    c._lab.previewSource = 'coMatch';
    c._applyAutoBake();
    t.eq(c._lab.slots[XoneK3.LAB_SLOT.STRUCTURAL], before);
});

// ── _selectSlot ────────────────────────────────────────────

test('_selectSlot: preview when not armed', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[0,127,0]]};
    c._selectSlot(5);
    t.eq(c._lab.previewSource, 5);
    t.eq(c._lab.previewing, true);
});

test('_selectSlot: armed saves into slot', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[10,20,30]]};
    c._lab.saveArmed = true;
    c._selectSlot(5);
    t.eq(c._lab.slots[5].colors[0][0], 10);
    t.eq(c._lab.saveArmed, false);
});

test('_selectSlot: armed save loads into edit and exits', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[10,20,30]]};
    c._lab.saveArmed = true;
    c._selectSlot(5);
    t.eq(c._lab.edit.colors[0][0], 10);
    t.eq(c._lab.previewSource, 'edit');
    t.notOk(c._patchActive('slots'));
});

test('_selectSlot: armed save overwrites with backup to console', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[99,99,99]]};
    c._lab.edit = {colors: [[10,20,30]]};
    c._lab.saveArmed = true;
    var before = _printLog.length;
    c._selectSlot(5);
    t.ok(_printLog.length > before, 'no overwrite backup printed');
});

test('_selectSlot: armed save over self-skips backup', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[99,99,99]]};
    c._lab.previewSource = 5;
    c._lab.saveArmed = true;
    var before = _printLog.length;
    c._selectSlot(5);
    t.eq(_printLog.length, before);
});

test('_selectSlot: save strips colorSet from slot', function(t) {
    var c = setupLab();
    c._lab.edit = {
        colors: [[127,0,0]],
        colorSet: [true]
    };
    c._lab.saveArmed = true;
    c._selectSlot(5);
    t.eq(c._lab.slots[5].colorSet, undefined);
    t.eq(c._lab.edit.colorSet, undefined, 'edit buffer also reloaded without it');
});

// ── _toggleSaveArm ─────────────────────────────────────────

test('_toggleSaveArm: flips flag', function(t) {
    var c = setupLab();
    c._toggleSaveArm();
    t.eq(c._lab.saveArmed, true);
    c._toggleSaveArm();
    t.eq(c._lab.saveArmed, false);
});

// ── _editReturn / _editThis / _loadPreview ─────────────────

test('_editReturn: replaces slots with colorLab', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    c._lab.saveArmed = true;
    c._editReturn();
    t.ok(c._patchActive('colorLab'));
    t.eq(c._lab.saveArmed, false);
});

test('_editThis: copies preview into edit, exits', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    c._lab.slots[5] = {colors: [[1,2,3]]};
    c._lab.previewSource = 5;
    c._editThis();
    t.eq(c._lab.edit.colors[0][0], 1);
    t.eq(c._lab.previewSource, 'edit');
    t.ok(c._patchActive('colorLab'));
});

test('_loadPreview: commit without leaving mode', function(t) {
    var c = setupLab();
    c._lab.slots[5] = {colors: [[1,2,3]]};
    c._lab.previewSource = 5;
    c._lab.previewing = true;
    c._loadPreview();
    t.eq(c._lab.edit.colors[0][0], 1);
    t.eq(c._lab.previewSource, 'edit');
});

// ── _editColorField ────────────────────────────────────────

test('_editColorField: stepped r on segment', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[50,0,0]]};
    c._lab.selectedSegment = 0;
    c._editColorField('r', 'step', 5);
    t.eq(c._lab.edit.colors[0][0], 55);
});

test('_editColorField: absolute fader r', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[50,0,0]]};
    c._lab.selectedSegment = 0;
    c._editColorField('r', 'abs', 100);
    t.eq(c._lab.edit.colors[0][0], 100);
});

test('_editColorField: clamped to 0..127', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[120,0,0]]};
    c._lab.selectedSegment = 0;
    c._editColorField('r', 'step', 100);
    t.eq(c._lab.edit.colors[0][0], 127);
});

test('_editColorField: marker stepped brightness writes on-phase', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]], markerColor: 'red, 60, 20'};
    c._lab.selectedSegment = -1;
    c._lab.previewOn = true;
    c._editColorField('brightness', 'step', 5);
    t.eq(c._lab.edit.markerColor[3], 65);
});

test('_editColorField: marker stepped brightness writes off-phase', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]], markerColor: 'red, 60, 20'};
    c._lab.selectedSegment = -1;
    c._lab.previewOn = false;
    c._editColorField('brightness', 'step', 5);
    t.eq(c._lab.edit.markerColor[4], 25);
});

test('_editColorField: not in colorLab → no-op', function(t) {
    var c = setupLab({initialPatches: ['slots']});
    var before = JSON.stringify(c._lab.edit);
    c._editColorField('r', 'step', 5);
    t.eq(JSON.stringify(c._lab.edit), before);
});

// ── _editBeatColor ─────────────────────────────────────────

test('_editBeatColor: creates beat block when missing', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]]};
    c._lab.beatTarget = 'beat';
    c._editBeatColor('r', 10, undefined);
    t.ok(c._lab.edit.beat);
    t.ok(c._lab.edit.beat.color);
});

test('_editBeatColor: absolute writes fader value', function(t) {
    var c = setupLab();
    c._lab.edit = {colors: [[0,0,0]]};
    c._lab.beatTarget = 'bar';
    c._editBeatColor('g', 0, 100);
    t.eq(c._lab.edit.beat.bar.color[1], 100);
});

test('_editBeatColor: no target → no-op', function(t) {
    var c = setupLab();
    c._lab.beatTarget = null;
    c._editBeatColor('r', 10, undefined);
    t.eq(c._lab.edit.beat, undefined);
});

// ── _previewLabel ──────────────────────────────────────────

test('_previewLabel: edit', function(t) {
    var c = setupLab();
    c._lab.previewSource = 'edit';
    t.eq(c._previewLabel(), 'edit');
});

test('_previewLabel: slot N', function(t) {
    var c = setupLab();
    c._lab.previewSource = 5;
    t.eq(c._previewLabel(), 'slot5');
});

test('_previewLabel: bake slots 12-15', function(t) {
    var c = setupLab();
    c._lab.previewSource = XoneK3.LAB_SLOT.STRUCTURAL;
    t.eq(c._previewLabel(), 'structural');
    c._lab.previewSource = XoneK3.LAB_SLOT.BAKED_INTERP;
    t.eq(c._previewLabel(), 'baked+interp');
    c._lab.previewSource = XoneK3.LAB_SLOT.BAKED;
    t.eq(c._previewLabel(), 'baked');
    c._lab.previewSource = XoneK3.LAB_SLOT.EXPORT;
    t.eq(c._previewLabel(), 'export');
});

test('_previewLabel: registry name', function(t) {
    var c = setupLab();
    c._lab.previewSource = 'myScheme';
    t.eq(c._previewLabel(), 'myScheme');
});

// ── _isBeatEdit ────────────────────────────────────────────

test('_isBeatEdit: true when colorLabBeat active', function(t) {
    var c = setupLab({
        patches: {
            colorLab:     {},
            colorLabBeat: {_host: 'colorLab'}
        }
    });
    c.activePatches = ['colorLab', 'colorLabBeat'];
    t.ok(c._isBeatEdit());
});

test('_isBeatEdit: false otherwise', function(t) {
    var c = setupLab();
    t.notOk(c._isBeatEdit());
});

test('_toggleSaveArm: refreshes layer LED', function(t) {
    var c = setupLab();
    H.clearLeds(c);
    c._lab.saveArmed = false;
    var b = c.bindings['layer'];

    // Layer is not bound in this fixture; bind it inline.
    H.bind(c, 'layer', {
        func: XoneK3.FUNCS.layerButton, args: ['colorLab', 'slots'],
        colorScheme: { scheme: 'purple', on: { state: '_lab.saveArmed' } }
    });
    H.clearLeds(c);

    c._toggleSaveArm();
    var armed = H.led(c, 'layer');
    t.ok(armed && armed.hw > XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF,
         'armed state should be brighter than unarmed');

    c._toggleSaveArm();
    var unarmed = H.led(c, 'layer');
    t.ok(unarmed && unarmed.hw <= XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF,
         'unarmed state should be the off-brightness');
});