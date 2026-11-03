// config/k3-cat-fx.mjs — Cat's FX cell layout tables and a single
// unified emitter.
//
//   FX_LAYOUTS                 focus, 16 cells per unit
//   TWO_DECK_FX_LAYOUTS        twoDeck, 4 cells per column
//   TWO_DECK_MINI_FX_LAYOUTS   mini, 8 cells per unit


var B = myCatnip.builders;
var CAT = myCatnip.CAT;
var fxScheme = CAT.fxScheme;

function emitFxCell(spec, unit, knobRef, schemeFn, slotMap) {
    if (spec === null) return null;
    if (spec === undefined) {
        myCatnip._warnOnce('fxCellMissing:' + unit + ':' + (knobRef || '?'),
            'fxCells: missing layout entry for unit ' + unit +
            ' at ' + (knobRef || 'knob') + ' — table is incomplete');
        return null;
    }
    if (spec.displayOnly) {
        var want = spec.ledTracks !== undefined ? spec.ledTracks : knobRef;
        var target = (slotMap && slotMap[want] !== undefined)
            ? slotMap[want]
            : want;
        var cell = B.ledTrackButton(target, schemeFn, undefined,
                                    spec.marker, spec.schemePosition);
        if (spec.on !== undefined) cell.colorScheme.on = spec.on;
        return cell;
    }
    if (spec.fxRoute) {
        return B.fxGroupEnable('$FX_ACTIVE_N$', '$DECK_ACTIVE$',
            Object.assign({ knob: knobRef },
                        CAT.fxSchemeFor('selectedFxCurrent')));
    }
    if (spec.enabled) {
        return B.fxEnabled(unit, spec.effect, {
            knob: knobRef, scheme: schemeFn,
            marker: spec.marker, schemePosition: spec.schemePosition
        });
    }
    if (spec.buttonParam !== undefined) {
        return B.fxButton(unit, spec.effect, spec.buttonParam, {
            knob: knobRef, scheme: schemeFn,
            marker: spec.marker, schemePosition: spec.schemePosition
        });
    }
    if (spec.unit) {
        return B.fxUnitKnob(unit, spec.param);
    }
    return B.fxKnob(unit, spec.effect, spec.param);
}

function fxLayoutTable(overrides) {
    return Object.assign({
        knob2_0:   { effect: 1, param: 2 },
        knob3_0:   { effect: 1, param: 'meta' },
        button2_0: { displayOnly: true, on: false, marker: 'mid', schemePosition: 63.5 },
        button3_0: { effect: 1, enabled: true },

        knob1_0:   { effect: 2, param: 1 },
        button1_0: { displayOnly: true, on: false },

        knob1_1:   { effect: 2, param: 2 },
        knob2_1:   { effect: 2, param: 3 },
        knob3_1:   { effect: 2, param: 4 },
        button1_1: { effect: 2, buttonParam: 1 },
        button2_1: { effect: 2, buttonParam: 2 },
        button3_1: { effect: 2, enabled: true, marker: 'low', schemePosition: 0 },

        knob2_2:   { effect: 3, param: 2 },
        knob3_2:   { effect: 3, param: 'meta' },
        button2_2: { displayOnly: true, on: false },
        button3_2: { effect: 3, enabled: true },
    }, overrides);
}

var FX_LAYOUTS = {
    1: fxLayoutTable(),
    2: fxLayoutTable({}),
    3: fxLayoutTable({
        knob1_0:   { effect: 2, param: 2 },
        button1_0: { displayOnly: true, on: false, marker: 'low', schemePosition: 0 },

        knob1_1:   { effect: 2, param: 3 },
        knob2_1:   { effect: 2, param: 4 },
        knob3_1:   { effect: 2, param: 5 },
        button1_1: { effect: 2, buttonParam: 1, marker: 'mid', schemePosition: 63.5 },
        button2_1: { displayOnly: true, on: false, marker: 'mid', schemePosition: 63.5 },
        button3_1: { effect: 2, enabled: true, marker: 'low', schemePosition: 0 },
    }),
    4: fxLayoutTable({
        knob2_0:   { effect: 1, param: 1 },
        knob3_0:   { effect: 1, param: 3 },

        button2_0: { displayOnly: true, on: false },
        button3_0: { effect: 1, enabled: true, marker: 'low', schemePosition: 0 },

        knob1_0:   { effect: 2, param: 2 },
        button1_0: { displayOnly: true, on: false, marker: 'mid', schemePosition: 63.5 },

        knob1_1:   { effect: 2, param: 3 },
        knob2_1:   { effect: 2, param: 4 },
        knob3_1:   { effect: 2, param: 5 },
        button1_1: { effect: 2, buttonParam: 1, marker: 'mid', schemePosition: 63.5 },
        button2_1: { effect: 2, buttonParam: 2, marker: 'mid', schemePosition: 63.5 },
        button3_1: { effect: 2, enabled: true, marker: 'low', schemePosition: 0 },
    })
};

