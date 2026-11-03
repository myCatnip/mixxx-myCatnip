// config/k3-lab.mjs — colorLab extension: LabController class,
// bake machinery, slot browser, per-cell painters.
//
// v2.1.0:
// - bakeScheme uses myCatnip.perception._flatTarget / _bisectHw
//   with mixMode threaded; scheme.perception override respected.
// - labToggleMix replaces labToggleWb (alias kept); toggles
//   ctrl._perceptionMixActive and clears _ledCache.
// - resolveColorEntry threaded with ctrl for per-HW palette.
// - compileScheme threaded with ctrl for per-HW compile cache.


// Curated scroll order for the lab editor.
myCatnip.SCHEME_REGISTRY = [
    'myCatnip',
    'myCatnipSpread',
    'catFX',
    'filterNone',
    'filterEcho',
    'filterReverb',
    'filterSmoothGrowl',
    'filterBalance',
    'coMatch',
    'labDefault'
];

myCatnip.LAB_SLOT = {
    ON: 0, OFF: 1, CO: 2, CO_OFF: 3,
    SAVE_START: 4, SAVE_END: 11,
    STRUCTURAL:   12,
    BAKED_INTERP: 13,
    BAKED:        14,
    EXPORT:       15
};

myCatnip.LAB_SLOT_COLOURS = {};
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.ON]         = [0, 127, 0];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.OFF]        = [127, 0, 0];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.CO]         = [127, 127, 127];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.CO_OFF]     = [60, 60, 127];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.STRUCTURAL]   = [0, 0, 127];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.BAKED_INTERP] = [0, 127, 127];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.BAKED]        = [127, 0, 127];
myCatnip.LAB_SLOT_COLOURS[myCatnip.LAB_SLOT.EXPORT]       = [127, 40, 0];

myCatnip.CALIB_TARGETS = [
    'button3_0',
    'button0_1','button1_1','button2_1','button3_1',
    'button0_2','button1_2','button2_2','button3_2',
    'grid0_0','grid1_0','grid2_0','grid3_0',
    'grid0_1','grid1_1','grid2_1','grid3_1',
    'grid0_2','grid1_2','grid2_2','grid3_2',
    'grid0_3','grid1_3'
];

myCatnip.LAB_DUMP_ON_SHUTDOWN = true;
myCatnip._modeSeen = { edit: false, slots: false };

myCatnip.modePrint = function(line) {
    if (!myCatnip.MODE_PRINTS) return;
    print('[myCatnip] ' + line);
};

myCatnip.modePrintFirst = function(mode, hint) {
    if (!myCatnip.MODE_PRINTS) return;
    if (myCatnip._modeSeen[mode]) return;
    myCatnip._modeSeen[mode] = true;
    print('[myCatnip]   ' + hint);
    print('[myCatnip]   silence: myCatnip.MODE_PRINTS = false  (config/k3-lab.mjs)');
};

myCatnip.registerPrintTable({
    labSegment:      'segment {i}',
    labMarker:       'marker',
    labDeleteSeg:    'deleted segment {i}',
    labExtend:       'extended to {n} stops',
    labMarkerClear:  'marker cleared',
    labEditSeg:      'seg {i} {field} = {v}',
    labEditMarker:   'marker {field} = {v}',
    labCurve:        'curve = {v}',
    labBrightness:   'brightness = {v}',
    labBrightScale:  'brightnessScale = {v}',
    labSchemePos:    'schemePosition = {v}',
    labMarkerPos:    'markerPosition = {v}',
    labMarkerWidth:  'markerWidth = {v}',
    labRatio:        'ratio[{i}] = {v}',
    labRatioOn:      'ratio edit ON',
    labRatioOff:     'ratio edit OFF',
    labInterpOn:     'interp ON',
    labInterpOff:    'interp OFF',
    labCalibOn:      'calibration ON',
    labCalibOff:     'calibration OFF',
    labFillGaps:     'fill gaps ({n} anchors)',
    labReset:        '{field} = {v}',
    labPreviewOn:    'preview ON',
    labPreviewOff:   'preview OFF',
    labSlotPress:    'preview slot {i}',
    labSlotSaved:    'saved {from} -> slot {to}',
    labEditReturn:   'return to edit',
    labEditThis:     'edit := {from}',
    labLoadPreview:  'edit := {from}',
    labScroll:       'loaded "{name}"',
    labDump:         'dump {from}',
    labHk:           'hkBoost = {v}',
    labLum:          'lumGamma = {v}',
    labMixOn:        'perception mix ON',
    labMixOff:       'perception mix OFF',
    labBeatEnabled:  'beat enabled = {v}',
    labBeatBar:      'beat barBeats = {v}',
    labBeatPhrase:   'beat phraseBars = {v}',
    labBeatPre:      'beat prePhraseBeats = {v}',
    labBeatColor:    'beat.{level}.{field} = {v}',
    labBeatSelect:   'beat target = {level}',
    labBeatClear:    'beat cleared: {level}'
}, 'lab');

// ============================================================
// FIELD EDIT
// ============================================================
function clamp127(x) { return Math.max(0, Math.min(127, x)); }

myCatnip._applyFieldEdit = function(rgb, br, field, mode, value) {
    var isStep = (mode === 'step');
    var v;
    if (field === 'r') { rgb[0] = clamp127(isStep ? rgb[0] + value : value); v = rgb[0]; }
    else if (field === 'g') { rgb[1] = clamp127(isStep ? rgb[1] + value : value); v = rgb[1]; }
    else if (field === 'b') { rgb[2] = clamp127(isStep ? rgb[2] + value : value); v = rgb[2]; }
    else if (field === 'hw' || field === 'brightness') { br = clamp127(isStep ? br + value : value); v = br; }
    else return null;
    return { br: br, val: v };
};

function _csArray(scheme) {
    if (!scheme.colorSet) {
        scheme.colorSet = [];
        for (var i = 0; i < (scheme.colors || []).length; i++) {
            scheme.colorSet.push(true);
        }
    }
    return scheme.colorSet;
}
function _extendTo(scheme, idx) {
    var cs = _csArray(scheme);
    while (scheme.colors.length <= idx) {
        scheme.colors.push([0, 0, 0]);
        cs.push(false);
    }
}
function _setColorSet(scheme, idx, val) {
    var cs = _csArray(scheme);
    if (cs.length <= idx) _extendTo(scheme, idx);
    cs[idx] = val;
}
function _isColorSet(scheme, idx) {
    if (!scheme.colorSet) return true;
    return scheme.colorSet[idx] !== false;
}

