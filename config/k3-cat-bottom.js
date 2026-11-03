// config/k3-cat-bottom.mjs — Cat's cue / loop layers, their shift
// companions, and the two layer-scoped overlays.


var F = myCatnip.FUNCS;
var B = myCatnip.builders;
var CAT = myCatnip.CAT;

function eqRamp() {
    return B.composeScheme({ scheme: 'myCatnipSpread', markerWidth: 0 });
}

function beatjump1(dir) {
    return { func: F.beatjumpButton, args: ['beatjump_1_' + dir],
             group: '$DECK_ACTIVE$', outKey: 'track_loaded',
             colorScheme: { knob: (dir === 'backward') ? 'fader0' : 'fader1',
                            scheme: eqRamp() } };
}

function slipCell() {
    return { func: F.slipOrLoad,
             group: '$DECK_ACTIVE$',
             outKey: 'slip_enabled',
             colorScheme: CAT.slipScheme() };
}

function playCell() {
    return { group: '$DECK_ACTIVE$', inKey: 'play', outKey: 'play_indicator',
             colorScheme: CAT.PLAY_LED_SCHEME };
}

function layerButton(from, to) {
    return { func: F.layerButton, args: [from, to],
             type: 'push',
             group: '$DECK_A$',
             outKey: 'track_loaded',
             colorScheme: { scheme: CAT.countdownScheme() } };
}

function hotcue(n) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: 'hotcue_' + n + '_activate',
        outKey: 'hotcue_' + n + '_status',
        colorScheme: { scheme: 'mixxx' },
        type: 'push'
    };
}
function hotcueClear(n) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: 'hotcue_' + n + '_clear',
        outKey: 'hotcue_' + n + '_status',
        colorScheme: { scheme: 'red, 93, 0' },
        type: 'push'
    };
}
function hotcuePhrase(n) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: 'hotcue_' + n + '_activate',
        outKey: 'hotcue_' + n + '_status',
        colorScheme: { scheme: 'mixxx' },
        type: 'push',
        func: F.hotcueSetPhraseColor,
        args: [n]
    };
}
function hotcuePhraseClear(n) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: 'hotcue_' + n + '_clear',
        outKey: 'hotcue_' + n + '_status',
        colorScheme: { scheme: 'red, 93, 0' },
        type: 'push'
    };
}
function markerCell(base, color) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: base + '_activate',
        outKey: base + '_enabled',
        colorScheme: { scheme: color + ', 110' },
        type: 'push'
    };
}
function markerCellShift(base) {
    return {
        group: '$DECK_ACTIVE$',
        inKey: base + '_clear',
        outKey: base + '_enabled',
        colorScheme: { scheme: 'red, 93' },
        type: 'push'
    };
}
function loopSize(size, scheme) {
    return { func: F.pressSetValue, args: [size],
             group: '$DECK_ACTIVE$', inKey: 'beatloop_size', outKey: 'beatloop_size',
             colorScheme: { scheme: scheme } };
}
function beatjumpSize(size, scheme) {
    return { func: F.pressSetValue, args: [size],
             group: '$DECK_ACTIVE$', inKey: 'beatjump_size', outKey: 'beatjump_size',
             colorScheme: { scheme: scheme } };
}