function fxCells(n) {
    var L = FX_LAYOUTS[n];
    var unit = '' + n;
    var sch = function() { return fxScheme(n); };
    return {
        knob1_0:   emitFxCell(L.knob1_0,   unit, undefined,  sch),
        knob2_0:   emitFxCell(L.knob2_0,   unit, undefined,  sch),
        knob3_0:   emitFxCell(L.knob3_0,   unit, undefined,  sch),
        button1_0: emitFxCell(L.button1_0, unit, 'knob1_0',  sch),
        button2_0: emitFxCell(L.button2_0, unit, 'knob2_0',  sch),
        button3_0: emitFxCell(L.button3_0, unit, 'knob3_0',  sch),

        knob1_1:   emitFxCell(L.knob1_1,   unit, undefined,  sch),
        knob2_1:   emitFxCell(L.knob2_1,   unit, undefined,  sch),
        knob3_1:   emitFxCell(L.knob3_1,   unit, undefined,  sch),
        button1_1: emitFxCell(L.button1_1, unit, 'knob1_1',  sch),
        button2_1: emitFxCell(L.button2_1, unit, 'knob2_1',  sch),
        button3_1: emitFxCell(L.button3_1, unit, 'knob3_1',  sch),

        knob2_2:   emitFxCell(L.knob2_2,   unit, undefined,  sch),
        knob3_2:   emitFxCell(L.knob3_2,   unit, undefined,  sch),
        button2_2: emitFxCell(L.button2_2, unit, 'knob2_2',  sch),
        button3_2: emitFxCell(L.button3_2, unit, 'knob3_2',  sch),
    };
}

function fxLayout(n) {
    return Object.assign({ patch: ['topShared'] }, fxCells(n));
}

function twoDeckFxTable(overrides) {
    return Object.assign({
        knob0:   { effect: 1, param: 'meta' },
        knob1:   { effect: 2, param: 'meta' },
        button0: { effect: 1, enabled: true, marker: 'low', schemePosition: 0 },
        button1: { effect: 2, enabled: true, marker: 'low', schemePosition: 0 }
    }, overrides);
}

var TWO_DECK_FX_LAYOUTS = {
    1: twoDeckFxTable(),
    2: twoDeckFxTable(),
    3: twoDeckFxTable(),
    4: twoDeckFxTable()
};

function twoDeckFxColumn(side, n) {
    var L = TWO_DECK_FX_LAYOUTS[n];
    var col = (side === 'A') ? 1 : 2;
    var unit = '$FX_' + side + '_N$';
    var sch = function() { return fxScheme(n); };
    var knob0 = 'knob' + col + '_0';
    var knob1 = 'knob' + col + '_1';
    var slotMap = { knob0: knob0, knob1: knob1 };
    var cells = {};
    cells[knob0]                    = emitFxCell(L.knob0,   unit, undefined, sch, slotMap);
    cells[knob1]                    = emitFxCell(L.knob1,   unit, undefined, sch, slotMap);
    cells['button' + col + '_0']    = emitFxCell(L.button0, unit, knob0,     sch, slotMap);
    cells['button' + col + '_1']    = emitFxCell(L.button1, unit, knob1,     sch, slotMap);
    return cells;
}

function twoDeckFxLayout(side, n) {
    return Object.assign({ patch: ['twoDeck'] }, twoDeckFxColumn(side, n));
}

var MINI_LAYOUTS = {
    split: {
        knob0:   { effect: 1, param: 1 },
        knob2:   { effect: 1, param: 'meta' },
        button0: { effect: 1, buttonParam: 1, marker: 'low' },
        button2: { effect: 1, enabled: true, marker: 'low' },

        knob1:   { effect: 2, param: 1 },
        knob3:   { effect: 2, param: 'meta' },
        button1: { effect: 2, buttonParam: 1, marker: 'low' },
        button3: { effect: 2, enabled: true, marker: 'low' }
    },
    echo: {
        knob0:   { effect: 1, param: 1 },
        button0: { effect: 1, buttonParam: 1 },
        knob1:   { effect: 1, param: 3 },
        button1: { effect: 1, buttonParam: 2 },
        knob2:   { effect: 1, param: 2 },
        button2: { displayOnly: true, on: true },
        knob3:   { effect: 1, param: 4 },
        button3: { effect: 1, enabled: true }
    }
};

function twoDeckMiniFxTable(layoutName) {
    var layout = MINI_LAYOUTS[layoutName];
    if (!layout) {
        myCatnip._warnOnce('miniLayoutMissing:' + layoutName,
            'twoDeckMiniFxTable: unknown layout "' + layoutName +
            '" — falling back to "split"');
        layout = MINI_LAYOUTS.split;
    }
    return Object.assign({}, layout);
}

var TWO_DECK_MINI_FX_LAYOUTS = {
    1: twoDeckMiniFxTable('split'),
    2: twoDeckMiniFxTable('echo'),
    3: twoDeckMiniFxTable('echo'),
    4: twoDeckMiniFxTable('echo')
};

function twoDeckMiniFxCells(n) {
    var L = TWO_DECK_MINI_FX_LAYOUTS[n];
    var unit = '$FX_ACTIVE_N$';
    var sch = function() { return fxScheme(n); };
    return {
        knob1_0:   emitFxCell(L.knob0,   unit, undefined, sch),
        knob2_0:   emitFxCell(L.knob1,   unit, undefined, sch),
        knob1_1:   emitFxCell(L.knob2,   unit, undefined, sch),
        knob2_1:   emitFxCell(L.knob3,   unit, undefined, sch),

        button1_0: emitFxCell(L.button0, unit, 'knob1_0', sch),
        button2_0: emitFxCell(L.button1, unit, 'knob2_0', sch),
        button1_1: emitFxCell(L.button2, unit, 'knob1_1', sch),
        button2_1: emitFxCell(L.button3, unit, 'knob2_1', sch)
    };
}

function twoDeckMiniFxLayout(n) {
    return Object.assign({ patch: ['twoDeckMini'] }, twoDeckMiniFxCells(n));
}

CAT.fxLayout = fxLayout;
CAT.twoDeckFxLayout = twoDeckFxLayout;
CAT.twoDeckMiniFxLayout = twoDeckMiniFxLayout;
CAT.MINI_LAYOUTS = MINI_LAYOUTS;