// ============================================================
// BAKE
// ============================================================
myCatnip.bakeScheme = function(ref, ctrl, level) {
    var raw = myCatnip.resolveScheme(ref);
    if (!raw || !raw.colors) return null;
    var compiled = myCatnip.compileScheme(raw, undefined, undefined, ctrl);
    if (!compiled) return null;
    var segs = compiled.on;

    var bakeCal = (level === 'bakedInterp' || level === 'baked' ||
                   level === 'export');
    var bakeWb  = (level === 'export');

    // Perception mode resolution — same semantics as _solveHw in
    // controller-render.mjs.
    var P = ctrl && ctrl.hw && ctrl.hw.PERCEPTION;
    var mixMode = (ctrl && ctrl._perceptionMixActive === false)
        ? 'off'
        : ((P && P.mode && P.mode.mix) || 'off');
    var brightnessMode = (P && P.mode && P.mode.brightness) || 'off';

    // Scheme-level perception override (perception: false or
    // { brightness: 'off' }) — respects the compiled scheme's
    // translation of legacy calibration: false.
    var schemePerception = compiled.perception;
    if (schemePerception === false) {
        bakeCal = false;
        bakeWb = false;
    } else if (schemePerception && schemePerception.brightness === 'off') {
        bakeCal = false;
    }

    var flatTarget = null;
    if (bakeCal && compiled.calibration !== false &&
        ctrl && brightnessMode !== 'off') {
        flatTarget = myCatnip.perception._flatTarget(segs, ctrl.hw, mixMode);
        flatTarget = myCatnip.scaleTarget(flatTarget, raw.brightnessScale);
    }

    var wb = null;
    if (bakeWb && ctrl && ctrl._perceptionMixActive !== false &&
        P && P.wbGain && P.wbGain.length >= 3) {
        wb = P.wbGain;
    }

    var newColors = segs.map(function(s) {
        var rgb = [s.color.rgb[0], s.color.rgb[1], s.color.rgb[2]];
        var br  = s.color.brightness;
        if (flatTarget !== null &&
            (rgb[0] > 0 || rgb[1] > 0 || rgb[2] > 0)) {
            br = myCatnip.perception._bisectHw(rgb, flatTarget, ctrl.hw, mixMode);
        }
        if (wb) {
            rgb[0] = Math.max(0, Math.min(127, Math.round(rgb[0] * wb[0])));
            rgb[1] = Math.max(0, Math.min(127, Math.round(rgb[1] * wb[1])));
            rgb[2] = Math.max(0, Math.min(127, Math.round(rgb[2] * wb[2])));
        }
        return [rgb[0], rgb[1], rgb[2], br];
    });

    var out = {
        colors: newColors,
        brightness: raw.brightness,
        interp: raw.interp,
        markerColor: raw.markerColor,
        markerPosition: raw.markerPosition,
        markerWidth: raw.markerWidth,
        offScheme: raw.offScheme,
        coScheme: raw.coScheme,
        reverse: raw.reverse,
        beat: raw.beat
    };

    if (level === 'bakedInterp') out.interp = true;
    if (level === 'baked')       out.interp = false;

    if (level === 'structural' &&
        typeof raw.brightnessScale === 'number' &&
        raw.brightnessScale !== 1) {
        out.brightnessScale = raw.brightnessScale;
    }
    if (bakeCal) out.calibration = false;

    out.ratio = segs.map(function(s) { return s.end - s.start; });
    if (typeof raw.schemePosition === 'number' && raw.schemePosition !== 63.5) {
        out.schemePosition = raw.schemePosition;
    }
    if (typeof raw.curve === 'number' && raw.curve !== 0) {
        out.curve = raw.curve;
    }

    return out;
};

// ============================================================
// LabController
// ============================================================
myCatnip.LabController = function(cfg) {
    myCatnip.Controller.call(this, cfg);

    this.ledTargetGroups = cfg.ledTargetGroups || {};
    this._labPreviewTarget = cfg.labPreviewTarget || null;
    this._markerTarget = cfg.markerTarget || null;
    this._labPreviewCO = cfg.labPreviewCO || null;
    this._previewCOConn = null;

    this._lab = {
        slots: new Array(16).fill(null),
        edit: { colors: [[0, 0, 0]] },
        previewSource: 'edit',
        previewing: false,
        saveArmed: false,
        previewPos: 0.5,
        previewKnown: false,
        previewOn: true,
        selectedSegment: 0,
        ratioEdit: false,
        schemeName: null,
        beatTarget: null,
        _version: 0
    };

    if (cfg.modePrints   !== undefined) myCatnip.MODE_PRINTS     = !!cfg.modePrints;
    if (cfg.debugPrints  !== undefined) myCatnip._debugPrintsOn  = !!cfg.debugPrints;
};

myCatnip.LabController.prototype = Object.create(myCatnip.Controller.prototype);
myCatnip.LabController.prototype.constructor = myCatnip.LabController;

// ============================================================
// BINDING DISCOVERY
// ============================================================
myCatnip.LabController.prototype._buildCellIndex = function() {
    var idx = {};
    var resolved = this._applied || {};
    for (var cell in resolved) {
        var cfg = resolved[cell];
        if (!cfg || !cfg.func) continue;
        var fid = myCatnip._funcId(cfg.func);
        if (!idx[fid]) idx[fid] = {};
        idx[fid][cell] = cfg.args ? cfg.args.slice() : [];
    }
    return idx;
};

myCatnip.LabController.prototype._findCellsByFunc = function(funcRefs) {
    if (this._cellIndexFor !== this._applied) {
        this._cellIndex = this._buildCellIndex();
        this._cellIndexFor = this._applied;
    }
    var out = {};
    var idx = this._cellIndex;
    for (var i = 0; i < funcRefs.length; i++) {
        var fid = myCatnip._funcId(funcRefs[i]);
        var cells = idx[fid];
        if (!cells) continue;
        for (var cell in cells) out[cell] = cells[cell];
    }
    return out;
};

myCatnip.LabController.prototype._claimedCells = function() {
    var claimed = new Set();
    var cells = this._findCellsByFunc(myCatnip.LAB_PAINTER_FUNCS);
    for (var c in cells) claimed.add(c);
    return claimed;
};

// ============================================================
// STATE HELPERS
// ============================================================
myCatnip.LabController.prototype._cloneScheme = function(s) {
    if (!s) return null;
    var clone = JSON.parse(JSON.stringify(s));
    delete clone.colorSet;
    return clone;
};

myCatnip.LabController.prototype._editableScheme = function() {
    if (!this._patchActive('colorLab')) return null;
    return this._lab.edit;
};

myCatnip.LabController.prototype._previewScheme = function() {
    var s = this._lab.previewSource;
    if (s === 'edit') return this._lab.edit;
    if (typeof s === 'number') return this._lab.slots[s] || null;
    if (typeof s === 'string') {
        return myCatnip.SCHEMES[s] ? myCatnip.resolveScheme(s) : null;
    }
    return null;
};

myCatnip.LabController.prototype._labLEDScheme = function() {
    if (this._patchActive('colorLab')) {
        if (this._lab.previewing) return this._previewScheme();
        return this._lab.edit;
    }
    return this._previewScheme();
};

myCatnip.LabController.prototype._commitPreview = function() {
    if (!this._patchActive('colorLab')) return null;
    if (this._lab.previewSource !== 'edit') {
        myCatnip._warnOnce('labEditWhilePreviewing',
            'preview is preview-only — shift+pressR loads the preview ' +
            'into edit before edits take effect');
        return null;
    }
    return this._lab.edit;
};

myCatnip.LabController.prototype._withEdit = function(fn) {
    var scheme = this._commitPreview();
    if (!scheme) return;
    if (fn.call(this, scheme) === false) return;
    this._labRenderPreview();
};

myCatnip.LabController.prototype._previewLabel = function() {
    var s = this._lab.previewSource;
    if (s === 'edit') return 'edit';
    if (typeof s === 'number') {
        if (s === myCatnip.LAB_SLOT.STRUCTURAL)   return 'structural';
        if (s === myCatnip.LAB_SLOT.BAKED_INTERP) return 'baked+interp';
        if (s === myCatnip.LAB_SLOT.BAKED)        return 'baked';
        if (s === myCatnip.LAB_SLOT.EXPORT)       return 'export';
        return 'slot' + s;
    }
    return s;
};

myCatnip.LabController.prototype._isBeatEdit = function() {
    return this._patchActive('colorLabBeat');
};

// ============================================================
// AUTO-BAKE
// ============================================================
myCatnip.LabController.prototype._applyAutoBake = function() {
    var src = this._lab.previewSource;
    var editable = (src === 'edit') ||
                   (typeof src === 'number' && src >= 0 && src <= 11);
    if (!editable) return;
    var preview = this._previewScheme();
    if (!preview) return;
    var S = myCatnip.LAB_SLOT;
    this._lab.slots[S.STRUCTURAL]   = myCatnip.bakeScheme(preview, this, 'structural');
    this._lab.slots[S.BAKED_INTERP] = myCatnip.bakeScheme(preview, this, 'bakedInterp');
    this._lab.slots[S.BAKED]        = myCatnip.bakeScheme(preview, this, 'baked');
    this._lab.slots[S.EXPORT]       = myCatnip.bakeScheme(preview, this, 'export');
};

// ============================================================
// PREVIEW CHANGE
// ============================================================
myCatnip.LabController.prototype._setPreview = function(src, label) {
    this._lab.previewSource = src;
    this._lab.previewing = true;
    this._applyAutoBake();
    this._labRenderPreview();
    myCatnip.modePrint('preview = ' + (label || this._previewLabel()));
};