var CUE = {
    layer: layerButton('cue', 'loop'),
    pressR:   { type: 'push' },
    pressL:   { type: 'push', func: F.bpmPress },
    encoderL: { func: F.encBpmOrHeadMix, args: [0.1, 0.05],
                group: '$DECK_ACTIVE$', inKey: 'bpm' },
    encoderR: { func: F.encPlaylistNav },

    grid0_0: beatjump1('backward'),
    grid1_0: beatjump1('forward'),
    grid2_0: { func: F.cycleDisplaySource,
               group: '$DECK_ACTIVE$',
               colorScheme: {
                   knob: 'fader2',
                   scheme: eqRamp(),
                   on: { state: 'activeDeckVirtual', equals: false }
               } },
    grid2_1: slipCell(),
    grid3_1: playCell(),
    grid3_0: { group: '$DECK_ACTIVE$', inKey: 'cue_default', outKey: 'cue_indicator',
               colorScheme: { knob: 'fader3', scheme: eqRamp() }, type: 'push' },

    grid0_1: { func: F.beatjumpButton, args: ['beatjump_16_backward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: [69, 0, 127, 127] } },
    grid1_1: { func: F.beatjumpButton, args: ['beatjump_16_forward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: [69, 0, 127, 127] } },

    grid0_2: hotcue(1), grid1_2: hotcue(2), grid2_2: hotcue(3), grid3_2: hotcue(4),
    grid0_3: hotcue(5), grid1_3: hotcue(6), grid2_3: hotcue(7), grid3_3: hotcue(8)
};

var CUE_SHIFT = {
    grid2_0: { group: '$DECK_ACTIVE$',
               colorScheme: { knob: 'fader2', scheme: eqRamp(), on: false } },
    grid2_1: {
        func: function(args, ch, c, v, s) {
            if (!this._ctrl._isPress(v, s)) return;
            var ctrl = this._ctrl;
            if (ctrl.modifiers.chord) {
                F.toggleLayerOverlay.call(this, ['hotcue2', 'loopOdd'], ch, c, v, s);
                return;
            }
            ctrl.setActiveDeck(ctrl.activeDeck === 'A' ? 'B' : 'A');
        },
        group: '$DECK_ACTIVE$',
        outKey: 'slip_enabled',
        colorScheme: CAT.slipScheme()
    },

    encoderL: { func: F.encStepParam, args: ['[Master]', 'gain', 0.01] },
    encoderR: { func: F.encStepParam, args: ['[Master]', 'headVolume', 0.01] },

    grid3_0: { group: '$DECK_ACTIVE$', inKey: 'cue_clear', outKey: 'cue_indicator',
               colorScheme: { knob: 'fader3', scheme: eqRamp() }, type: 'push' },
    grid3_1: { group: '$DECK_ACTIVE$', outKey: 'play_indicator',
               colorScheme: CAT.PLAY_LED_SCHEME },

    grid0_2: hotcueClear(1), grid1_2: hotcueClear(2), grid2_2: hotcueClear(3), grid3_2: hotcueClear(4),
    grid0_3: hotcueClear(5), grid1_3: hotcueClear(6), grid2_3: hotcueClear(7), grid3_3: hotcueClear(8)
};
CUE._shift = 'cueShift';

var CUE_2 = {
    _host: 'cue',
    grid0_1: { func: F.beatjumpButton, args: ['beatjump_16_backward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },
    grid1_1: { func: F.beatjumpButton, args: ['beatjump_16_forward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },

    grid0_2: hotcuePhrase(9),  grid1_2: hotcuePhrase(10),
    grid2_2: hotcuePhrase(11), grid3_2: hotcuePhrase(12),

    grid0_3: markerCell('intro_start', 'green'),
    grid1_3: markerCell('intro_end',   'lime'),
    grid2_3: markerCell('outro_start', 'amber'),
    grid3_3: markerCell('outro_end',   'orange')
};
CUE_2._shift = 'hotcue2Shift';

var CUE_2_SHIFT = {
    grid0_1: { func: F.beatjumpButton, args: ['beatjump_16_backward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },
    grid1_1: { func: F.beatjumpButton, args: ['beatjump_16_forward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },

    grid0_2: hotcuePhraseClear(9),  grid1_2: hotcuePhraseClear(10),
    grid2_2: hotcuePhraseClear(11), grid3_2: hotcuePhraseClear(12),

    grid0_3: markerCellShift('intro_start'),
    grid1_3: markerCellShift('intro_end'),
    grid2_3: markerCellShift('outro_start'),
    grid3_3: markerCellShift('outro_end')
};

var LOOP = {
    layer: layerButton('loop', 'cue'),
    encoderL: { func: F.encLoopMove, args: ['in', 0.010],
                group: '$DECK_ACTIVE$', inKey: 'beatloop_size' },
    pressL:   { func: F.reloopToggleResetAnchor, group: '$DECK_ACTIVE$' },
    encoderR: { func: F.encLoopMove, args: ['out', 0.010],
                group: '$DECK_ACTIVE$', inKey: 'beatloop_size' },
    pressR:   { func: F.beatloopActivateResetAnchor, group: '$DECK_ACTIVE$' },

    grid0_0: beatjump1('backward'),
    grid1_0: beatjump1('forward'),
    grid2_0: { func: F.cycleDisplaySource,
               group: '$DECK_ACTIVE$',
               colorScheme: {
                   knob: 'fader2',
                   scheme: eqRamp(),
                   on: { state: 'activeDeckVirtual', equals: false }
               } },

    grid0_1: { func: F.beatjumpButton, args: ['beatjump_backward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'magenta' } },
    grid1_1: { func: F.beatjumpButton, args: ['beatjump_forward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'magenta' } },
    grid2_1: slipCell(),
    grid3_1: playCell(),

    grid3_0: { colorScheme: {
                knob: 'fader3',
                scheme: eqRamp(),
                on: true
            } },

    grid0_2: loopSize('8', 'green'),  grid1_2: loopSize('4',   'green'),
    grid2_2: loopSize('2', 'green'),  grid3_2: loopSize('1',   'teal2'),
    grid0_3: loopSize('1/16', 'green'),  grid1_3: loopSize('1/8',   'green'),
    grid2_3: loopSize('1/4','green'),  grid3_3: loopSize('1/2',   'teal2')
};

var LOOP_SHIFT = {
    grid2_0: { group: '$DECK_ACTIVE$',
               colorScheme: { knob: 'fader2', scheme: eqRamp(), on: false } },
    grid2_1: {
        func: function(args, ch, c, v, s) {
            if (!this._ctrl._isPress(v, s)) return;
            var ctrl = this._ctrl;
            if (ctrl.modifiers.chord) {
                F.toggleLayerOverlay.call(this, ['hotcue2', 'loopOdd'], ch, c, v, s);
                return;
            }
            ctrl.setActiveDeck(ctrl.activeDeck === 'A' ? 'B' : 'A');
        },
        group: '$DECK_ACTIVE$',
        outKey: 'slip_enabled',
        colorScheme: CAT.slipScheme()
    },

    encoderL: { func: F.encBeatjump, group: '$DECK_ACTIVE$' },
    encoderR: { func: F.encBeatjumpStepScale, args: ['1/32', 16], group: '$DECK_ACTIVE$' },

    grid3_1: { group: '$DECK_ACTIVE$', outKey: 'play_indicator',
               colorScheme: CAT.PLAY_LED_SCHEME },

    grid0_2: beatjumpSize('8', 'teal2'), grid1_2: beatjumpSize('4',   'teal2'),
    grid2_2: beatjumpSize('2', 'teal2'), grid3_2: beatjumpSize('1',   'green'),
    grid0_3: beatjumpSize('1/16', 'teal2'), grid1_3: beatjumpSize('1/8',   'teal2'),
    grid2_3: beatjumpSize('1/4','teal2'), grid3_3: beatjumpSize('1/2',   'green')
};
LOOP._shift = 'loopShift';

var LOOP_ODD = {
    _host: 'loop',
    grid0_1: { func: F.beatjumpButton, args: ['beatjump_backward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },
    grid1_1: { func: F.beatjumpButton, args: ['beatjump_forward'],
               group: '$DECK_ACTIVE$', outKey: 'track_loaded',
               colorScheme: { scheme: 'yellow, 127' } },

    grid0_2: loopSize('7',    'cyan'), grid1_2: loopSize('5',    'cyan'),
    grid2_2: loopSize('3',    'cyan'), grid3_2: loopSize('1',    'sky2'),
    grid0_3: loopSize('3/32', 'cyan'), grid1_3: loopSize('3/16', 'cyan'),
    grid2_3: loopSize('3/8',  'cyan'), grid3_3: loopSize('1/2',  'sky2')
};

LOOP_ODD._shift = 'loopOddShift';

var LOOP_ODD_SHIFT = {
    grid0_2: beatjumpSize('7',    'sky2'), grid1_2: beatjumpSize('5',    'sky2'),
    grid2_2: beatjumpSize('3',    'sky2'), grid3_2: beatjumpSize('1',    'cyan'),
    grid0_3: beatjumpSize('3/32', 'sky2'), grid1_3: beatjumpSize('3/16', 'sky2'),
    grid2_3: beatjumpSize('3/8',  'sky2'), grid3_3: beatjumpSize('1/2',  'cyan')
};

CAT.CUE = CUE;
CAT.CUE_SHIFT = CUE_SHIFT;
CAT.CUE_2 = CUE_2;
CAT.CUE_2_SHIFT = CUE_2_SHIFT;
CAT.LOOP = LOOP;
CAT.LOOP_SHIFT = LOOP_SHIFT;
CAT.LOOP_ODD = LOOP_ODD;
CAT.LOOP_ODD_SHIFT = LOOP_ODD_SHIFT;

