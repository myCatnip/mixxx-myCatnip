// config/k3-cat-top.mjs — Cat's three top-half base patches and
// the single shared shift companion.


var F = myCatnip.FUNCS;
var B = myCatnip.builders;
var CAT = myCatnip.CAT;

var QFX = '[QuickEffectRack1_$DECK_ACTIVE$]';

function activeSlotButton(kind, which) {
    var themeMap  = (kind === 'deck') ? 'deck' : 'fx';
    var selProp   = (kind === 'deck')
        ? (which === 'A' ? 'selectedDeckA' : 'selectedDeckB')
        : (which === 'A' ? 'selectedFxA'   : 'selectedFxB');
    var activeState = (kind === 'deck') ? 'activeDeck' : 'activeFx';
    var func = (kind === 'deck') ? F.setActiveDeckTo : F.setActiveFxTo;
    return {
        func: func, args: [which],
        colorScheme: {
            scheme: function() {
                var ctrl = this._ctrl;
                if (!ctrl) return 'off';
                return CAT.themeScheme(themeMap, ctrl[selProp]);
            },
            on: { state: activeState, equals: which }
        }
    };
}

function topRowBase() {
    return {
        encoder0: { func: F.encPregainStep, args: [0.025], group: '$DECK_A$', inKey: 'pregain' },
        encoder1: { func: F.encQuickFxCycle, group: '[QuickEffectRack1_$DECK_A$]' },
        encoder2: { func: F.encQuickFxCycle, group: '[QuickEffectRack1_$DECK_B$]' },
        encoder3: { func: F.encPregainStep, args: [0.025], group: '$DECK_B$', inKey: 'pregain' },

        press0: activeSlotButton('deck', 'A'),
        press1: activeSlotButton('fx',   'A'),
        press2: activeSlotButton('fx',   'B'),
        press3: activeSlotButton('deck', 'B')
    };
}

function shiftBinding() {
    return {
        type: 'push',
        group: '$DECK_B$',
        outKey: 'track_loaded',
        colorScheme: { scheme: CAT.countdownScheme() }
    };
}

var TOP_SHARED = Object.assign(topRowBase(), {
    encoder1: { func: F.encQuickFxCycle, group: QFX },
    encoder2: null,

    knob0_0: B.eqKnob('$DECK_ACTIVE$', 'high'),
    button0_0: { group: '$DECK_ACTIVE$', inKey: 'pfl', outKey: 'pfl',
                 colorScheme: { knob: 'knob0_0', scheme: 'myCatnip' } },
    knob0_1: B.eqKnob('$DECK_ACTIVE$', 'mid'),
    button0_1: B.fxHeadphone('$FX_ACTIVE_N$',
                             { knob: 'knob0_1', scheme: 'myCatnip', markerColor: 'orange' }),
    knob0_2: B.eqKnob('$DECK_ACTIVE$', 'low'),
    button0_2: B.fxGroupEnable('$FX_ACTIVE_N$', '$DECK_ACTIVE$',
                               Object.assign({ knob: 'knob0_2' },
                                             CAT.fxSchemeFor('selectedFxCurrent'))),

    knob1_2: { group: QFX, inKey: 'super1' },
    button1_2: {
        group:  QFX,
        inKey:  'enabled',
        outKey: 'enabled',
        colorScheme: {
            knob:   'knob1_2',
            scheme: myCatnip.QFX_CHAIN_LIST[0],
            schemeFromState: {
                co:    'loaded_chain_preset',
                group: QFX,
                list:  myCatnip.QFX_CHAIN_LIST
            }
        }
    },

    fader0: { group: '$DECK_ACTIVE$', inKey: 'volume' },
    fader1: B.fxMix('$FX_ACTIVE_N$'),

    shift: shiftBinding()
});
TOP_SHARED._shift = 'topShift';