// ============================================================
// SLOT ACTIONS
// ============================================================
myCatnip.LabController.prototype._selectSlot = function(idx) {
    if (this._lab.saveArmed) {
        var preview = this._previewScheme();
        if (!preview) {
            this._lab.saveArmed = false;
            myCatnip.modePrint('arm = OFF');
            myCatnip.debugPrint('labSlotPress', { i: idx });
            this._setPreview(idx, 'slot' + idx);
            this._refreshBinding('layer');
            return;
        }
        if (this._lab.previewSource !== idx) this._emitOverwriteBackup(idx);
        this._lab.slots[idx] = this._cloneScheme(myCatnip.resolveScheme(preview));
        myCatnip.debugPrint('labSlotSaved', { from: this._previewLabel(), to: idx });
        this._lab.saveArmed = false;
        myCatnip.modePrint('arm = OFF');
        this._lab.edit = this._cloneScheme(this._lab.slots[idx]);
        this._lab.previewSource = 'edit';
        this._lab.previewing = false;
        this._lab.selectedSegment = 0;
        this._lab.ratioEdit = false;
        this.replacePatch('slots', 'colorLab');
        return;
    }
    myCatnip.debugPrint('labSlotPress', { i: idx });
    this._setPreview(idx, 'slot' + idx);
};

myCatnip.LabController.prototype._toggleSaveArm = function() {
    this._lab.saveArmed = !this._lab.saveArmed;
    myCatnip.modePrint('arm = ' + (this._lab.saveArmed ? 'ON' : 'OFF'));
    this._labRenderGrid();
    this._refreshBinding('layer');
};

myCatnip.LabController.prototype._editReturn = function() {
    this._lab.saveArmed = false;
    this.replacePatch('slots', 'colorLab');
};

myCatnip.LabController.prototype._editThis = function() {
    var preview = this._previewScheme();
    if (!preview) return;
    myCatnip.debugPrint('labEditThis', { from: this._previewLabel() });
    this._lab.edit = this._cloneScheme(myCatnip.resolveScheme(preview));
    this._lab.previewSource = 'edit';
    this._lab.previewing = false;
    this._lab.selectedSegment = 0;
    this._lab.ratioEdit = false;
    this._lab.saveArmed = false;
    this.replacePatch('slots', 'colorLab');
};

myCatnip.LabController.prototype._loadPreview = function() {
    if (!this._patchActive('colorLab')) return;
    if (this._lab.previewSource === 'edit') return;
    var preview = this._previewScheme();
    if (!preview) return;
    myCatnip.debugPrint('labLoadPreview', { from: this._previewLabel() });
    this._lab.edit = this._cloneScheme(myCatnip.resolveScheme(preview));
    this._lab.previewSource = 'edit';
    this._lab.previewing = false;
    this._lab.selectedSegment = 0;
    this._lab.ratioEdit = false;
    this._labRenderPreview();
};

// ============================================================
// COLOUR EDIT
// ============================================================
myCatnip.LabController.prototype._editColorField = function(field, mode, value) {
    if (this._isBeatEdit()) {
        if (!this._lab.beatTarget) return;
        if (mode === 'step') this._editBeatColor(field, value, undefined);
        else                 this._editBeatColor(field, 0, value);
        return;
    }
    this._withEdit(function(scheme) {
        return (this._lab.selectedSegment === -1)
            ? this._editMarkerTarget(scheme, field, mode, value)
            : this._editSegmentTarget(scheme, field, mode, value);
    });
};

myCatnip.LabController.prototype._editMarkerTarget = function(scheme, field, mode, value) {
    var defaultBr = (typeof scheme.brightness === 'number') ? scheme.brightness : 127;
    var src = myCatnip.resolveColorEntry(scheme.markerColor || 'off', defaultBr, this);
    if (!src) return false;

    var rgb = src.rgb ? src.rgb.slice() : [0, 0, 0];
    var onBr  = (typeof src.brightness    === 'number') ? src.brightness    : defaultBr;
    var offBr = (typeof src.brightnessOff === 'number') ? src.brightnessOff : null;

    var editBr = (field === 'hw' || field === 'brightness');
    var curBr = editBr
        ? (this._lab.previewOn ? onBr : (offBr !== null ? offBr : onBr))
        : onBr;
    var res = myCatnip._applyFieldEdit(rgb, curBr, field, mode, value);
    if (!res) return false;

    if (editBr) {
        if (this._lab.previewOn) onBr = res.br;
        else offBr = res.br;
    }

    var entry = [rgb[0], rgb[1], rgb[2], onBr];
    if (offBr !== null) entry.push(offBr);
    scheme.markerColor = entry;
    myCatnip.debugPrint('labEditMarker', { field: field, v: res.val });
    return true;
};

myCatnip.LabController.prototype._editSegmentTarget = function(scheme, field, mode, value) {
    var segIdx = this._lab.selectedSegment;
    if (!scheme.colors || segIdx < 0) return false;

    if (segIdx >= scheme.colors.length) _extendTo(scheme, segIdx);
    if (segIdx >= scheme.colors.length) return false;

    var defaultBr = (typeof scheme.brightness === 'number') ? scheme.brightness : 127;
    var source = myCatnip.resolveColorEntry(scheme.colors[segIdx], defaultBr, this);
    if (!source) return false;

    var rgb = source.rgb ? source.rgb.slice() : [0, 0, 0];
    var res = myCatnip._applyFieldEdit(rgb, source.brightness, field, mode, value);
    if (!res) return false;

    var offBr = (typeof source.brightnessOff === 'number')
        ? source.brightnessOff : null;
    var entry = [rgb[0], rgb[1], rgb[2]];
    if (res.br !== defaultBr || offBr !== null) entry.push(res.br);
    if (offBr !== null) entry.push(offBr);
    scheme.colors[segIdx] = entry;
    if (rgb[0] !== 0 || rgb[1] !== 0 || rgb[2] !== 0) {
        _setColorSet(scheme, segIdx, true);
    }
    myCatnip.debugPrint('labEditSeg', { i: segIdx, field: field, v: res.val });
    return true;
};

// ============================================================
// BEAT EDIT
// ============================================================
myCatnip.LabController.prototype._editBeatColor = function(field, delta, absValue) {
    this._withEdit(function(scheme) {
        var level = this._lab.beatTarget;
        if (!level) return false;
        if (!scheme.beat) scheme.beat = { enabled: true };

        var tgt = (level === 'beat')
            ? scheme.beat
            : (scheme.beat[level] = scheme.beat[level] || {});

        var cur = myCatnip.resolveColorEntry(tgt.color || 'off', undefined, this);
        var rgb = (cur && cur.rgb) ? cur.rgb.slice() : [0, 0, 0];
        var br  = (typeof tgt.brightness === 'number')
            ? tgt.brightness
            : ((cur && typeof cur.brightness === 'number') ? cur.brightness : 127);
        var isAbs = (typeof absValue === 'number');
        var res = myCatnip._applyFieldEdit(rgb, br, field,
                                         isAbs ? 'abs' : 'step',
                                         isAbs ? absValue : delta);
        if (!res) return false;

        tgt.color = [rgb[0], rgb[1], rgb[2]];
        tgt.brightness = res.br;

        myCatnip.debugPrint('labBeatColor', { level: level, field: field, v: res.val });
        return true;
    });
};

// ============================================================
// DUMP — per-slot emitters
// ============================================================
myCatnip.LabController.prototype._emitOverwriteBackup = function(idx) {
    if (!this._lab.slots[idx]) return;
    var L = ['// ==================== overwriting slot ' + idx + ' ===================='];
    this._emitSlotDump(idx, L);
    print(L.join('\n'));
};

myCatnip.LabController.prototype._emitSlotDump = function(slotIdx, L) {
    var scheme = myCatnip.resolveScheme(this._lab.slots[slotIdx]);
    if (!scheme) return;
    var S = myCatnip.LAB_SLOT;
    var isMain = (slotIdx === S.ON);
    var baseName = 'slot' + slotIdx;

    var offScheme = null;
    var coScheme  = null;
    if (isMain) {
        var offSlot   = this._lab.slots[S.OFF];
        var coSlot    = this._lab.slots[S.CO];
        var coOffSlot = this._lab.slots[S.CO_OFF];
        if (offSlot) offScheme = myCatnip.resolveScheme(offSlot);
        if (coSlot) {
            coScheme = Object.assign({}, myCatnip.resolveScheme(coSlot));
            if (coOffSlot) coScheme.offScheme = myCatnip.resolveScheme(coOffSlot);
        }
    }

    _emitSchemeLines(L, baseName, scheme, offScheme, coScheme);
};

myCatnip.LabController.prototype._dumpSlot = function(slotIdx) {
    var L = [];
    this._emitSlotDump(slotIdx, L);
    print('\n' + L.join('\n'));
};

myCatnip.LabController.prototype._dumpPreview = function() {
    var src = this._lab.previewSource;
    if (typeof src === 'number') { this._dumpSlot(src); return; }
    var scheme;
    if (this._patchActive('colorLab') || src === 'edit') {
        scheme = this._lab.edit;
    } else if (typeof src === 'string') {
        scheme = myCatnip.resolveScheme(src);
    }
    if (!scheme) return;
    var L = [];
    _emitSchemeLines(L, 'NAME', myCatnip.resolveScheme(scheme));
    print('\n' + L.join('\n'));
};

myCatnip.LabController.prototype._dumpAllSlots = function() {
    var S = myCatnip.LAB_SLOT;
    var L = [];
    var emitted = {};
    var count = 0;
    for (var i = 0; i < 16; i++) {
        if (emitted[i]) continue;
        if (!this._lab.slots[i]) continue;
        L.push('// ==================== slot ' + i + ' ====================');
        this._emitSlotDump(i, L);
        count++;
        if (i === S.ON) {
            if (this._lab.slots[S.OFF])    emitted[S.OFF]    = true;
            if (this._lab.slots[S.CO])     emitted[S.CO]     = true;
            if (this._lab.slots[S.CO_OFF]) emitted[S.CO_OFF] = true;
        }
    }
    if (count === 0) print('// lab: no saved slots');
    else print('\n// lab: dumped ' + count + ' slot(s)\n' + L.join('\n'));
};

// ============================================================
// OVERRIDES
// ============================================================
myCatnip.LabController.prototype._initExtra = function() {
    if (this._perceptionMixActive === undefined) this._perceptionMixActive = true;

    var def = myCatnip.resolveScheme('labDefault');
    if (def) this._lab.slots[0] = this._cloneScheme(def);

    var self = this;

    if (this._labPreviewCO && this._labPreviewCO.group && this._labPreviewCO.name) {
        this._previewCOConn = engine.makeConnection(
            this._labPreviewCO.group, this._labPreviewCO.name,
            function() { self._labRenderPreview(); });
    }

    this._onBeat = function(ch) {
        var compiled = self._compiledPreview().compiled;
        if (!compiled || !compiled.beat) return;
        var beatCh = self._resolveDeckRef(compiled.beat.deck);
        if (beatCh && ch !== beatCh) return;
        self._syncBeatCount(ch);
        self._renderPreviewLED();
    };

    this._labRenderPreview();
    myCatnip.modePrint('mode = EDIT');
    myCatnip.modePrintFirst('edit', 'layer = slots, shift+R = load preview into edit');

    this._refreshAllLeds('lab-init');
};

myCatnip.LabController.prototype.shutdown = function() {
    if (this._shuttingDown) return;
    if (myCatnip.LAB_DUMP_ON_SHUTDOWN) {
        print('// lab: shutdown dump');
        this._dumpAllSlots();
    }
    myCatnip.Controller.prototype.shutdown.call(this);
};

myCatnip.LabController.prototype._shutdownExtra = function() {
    if (this._previewCOConn) { this._previewCOConn.disconnect(); this._previewCOConn = null; }
    this._onBeat = null;
};

myCatnip.LabController.prototype._onInput = function(b) {
    this._lab._version++;
};

myCatnip.LabController.prototype._afterRecompute = function() {
    this._labRenderPreview();
};

myCatnip.LabController.prototype._onPatchChange = function(from, to) {
    if (from === 'colorLab' && to !== 'colorLab') {
        this._lab.previewSource = 'edit';
        this._lab.previewing = false;
        this._lab.saveArmed = false;
        this._applyAutoBake();
        this._refreshBinding('layer');
    }
    if (to === 'slots') {
        myCatnip.modePrint('mode = SLOTS (preview=' + this._previewLabel() + ')');
        myCatnip.modePrintFirst('slots',
            'grid = preview, R = arm, shift+R = load into edit, shift+L = scroll');
        this._labRenderPreview();
    } else if (to === 'colorLab') {
        myCatnip.modePrint('mode = EDIT');
    }
};

myCatnip.LabController.prototype._needsBeatClocks = function() {
    return this._beatLeds.length > 0 || !!this._onBeat;
};

// ============================================================
// LED PAINT HELPERS
// ============================================================
myCatnip.LabController.prototype._paintRGB = function(name, r, g, b, hw) {
    var bind = this.bindings[name];
    if (!bind || bind.idx < 0) return;
    this.sendLED(bind.idx, r, g, b, hw);
};

myCatnip.LabController.prototype._paintLED = function(name, colorSpec, onOrHw) {
    var entry = myCatnip.resolveColorEntry(colorSpec, undefined, this);
    if (!entry || !entry.rgb) return;
    var hw;
    if (typeof onOrHw === 'number') {
        hw = onOrHw;
    } else if (typeof onOrHw === 'boolean') {
        hw = onOrHw
            ? entry.brightness
            : ((entry.brightnessOff !== undefined && entry.brightnessOff !== null)
                ? entry.brightnessOff : myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF);
    } else {
        hw = entry.brightness;
    }
    this._paintRGB(name, entry.rgb[0], entry.rgb[1], entry.rgb[2], hw);
};

myCatnip.LabController.prototype._paintCellsSolid = function(cells, colorSpec) {
    var entry = myCatnip.resolveColorEntry(colorSpec, undefined, this);
    if (!entry || !entry.rgb) return;
    for (var cell in cells) {
        this._paintRGB(cell, entry.rgb[0], entry.rgb[1], entry.rgb[2], entry.brightness);
    }
};

// ============================================================
// GRID / SLOT / STATE RENDER
// ============================================================
myCatnip.LabController.prototype._labRenderPreview = function() {
    this._labRenderStateLEDs();
    this._labRenderGrid();
    this._renderPreviewLED();
};

myCatnip.LabController.prototype._compiledPreview = function() {
    var v = this._lab._version;
    var src = this._lab.previewSource;
    if (this._compileCache &&
        this._compileCache.v === v &&
        this._compileCache.src === src) {
        return this._compileCache;
    }
    var preview = this._labLEDScheme();
    var resolved = preview ? myCatnip.resolveScheme(preview) : null;
    var compiled = resolved ? this._previewCompiled(resolved) : null;
    this._compileCache = { v: v, src: src, resolved: resolved, compiled: compiled };
    return this._compileCache;
};

myCatnip.LabController.prototype._labRenderGrid = function() {
    var onColorLab = this._patchActive('colorLab');
    var onSlots    = this._patchActive('slots');
    if (!onColorLab && !onSlots) return;
    var compiled = this._compiledPreview().compiled;
    this._renderSegmentGrid(compiled, onColorLab);
    if (onColorLab) this._renderMarkerLED(compiled);
    if (onSlots) {
        this._renderSlotLEDs();
    } else if (this._isBeatEdit()) {
        this._renderBeatGrid();
    }
};

myCatnip.LabController.prototype._renderSegmentGrid = function(compiled, onColorLab) {
    var targets = (this.ledTargetGroups && this.ledTargetGroups.calib) || [];
    var claimed = this._claimedCells();
    for (var i = 0; i < targets.length; i++) {
        var name = targets[i];
        if (claimed.has(name)) continue;
        var paint = this._segmentCellPaint(name, i, compiled, onColorLab);
        if (paint) {
            this._paintRGB(name, paint.rgb[0], paint.rgb[1], paint.rgb[2], paint.br);
        } else {
            this._paintRGB(name, 0, 0, 0, 0);
        }
    }
};

myCatnip.LabController.prototype._segmentCellPaint = function(name, i, compiled, onColorLab) {
    var applied = this._applied[name];
    if (applied == null || Object.keys(applied).length === 0) return null;
    if (!compiled || i >= compiled.on.length) return null;
    var c = compiled.on[i].color;
    var isBlack = (c.rgb[0] === 0 && c.rgb[1] === 0 && c.rgb[2] === 0);
    if (onColorLab && !this._lab.previewing && this.modifiers.shift && isBlack) {
        var rawScheme = this._editableScheme();
        if (rawScheme && _isColorSet(rawScheme, i)) {
            return { rgb: [127, 127, 127], br: 50 };
        }
    }
    return {
        rgb: c.rgb,
        br: this._solveHw(c.rgb, c.brightness, compiled.on, compiled)
    };
};