var TWO_DECK = Object.assign(topRowBase(), {
    shift: shiftBinding(),

    knob0_0: B.eqKnob('$DECK_A$', 'high'),
    knob0_1: B.eqKnob('$DECK_A$', 'mid'),
    knob0_2: B.eqKnob('$DECK_A$', 'low'),
    button0_0: { group: '$DECK_A$', inKey: 'pfl', outKey: 'pfl',
                 colorScheme: { knob: 'knob0_0', scheme: 'myCatnip' } },
    button0_1: B.fxHeadphone('$FX_A_N$', { knob: 'knob0_1', scheme: 'myCatnip', markerColor: 'orange' }),
    button0_2: B.fxGroupEnable('$FX_A_N$', '$DECK_A$',
                               Object.assign({ knob: 'knob0_2' },
                                             CAT.fxSchemeFor('selectedFxA'))),

    knob1_2: { group: '[QuickEffectRack1_$DECK_A$]', inKey: 'super1' },
    button1_2: {
        group:  '[QuickEffectRack1_$DECK_A$]',
        inKey:  'enabled',
        outKey: 'enabled',
        colorScheme: {
            knob:   'knob1_2',
            scheme: myCatnip.QFX_CHAIN_LIST[0],
            schemeFromState: {
                co:    'loaded_chain_preset',
                group: '[QuickEffectRack1_$DECK_A$]',
                list:  myCatnip.QFX_CHAIN_LIST
            }
        }
    },

    knob2_2: { group: '[QuickEffectRack1_$DECK_B$]', inKey: 'super1' },
    button2_2: {
        group:  '[QuickEffectRack1_$DECK_B$]',
        inKey:  'enabled',
        outKey: 'enabled',
        colorScheme: {
            knob:   'knob2_2',
            scheme: myCatnip.QFX_CHAIN_LIST[0],
            schemeFromState: {
                co:    'loaded_chain_preset',
                group: '[QuickEffectRack1_$DECK_B$]',
                list:  myCatnip.QFX_CHAIN_LIST
            }
        }
    },

    knob3_0: B.eqKnob('$DECK_B$', 'high'),
    knob3_1: B.eqKnob('$DECK_B$', 'mid'),
    knob3_2: B.eqKnob('$DECK_B$', 'low'),
    button3_0: { group: '$DECK_B$', inKey: 'pfl', outKey: 'pfl',
                 colorScheme: { knob: 'knob3_0', scheme: 'myCatnip' } },
    button3_1: B.fxHeadphone('$FX_B_N$', { knob: 'knob3_1', scheme: 'myCatnip', markerColor: 'orange' }),
    button3_2: B.fxGroupEnable('$FX_B_N$', '$DECK_B$',
                               Object.assign({ knob: 'knob3_2' },
                                             CAT.fxSchemeFor('selectedFxB'))),

    fader0: { group: '$DECK_A$', inKey: 'volume' },
    fader1: B.fxMix('$FX_A_N$'),
    fader2: B.fxMix('$FX_B_N$'),
    fader3: { group: '$DECK_B$', inKey: 'volume' }
});
TWO_DECK._shift = 'topShift';

var TWO_DECK_MINI = {
    patch: ['twoDeck']
};

var TOP_SHIFT = {
    encoder0: { func: F.encKeySync,  group: '$DECK_A$' },
    encoder1: { func: F.encKeyReset, group: '$DECK_A$' },
    encoder2: { func: F.encKeyReset, group: '$DECK_B$' },
    encoder3: { func: F.encKeySync,  group: '$DECK_B$' },

    press0: { group: '$DECK_A$', inKey: 'sync_enabled', outKey: 'sync_enabled',
              colorScheme: { scheme: 'syncOn' } },
    press1: { group: '$DECK_A$', inKey: 'keylock', outKey: 'keylock',
              colorScheme: { scheme: 'keylockOn' } },
    press2: { group: '$DECK_B$', inKey: 'keylock', outKey: 'keylock',
              colorScheme: { scheme: 'keylockOn' } },
    press3: { group: '$DECK_B$', inKey: 'sync_enabled', outKey: 'sync_enabled',
              colorScheme: { scheme: 'syncOn' } }
};

CAT.TOP_SHARED = TOP_SHARED;
CAT.TOP_SHIFT = TOP_SHIFT;
CAT.TWO_DECK = TWO_DECK;
CAT.TWO_DECK_MINI = TWO_DECK_MINI;