myCatnip.LabController.prototype._renderMarkerLED = function(compiled) {
    if (!this._markerTarget) return;
    if (!compiled || !compiled.marker) {
        this._paintRGB(this._markerTarget, 0, 0, 0, 0);
        return;
    }
    var m = compiled.marker;
    this._paintRGB(this._markerTarget, m.rgb[0], m.rgb[1], m.rgb[2], m.brightness);
};

myCatnip.LabController.prototype._renderSlotLEDs = function() {
    if (!this._patchActive('slots')) return;
    var S = myCatnip.LAB_SLOT;
    var cells = this._findCellsByFunc([myCatnip.FUNCS.labSlotPress]);
    for (var cell in cells) {
        var idx = parseInt(cells[cell][0], 10);
        if (isNaN(idx)) continue;
        var slot = this._lab.slots[idx];
        if (!slot) { this._paintRGB(cell, 0, 0, 0, 0); continue; }
        var col = myCatnip.LAB_SLOT_COLOURS[idx];
        if (!col) {
            col = (idx <= S.SAVE_END) ? [127, 127, 0] : [127, 0, 127];
        }
        var selected = (this._lab.previewSource === idx);
        var br = selected ? 127 : 20;
        this._paintRGB(cell, col[0], col[1], col[2], br);
    }
};

myCatnip.LabController.prototype._labRenderStateLEDs = function() {
    if (this._patchActive('colorLab')) {
        var beatOn = this._patchActive('colorLabBeat');
        this._paintCellsSolid(
            this._findCellsByFunc([myCatnip.FUNCS.labBeatEditToggle]),
            beatOn ? 'cyan, 60' : 'white, 20');
    }

    if (this.modifiers.shift && this._patchActive('colorLabTuning')) {
        this._paintLED('press1', 'white, 60');
        this._paintLED('press2', 'cyan, 60');
        this._paintLED('press3', 'green, 60');
        return;
    }

    if (this.modifiers.shift) {
        this._paintCellsSolid(
            this._findCellsByFunc([myCatnip.FUNCS.labToggleMix]),
            this._perceptionMixActive ? 'green, 80' : 'red, 80');
        return;
    }

    var preview = this._labLEDScheme();
    var resolved = preview ? myCatnip.resolveScheme(preview) : null;
    var interp = resolved ? (resolved.interp !== false) : true;
    var calibration = resolved ? (resolved.calibration !== false) : true;

    this._paintCellsSolid(
        this._findCellsByFunc([myCatnip.FUNCS.ledLabToggleCalibration]),
        calibration ? 'green, 80' : 'red, 80');
    this._paintCellsSolid(
        this._findCellsByFunc([myCatnip.FUNCS.ledLabToggleRatio]),
        this._lab.ratioEdit ? 'green, 80' : 'red, 80');
    this._paintCellsSolid(
        this._findCellsByFunc([myCatnip.FUNCS.ledLabToggleInterp]),
        interp ? 'green, 80' : 'red, 80');
};

myCatnip.LabController.prototype._renderBeatGrid = function() {
    var scheme = this._labLEDScheme();
    if (!scheme) return;
    scheme = myCatnip.resolveScheme(scheme);
    if (!scheme) return;
    var beat = scheme.beat || {};

    var targetCells = this._findCellsByFunc([myCatnip.FUNCS.labBeatSelect, myCatnip.FUNCS.labBeatClear]);
    for (var cell in targetCells) {
        var level = targetCells[cell][0];
        var sub = (level === 'beat') ? beat : beat[level];
        var entry = sub && sub.color
            ? myCatnip.resolveColorEntry(sub.color, undefined, this)
            : null;
        if (!entry || !entry.rgb) {
            this._paintLED(cell, 'white', false);
            continue;
        }
        var br = (typeof sub.brightness === 'number') ? sub.brightness : entry.brightness;
        this._paintRGB(cell, entry.rgb[0], entry.rgb[1], entry.rgb[2], br);
    }

    var toggleCells = this._findCellsByFunc([myCatnip.FUNCS.labBeatToggleEnabled]);
    var on = !(beat.enabled === false);
    for (var tcell in toggleCells) {
        this._paintRGB(tcell, on ? 0 : 127, on ? 127 : 0, 0, 100);
    }
};

// ============================================================
// PREVIEW LED
// ============================================================
myCatnip.LabController.prototype._previewCompiled = function(resolved) {
    if (!resolved) return null;
    if (this._lab.previewSource !== myCatnip.LAB_SLOT.ON) {
        return myCatnip.compileScheme(resolved, undefined, undefined, this);
    }
    var S = myCatnip.LAB_SLOT;
    var offSlot   = this._lab.slots[S.OFF];
    var coSlot    = this._lab.slots[S.CO];
    var coOffSlot = this._lab.slots[S.CO_OFF];

    var overrides = {};
    if (offSlot) overrides.offScheme = offSlot;
    if (coSlot) {
        overrides.coScheme = coOffSlot
            ? Object.assign({}, coSlot, { offScheme: coOffSlot })
            : coSlot;
    }
    return myCatnip.compileScheme(resolved, overrides, undefined, this);
};

myCatnip.LabController.prototype._renderBeatStoppedTarget = function(name, resolved) {
    if (!this._isBeatEdit() || !this._lab.beatTarget) return false;
    var bBeat = resolved && resolved.beat;
    if (!bBeat) return false;
    var lvl = this._lab.beatTarget;
    var sub = (lvl === 'beat') ? bBeat : bBeat[lvl];
    if (sub && sub.color) {
        var e = myCatnip.resolveColorEntry(sub.color, undefined, this);
        if (e && e.rgb) {
            var ebr = (typeof sub.brightness === 'number') ? sub.brightness : e.brightness;
            this._paintRGB(name, e.rgb[0], e.rgb[1], e.rgb[2], ebr);
            return true;
        }
    }
    this._paintRGB(name, 60, 60, 60, 100);
    return true;
};

myCatnip.LabController.prototype._renderCoMatch = function(name, compiled, previewPos, showOn) {
    if (!this._labPreviewCO || !this._labPreviewCO.group || !this._labPreviewCO.name) return false;
    var steer = myCatnip.coMatchSample(
        compiled,
        this._labPreviewCO.group,
        this._labPreviewCO.name,
        previewPos,
        showOn);
    if (!steer) return false;
    var coEntry = this._sampleRamp(steer.ramp, steer.t, compiled.co, showOn, true);
    if (!coEntry || coEntry === myCatnip.BEAT_HOLD) return false;
    this._paintRGB(name, coEntry.rgb[0], coEntry.rgb[1], coEntry.rgb[2], coEntry.brightness);
    return true;
};

myCatnip.LabController.prototype._renderMarkerBand = function(name, compiled, showOn, devDir) {
    if (!myCatnip.markerHit(compiled, devDir)) return false;
    var mbr = showOn
        ? compiled.marker.brightness
        : (typeof compiled.marker.brightnessOff === 'number'
            ? compiled.marker.brightnessOff
            : compiled.marker.brightness);
    this._paintRGB(name, compiled.marker.rgb[0], compiled.marker.rgb[1], compiled.marker.rgb[2], mbr);
    return true;
};

myCatnip.LabController.prototype._renderPreviewRamp = function(name, compiled, previewPos, showOn) {
    var ramp = showOn ? compiled.on : compiled.off;
    var entry = this._sampleRamp(ramp, previewPos, compiled, showOn, false);
    if (entry === myCatnip.BEAT_HOLD) return;
    if (!entry) { this._paintRGB(name, 0, 0, 0, 0); return; }
    this._paintRGB(name, entry.rgb[0], entry.rgb[1], entry.rgb[2], entry.brightness);
};

myCatnip.LabController.prototype._renderPreviewLED = function() {
    var name = this._labPreviewTarget;
    if (!name) return;

    if (!this._lab.previewKnown) {
        this._paintRGB(name, 127, 127, 127, 127);
        return;
    }

    try {
        this._renderPreviewLedBody(name);
    } catch (e) {
        myCatnip._warnOnce('labPreviewThrow:' + (e && e.message ? e.message : 'unknown'),
            'lab preview render threw: ' +
            (e && e.message ? e.message : e) +
            ' — preview LED painted black');
        this._paintRGB(name, 0, 0, 0, 0);
    }
};

myCatnip.LabController.prototype._renderPreviewLedBody = function(name) {
    var c = this._compiledPreview();
    var resolved = c.resolved;
    var compiled = c.compiled;
    if (!compiled) { this._paintRGB(name, 0, 0, 0, 0); return; }

    var st = compiled.beat ? this._deckStateFor(compiled) : null;
    var beatPlaying = !!(compiled.beat && st && st.hasBeat);

    if (!beatPlaying && this._renderBeatStoppedTarget(name, resolved)) return;

    if (beatPlaying) {
        var ch = this._resolveDeckRef(compiled.beat.deck);
        if (ch) this._syncBeatCount(ch);
    }

    var previewPos = this._lab.previewPos;
    var logicalOn = this._lab.previewOn ? 1 : 0;
    var beatOffPhase = beatPlaying && st && !st.active;

    if (beatOffPhase && !logicalOn) {
        this._paintRGB(name, 0, 0, 0, 0);
        return;
    }
    var isOn = (logicalOn && !beatOffPhase) ? 1 : 0;

    this._previewFrame(name, compiled, previewPos, isOn);
};

myCatnip.LabController.prototype._previewFrame = function(name, compiled, previewPos, isOn) {
    if (this._renderCoMatch(name, compiled, previewPos, isOn)) return;
    var devDir = previewPos * 2 - 1;
    if (this._renderMarkerBand(name, compiled, isOn, devDir)) return;
    this._renderPreviewRamp(name, compiled, previewPos, isOn);
};

// ============================================================
// SCALAR FIELD EDITORS
// ============================================================
myCatnip._makeFieldEditor = function(field, opts) {
    var min = opts.min, max = opts.max, def = opts.def;
    var step = opts.step || 1;
    var absScale = opts.absScale;
    var absOffset = opts.absOffset || 0;
    var dbg = opts.debug;
    return function(args, ch, c, v, s) {
        var binding = this;
        this._ctrl._withEdit(function(scheme) {
            var cur = (typeof scheme[field] === 'number') ? scheme[field] : def;
            var next;
            if (absScale !== null && absScale !== undefined &&
                (binding.type === 'knob' || binding.type === 'fader')) {
                next = binding._normalized * absScale + absOffset;
            } else {
                next = cur + (v === 1 ? 1 : -1) * step;
            }
            scheme[field] = Math.max(min, Math.min(max, next));
            myCatnip.debugPrint(dbg, { v: scheme[field] });
            return true;
        });
    };
};

myCatnip._makeCtrlEditor = function(field, opts) {
    var min = opts.min, max = opts.max;
    var defStep = opts.step || 0.02;
    var dbg = opts.debug;
    return function(args, ch, c, v, s) {
        var ctrl = this._ctrl;
        var dir = (v === 1) ? 1 : -1;
        var step = myCatnip.parseNum(args[0]);
        if (isNaN(step)) step = defStep;
        ctrl[field] = Math.max(min, Math.min(max, ctrl[field] + dir * step));
        myCatnip.debugPrint(dbg, { v: ctrl[field].toFixed(2) });
        ctrl._labRenderPreview();
        ctrl._refreshAllLeds('lab-ctrl-edit');
    };
};

myCatnip.FUNCS.ledLabCurve = myCatnip._makeFieldEditor('curve',
    { min: -0.95, max: 0.95, def: 0, step: 0.025,
      absScale: 1.9, absOffset: -0.95, debug: 'labCurve' });
myCatnip.FUNCS.ledLabBrightness = myCatnip._makeFieldEditor('brightness',
    { min: 0, max: 127, def: 127, step: 1, absScale: 127, debug: 'labBrightness' });
myCatnip.FUNCS.ledLabSchemePosition = myCatnip._makeFieldEditor('schemePosition',
    { min: 0, max: 127, def: 63.5, step: 2, absScale: 127, debug: 'labSchemePos' });
myCatnip.FUNCS.ledLabMarkerPosition = myCatnip._makeFieldEditor('markerPosition',
    { min: 0, max: 127, def: 63.5, step: 1, absScale: 127, debug: 'labMarkerPos' });
myCatnip.FUNCS.ledLabMarkerWidth = myCatnip._makeFieldEditor('markerWidth',
    { min: 0, max: 127, def: 0, step: 1, debug: 'labMarkerWidth' });
myCatnip.FUNCS.ledLabBrightnessScale = myCatnip._makeFieldEditor('brightnessScale',
    { min: 0.1, max: 3, def: 1, step: 0.05, debug: 'labBrightScale' });

myCatnip.FUNCS.ledLabHk  = myCatnip._makeCtrlEditor('hkBoost',
    { min: 0,   max: 2,   step: 0.02, debug: 'labHk' });
myCatnip.FUNCS.ledLabLum = myCatnip._makeCtrlEditor('lumGamma',
    { min: 0.1, max: 2,   step: 0.02, debug: 'labLum' });

// ============================================================
// SIMPLE FUNCS
// ============================================================
myCatnip.FUNCS.labSlotPress = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var idx = parseInt(args[0], 10);
    if (isNaN(idx) || idx < 0 || idx > 15) return;
    this._ctrl._selectSlot(idx);
};
myCatnip.FUNCS.labArmSave = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._toggleSaveArm();
};
myCatnip.FUNCS.labEditReturn = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._editReturn();
};
myCatnip.FUNCS.labEditThis = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._editThis();
};
myCatnip.FUNCS.labLoadPreview = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._loadPreview();
};
myCatnip.FUNCS.labTogglePreview = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    this._ctrl._lab.previewOn = !this._ctrl._lab.previewOn;
    myCatnip.debugPrint(this._ctrl._lab.previewOn ? 'labPreviewOn' : 'labPreviewOff');
    this._ctrl._labRenderPreview();
};

myCatnip.FUNCS.labSchemeScroll = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var names;
    if (Array.isArray(myCatnip.SCHEME_REGISTRY)) {
        names = myCatnip.SCHEME_REGISTRY.slice();
    } else {
        var all = Object.keys(myCatnip.SCHEMES);
        names = [];
        for (var i = 0; i < all.length; i++) {
            var sc = myCatnip.SCHEMES[all[i]];
            if (sc && sc.colors) names.push(all[i]);
        }
    }
    if (names.length === 0) return;
    var dir = (v === 1) ? 1 : -1;
    var cur = names.indexOf(ctrl._lab.schemeName);
    if (cur < 0) cur = 0;
    var next = (cur + dir + names.length) % names.length;
    var name = names[next];
    ctrl._lab.schemeName = name;
    myCatnip.debugPrint('labScroll', { name: name });
    ctrl._setPreview(name, name);
};

myCatnip.FUNCS.labToggleMix = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (ctrl._perceptionMixActive === undefined) ctrl._perceptionMixActive = true;
    ctrl._perceptionMixActive = !ctrl._perceptionMixActive;
    // Invalidate cached wire values — next render must re-send.
    ctrl._ledCache = {};
    myCatnip.debugPrint(ctrl._perceptionMixActive ? 'labMixOn' : 'labMixOff');
    ctrl._labRenderPreview();
    ctrl._refreshAllLeds('lab-mix');
};

// Backward-compat alias — warn-once if any config still calls it.
myCatnip.FUNCS.labToggleWb = function(args, ch, c, v, s) {
    myCatnip._warnOnce('labToggleWbDeprecated',
        'labToggleWb is deprecated — use labToggleMix. Aliasing.');
    return myCatnip.FUNCS.labToggleMix.call(this, args, ch, c, v, s);
};

myCatnip.FUNCS.ledSelectTarget = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    var name = args[0];
    var targets = (ctrl.ledTargetGroups && ctrl.ledTargetGroups.calib) || [];
    var idx = targets.indexOf(name);
    if (idx < 0) { print('ledSelectTarget: ' + name + ' not in calib group'); return; }
    if (!scheme.colors) scheme.colors = [[0, 0, 0]];

    if (ctrl.modifiers.shift) {
        if (idx === 0) return;
        if (idx >= scheme.colors.length) return;

        if (_isColorSet(scheme, idx)) {
            var prevTrue = -1;
            for (var l = idx - 1; l >= 0; l--) {
                if (_isColorSet(scheme, l)) { prevTrue = l; break; }
            }
            var nextTrue = -1;
            for (var r = idx + 1; r < scheme.colors.length; r++) {
                if (_isColorSet(scheme, r)) { nextTrue = r; break; }
            }
            var start = prevTrue + 1;
            var end = (nextTrue === -1) ? scheme.colors.length : nextTrue;
            var removeCount = end - start;
            if (removeCount > 0) {
                scheme.colors.splice(start, removeCount);
                if (scheme.colorSet) scheme.colorSet.splice(start, removeCount);
                if (scheme.ratio) scheme.ratio.splice(start, removeCount);
            }
        } else {
            scheme.colors.splice(idx, 1);
            if (scheme.colorSet) scheme.colorSet.splice(idx, 1);
            if (scheme.ratio) scheme.ratio.splice(idx, 1);
        }

        ctrl._lab.selectedSegment = 0;
        myCatnip.debugPrint('labDeleteSeg', { i: idx });
        ctrl._labRenderPreview();
        return;
    }

    _extendTo(scheme, idx);
    _setColorSet(scheme, idx, true);
    ctrl._lab.selectedSegment = idx;
    myCatnip.debugPrint('labSegment', { i: idx });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledSelectMarker = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (ctrl.modifiers.shift) {
        scheme.markerColor = null;
        scheme.markerWidth = 0;
        myCatnip.debugPrint('labMarkerClear');
        ctrl._labRenderPreview();
        return;
    }
    ctrl._lab.selectedSegment = -1;
    myCatnip.debugPrint('labMarker');
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledRGB = function(args, ch, c, v, s) {
    this._ctrl._editColorField(args[0], 'step', (v === 1) ? 1 : -1);
};
myCatnip.FUNCS.ledFader = function(args, ch, c, v, s) {
    var abs = Math.max(0, Math.min(127, Math.round(this._normalized * 127)));
    this._ctrl._editColorField(args[0], 'abs', abs);
};

myCatnip.FUNCS.ledRGBShow = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._editableScheme();
    if (!scheme) return;
    var segIdx = ctrl._lab.selectedSegment;
    if (segIdx === -1) {
        print('marker: ' + JSON.stringify(scheme.markerColor || 'unset') +
              '  width=' + (scheme.markerWidth || 0) +
              '  pos=' + (scheme.markerPosition || 63.5));
    } else if (!scheme.colors || segIdx >= scheme.colors.length) {
        print('segment ' + segIdx + ' out of range');
    } else {
        print('segment ' + segIdx + ': ' + JSON.stringify(scheme.colors[segIdx]));
    }
};

myCatnip.FUNCS.ledFillGaps = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme || !scheme.colors || scheme.colors.length === 0) return;
    var defaultBr = (typeof scheme.brightness === 'number') ? scheme.brightness : 127;
    var anchors = [];
    for (var i = 0; i < scheme.colors.length; i++) {
        var r = myCatnip.resolveColorEntry(scheme.colors[i], defaultBr, ctrl);
        if (!r || !r.rgb) continue;
        if (!_isColorSet(scheme, i)) continue;
        anchors.push({ pos: i, rgb: r.rgb, br: r.brightness });
    }
    if (anchors.length < 2) { print('ledFillGaps: need 2+ colorSet anchors'); return; }
    for (var a = 0; a < anchors.length - 1; a++) {
        var A = anchors[a], B = anchors[a + 1];
        var span = B.pos - A.pos;
        if (span <= 1) continue;
        for (var k = 1; k < span; k++) {
            var idx = A.pos + k;
            if (_isColorSet(scheme, idx)) continue;
            var t = k / span;
            scheme.colors[idx] = [
                Math.round(A.rgb[0] * (1 - t) + B.rgb[0] * t),
                Math.round(A.rgb[1] * (1 - t) + B.rgb[1] * t),
                Math.round(A.rgb[2] * (1 - t) + B.rgb[2] * t),
                Math.round(A.br * (1 - t) + B.br * t)
            ];
            _setColorSet(scheme, idx, true);
        }
    }
    myCatnip.debugPrint('labFillGaps', { n: anchors.length });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledLabRatio = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    if (!ctrl._lab.ratioEdit) { myCatnip.debugPrint('labRatioOff'); return; }
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    var segCount = (scheme.colors || []).length;
    if (segCount > 9) {
        if (scheme.ratio) { scheme.ratio = null; print('ratio wiped (segments > 9)'); ctrl._labRenderPreview(); }
        return;
    }
    var idx = parseInt(args[0], 10);
    if (isNaN(idx) || idx < 0) return;
    if (!scheme.ratio) scheme.ratio = [];
    while (scheme.ratio.length <= idx) scheme.ratio.push(1);
    if (this.type === 'knob' || this.type === 'fader') {
        scheme.ratio[idx] = Math.pow(2, (this._normalized * 2 - 1) * myCatnip.RATIO_GAIN);
    } else {
        var dir = (v === 1) ? 1 : -1;
        scheme.ratio[idx] = Math.max(0.1, Math.min(10, (scheme.ratio[idx] || 1) + dir * 0.1));
    }
    myCatnip.debugPrint('labRatio', { i: idx, v: scheme.ratio[idx].toFixed(2) });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledLabToggleInterp = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview(); if (!scheme) return;
    scheme.interp = !(scheme.interp !== false);
    myCatnip.debugPrint(scheme.interp ? 'labInterpOn' : 'labInterpOff');
    ctrl._labRenderPreview();
};
myCatnip.FUNCS.ledLabToggleCalibration = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview(); if (!scheme) return;
    scheme.calibration = !(scheme.calibration !== false);
    myCatnip.debugPrint(scheme.calibration ? 'labCalibOn' : 'labCalibOff');
    ctrl._labRenderPreview();
};
myCatnip.FUNCS.ledLabToggleRatio = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview(); if (!scheme) return;
    ctrl._lab.ratioEdit = !ctrl._lab.ratioEdit;
    if (!ctrl._lab.ratioEdit) scheme.ratio = null;
    myCatnip.debugPrint(ctrl._lab.ratioEdit ? 'labRatioOn' : 'labRatioOff');
    ctrl._labRenderPreview();
};
myCatnip.FUNCS.ledLabReset = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var field = args[0]; if (!field) return;
    var val = parseFloat(args[1]); if (isNaN(val)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview(); if (!scheme) return;
    scheme[field] = val;
    myCatnip.debugPrint('labReset', { field: field, v: val });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledLabPreview = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    if (this.type === 'knob' || this.type === 'fader') {
        ctrl._lab.previewPos = Math.max(0, Math.min(1, this._normalized));
    } else {
        var dir = (v === 1) ? 1 : -1;
        ctrl._lab.previewPos = Math.max(0, Math.min(1, ctrl._lab.previewPos + dir * 0.01));
    }
    ctrl._lab.previewKnown = true;
    ctrl._labRenderPreview();
};
myCatnip.FUNCS.ledLabPreviewWithCO = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var phys;
    if (this.type === 'knob' || this.type === 'fader') {
        phys = Math.max(0, Math.min(1, this._normalized));
    } else {
        var dir = (v === 1) ? 1 : -1;
        phys = Math.max(0, Math.min(1, ctrl._lab.previewPos + dir * 0.01));
    }
    ctrl._lab.previewPos = phys;
    ctrl._lab.previewKnown = true;
    if (this.group && this.inKey) engine.setParameter(this.group, this.inKey, phys);
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.ledDumpScheme = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    myCatnip.debugPrint('labDump', { from: ctrl._previewLabel() });
    ctrl._dumpPreview();
};

myCatnip.FUNCS.labBeatEditToggle = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (ctrl._patchActive('colorLabBeat')) {
        ctrl._lab.beatTarget = null;
        ctrl.removePatch('colorLabBeat');
        myCatnip.debugPrint('overlayOff', { name: 'colorLabBeat' });
        return;
    }
    if (!ctrl._patchActive('colorLab')) return;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (!scheme.beat) scheme.beat = { enabled: true };
    ctrl.addPatch('colorLabBeat');
    myCatnip.debugPrint('overlayOn', { name: 'colorLabBeat' });
};

myCatnip.FUNCS.labBeatSelect = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var level = args[0];
    if (!level) return;
    this._ctrl._lab.beatTarget = level;
    myCatnip.debugPrint('labBeatSelect', { level: level });
    this._ctrl._labRenderPreview();
};

myCatnip.FUNCS.labBeatClear = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var level = args[0];
    if (!level) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme || !scheme.beat) return;
    if (level === 'beat') {
        delete scheme.beat.color;
        delete scheme.beat.brightness;
    } else {
        delete scheme.beat[level];
    }
    ctrl._lab.beatTarget = null;
    myCatnip.debugPrint('labBeatClear', { level: level });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.labBeatToggleEnabled = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (!scheme.beat) scheme.beat = { enabled: true };
    var cur = (scheme.beat.enabled === false) ? false : true;
    scheme.beat.enabled = !cur;
    myCatnip.debugPrint('labBeatEnabled', { v: !cur });
    ctrl._labRenderPreview();
    ctrl._refreshAllLeds('lab-beat');
};

myCatnip.FUNCS.labBeatBarBeats = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (!scheme.beat) scheme.beat = { enabled: true };
    var cur = (typeof scheme.beat.barBeats === 'number') ? scheme.beat.barBeats : 4;
    var dir = (v === 1) ? 1 : -1;
    var next = Math.max(1, Math.min(32, cur + dir));
    scheme.beat.barBeats = next;
    myCatnip.debugPrint('labBeatBar', { v: next });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.labBeatPhraseBars = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (!scheme.beat) scheme.beat = { enabled: true };
    var cur = (typeof scheme.beat.phraseBars === 'number') ? scheme.beat.phraseBars : 4;
    var dir = (v === 1) ? 1 : -1;
    var next = Math.max(1, Math.min(32, cur + dir));
    scheme.beat.phraseBars = next;
    myCatnip.debugPrint('labBeatPhrase', { v: next });
    ctrl._labRenderPreview();
};

myCatnip.FUNCS.labBeatPrePhraseBeats = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var scheme = ctrl._commitPreview();
    if (!scheme) return;
    if (!scheme.beat) scheme.beat = { enabled: true };
    var bpb = scheme.beat.barBeats || 4;
    var ppb = scheme.beat.phraseBars || 4;
    var maxPre = bpb * ppb - 1;
    var cur = (typeof scheme.beat.prePhraseBeats === 'number') ? scheme.beat.prePhraseBeats : bpb;
    var dir = (v === 1) ? 1 : -1;
    var next = Math.max(0, Math.min(maxPre, cur + dir));
    scheme.beat.prePhraseBeats = next;
    myCatnip.debugPrint('labBeatPre', { v: next });
    ctrl._labRenderPreview();
};

// ============================================================
// DUMP HELPERS
// ============================================================
function _fmtDumpValue(v) {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return '[' + v.join(', ') + ']';
    if (typeof v === 'string') return "'" + v + "'";
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}
function _fmtDumpColorEntry(e) {
    if (e === null || e === undefined) return 'null';
    if (typeof e === 'string') return "'" + e + "'";
    if (Array.isArray(e)) return '[' + e.join(', ') + ']';
    if (typeof e === 'object' && e.color !== undefined) {
        var parts = ['color: ' + _fmtDumpValue(e.color)];
        if (e.ratio !== undefined) parts.push('ratio: ' + e.ratio);
        return '{ ' + parts.join(', ') + ' }';
    }
    return JSON.stringify(e);
}
function _fmtDumpBeatEntry(sub) {
    var parts = [];
    if (sub.color !== undefined)      parts.push('color: ' + _fmtDumpValue(sub.color));
    if (sub.brightness !== undefined) parts.push('brightness: ' + sub.brightness);
    return '{ ' + parts.join(', ') + ' }';
}
function _fmtDumpBeatLines(beat, indent) {
    var lines = [];
    var seen = {};
    var scalarKeys = ['color', 'brightness', 'barBeats', 'phraseBars',
                      'prePhraseBeats', 'half', 'deck'];
    var subKeys = ['bar', 'phrase', 'prePhrase'];
    var i, k;
    for (i = 0; i < scalarKeys.length; i++) {
        k = scalarKeys[i];
        if (beat[k] === undefined) continue;
        seen[k] = true;
        lines.push(indent + k + ': ' + _fmtDumpValue(beat[k]) + ',');
    }
    for (i = 0; i < subKeys.length; i++) {
        k = subKeys[i];
        if (beat[k] === undefined) continue;
        seen[k] = true;
        lines.push(indent + k + ': ' + _fmtDumpBeatEntry(beat[k]) + ',');
    }
    for (k in beat) {
        if (seen[k]) continue;
        lines.push(indent + k + ': ' + _fmtDumpValue(beat[k]) + ',');
    }
    return lines;
}

function _emitSchemeField(L, name, value, indent) {
    if (value === null) {
        L.push(indent + name + ': null,');
        return;
    }
    if (typeof value === 'string') {
        L.push(indent + name + ": '" + value + "',");
        return;
    }
    if (typeof value === 'object') {
        L.push(indent + name + ': {');
        _emitSchemeFields(L, value, indent + '    ');
        L.push(indent + '},');
    }
}

var _DUMP_SCALARS = [
    'curve', 'schemePosition', 'interp', 'calibration',
    'brightness', 'brightnessScale', 'markerPosition', 'markerWidth'
];

function _emitSchemeFields(L, scheme, indent) {
    var D = myCatnip.SCHEME_DEFAULTS;
    function push(x) { L.push(indent + x); }
    push('colors: [');
    var colors = scheme.colors || [];
    for (var i = 0; i < colors.length; i++) {
        L.push(indent + '    ' + _fmtDumpColorEntry(colors[i]) +
            (i < colors.length - 1 ? ',' : ''));
    }
    push('],');
    if (scheme.ratio && scheme.ratio !== D.ratio) {
        var r = scheme.ratio.slice();
        while (r.length > 0 && r[r.length - 1] === 1) r.pop();
        if (r.length > 0) push('ratio: [' + r.join(', ') + '],');
    }
    for (var si = 0; si < _DUMP_SCALARS.length; si++) {
        var f = _DUMP_SCALARS[si];
        if (scheme[f] !== D[f]) push(f + ': ' + scheme[f] + ',');
    }
    if (scheme.markerColor !== D.markerColor) {
        push('markerColor: ' + _fmtDumpValue(scheme.markerColor) + ',');
    }
    if (scheme.offScheme !== D.offScheme && scheme.offScheme !== undefined && scheme.offScheme !== null) {
        _emitSchemeField(L, 'offScheme', scheme.offScheme, indent);
    }
    if (scheme.coScheme !== D.coScheme && scheme.coScheme !== undefined && scheme.coScheme !== null) {
        _emitSchemeField(L, 'coScheme', scheme.coScheme, indent);
    }
    if (scheme.reverse !== D.reverse) push('reverse: ' + scheme.reverse + ',');
    if (scheme.beat && scheme.beat.enabled !== false) {
        var dumpBeat = JSON.parse(JSON.stringify(scheme.beat));
        delete dumpBeat.enabled;
        if (Object.keys(dumpBeat).length > 0) {
            push('beat: {');
            var beatLines = _fmtDumpBeatLines(dumpBeat, indent + '    ');
            for (var bi = 0; bi < beatLines.length; bi++) L.push(beatLines[bi]);
            push('},');
        }
    }
}

function _emitSchemeLines(L, name, scheme, offOverride, coOverride) {
    var flat = Object.assign({}, scheme);
    if (offOverride !== undefined) flat.offScheme = offOverride;
    if (coOverride !== undefined)  flat.coScheme  = coOverride;
    L.push('myCatnip.SCHEMES.' + name + ' = {');
    _emitSchemeFields(L, flat, '    ');
    L.push('};');
    L.push('');
}

myCatnip._dump = {
    schemeLines:  _emitSchemeLines,
    schemeFields: _emitSchemeFields,
    schemeField:  _emitSchemeField,
    fmtValue:     _fmtDumpValue,
    fmtColorEntry:_fmtDumpColorEntry,
    fmtBeatLines: _fmtDumpBeatLines
};
myCatnip._emitSchemeLines = _emitSchemeLines;

myCatnip.LAB_PAINTER_FUNCS = [
    myCatnip.FUNCS.labBeatSelect,
    myCatnip.FUNCS.labBeatClear,
    myCatnip.FUNCS.labBeatToggleEnabled,
    myCatnip.FUNCS.labBeatEditToggle,
    myCatnip.FUNCS.labSlotPress
];

myCatnip.SCHEMES.labDefault = { colors: [[0, 0, 0]] };

