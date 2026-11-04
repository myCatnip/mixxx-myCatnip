// config/inpulse500-config.js
// Loop buttons are explicit type:'push'. Assistant and browser
// are handled by the funcs file. Deck select binds to setSelectedFor.

var F = myCatnip.FUNCS;
var MODES = myCatnip.HW_INPULSE500.IP500_MODE_NAMES;

var IP500_LOOP_FRACTIONS       = ["0.125","0.25","0.5","1","2","4","8","16"];
var IP500_LOOP_SHIFT_FRACTIONS = ["0.03125","0.0625","32","64","128","256","512","512"];
var IP500_JUMP_VALUES          = ["1","1","2","2","4","4","8","8"];
var IP500_JUMP_SHIFT_VALUES    = ["16","16","32","32","64","64","128","128"];

function deckBase(side) {
    var g = '$DECK_' + side + '$';
    var out = {};

    out['shift' + side] = { type: 'push' };

    out['play' + side] = {
        func: F.ip500Play, args: [side], group: g,
        outKey: 'play_indicator',
        colorScheme: { scheme: 'playOn' }
    };
    out['play' + side + '_shift'] = {
        func: F.ip500PlayShift, group: g, noLED: true
    };

    out['cue' + side] = {
        func: F.ip500Cue, group: g,
        outKey: 'cue_indicator',
        colorScheme: { scheme: 'cueOn' }
    };
    out['cue' + side + '_shift'] = {
        func: F.ip500CueShift, group: g, noLED: true
    };

    out['sync' + side] = {
        func: F.ip500Sync, group: g,
        outKey: 'sync_enabled',
        colorScheme: { scheme: 'syncOn' }
    };
    out['sync' + side + '_shift'] = {
        func: F.ip500SyncShift, group: g, noLED: true
    };

    out['pfl' + side] = {
        group: g, inKey: 'pfl', outKey: 'pfl',
        colorScheme: { scheme: 'pflOn' }
    };
    out['slip' + side] = {
        group: g, inKey: 'slip_enabled', outKey: 'slip_enabled',
        colorScheme: { scheme: 'slipOn' }
    };
    out['quant' + side] = {
        group: g, inKey: 'quantize', outKey: 'quantize',
        colorScheme: { scheme: 'quantOn' }
    };
    out['quant' + side + '_shift'] = {
        group: g, inKey: 'keylock', outKey: 'keylock',
        colorScheme: { scheme: 'quantOn' }
    };

    out['load' + side] = {
        func: F.ip500Load, group: g,
        outKey: 'track_loaded',
        colorScheme: { scheme: 'loadOn' }
    };
    out['load' + side + '_shift'] = {
        func: F.ip500LoadShift, group: g, noLED: true
    };

    out['vinyl' + side] = {
        func: F.ip500Vinyl, args: [side], group: g,
        colorScheme: {
            scheme: 'vinylOn',
            on: { state: '_ip500Vinyl' + side }
        }
    };
    out['vinyl' + side + '_shift'] = {
        func: F.ip500VinylShift, args: [side], group: g, noLED: true
    };

    // Momentary loop triggers — explicit type:'push'
    out['loopIn' + side] = {
        func: F.ip500LoopIn, group: g, outKey: 'loop_enabled',
        type: 'push',
        colorScheme: { scheme: 'loopOn' }
    };
    out['loopIn' + side + '_shift'] = {
        func: F.ip500LoopInShift, group: g, noLED: true, type: 'push'
    };
    out['loopOut' + side] = {
        func: F.ip500LoopOut, group: g, outKey: 'loop_enabled',
        type: 'push',
        colorScheme: { scheme: 'loopOn' }
    };
    out['loopOut' + side + '_shift'] = {
        func: F.ip500LoopOutShift, group: g, noLED: true, type: 'push'
    };
    out['loopPush' + side] = {
        func: F.ip500LoopPush, group: g, outKey: 'loop_enabled',
        type: 'push',
        colorScheme: { scheme: 'loopOn' }
    };
    out['loopPush' + side + '_shift'] = {
        func: F.ip500LoopPushShift, group: g, noLED: true, type: 'push'
    };

    out['volume' + side] = { group: g, inKey: 'volume' };
    out['filter' + side] = {
        func: F.ip500Filter,
        group: '[QuickEffectRack1_' + g + ']',
        inKey: 'super1'
    };
    out['eqLow' + side]  = { group: '[EqualizerRack1_' + g + '_Effect1]', inKey: 'parameter1' };
    out['eqMid' + side]  = { group: '[EqualizerRack1_' + g + '_Effect1]', inKey: 'parameter2' };
    out['eqHigh' + side] = { group: '[EqualizerRack1_' + g + '_Effect1]', inKey: 'parameter3' };
    out['gain' + side]   = { group: g, inKey: 'pregain' };
    out['pitch' + side]  = { group: g, inKey: 'rate' };
    out['loopEncoder' + side] = { func: F.ip500LoopEncoder, group: g };

    // Pad-mode selector buttons: no colorScheme — HW idx is -1.
    for (var i = 0; i < 8; i++) {
        out['padSelect' + side + (i + 1)] = {
            func: F.ip500SetPadMode, args: [side, MODES[i]]
        };
    }
    return out;
}

function padLayer(side, mode) {
    var g = '$DECK_' + side + '$';
    var out = {};
    for (var p = 1; p <= 8; p++) {
        var bindUn  = 'pad' + side + p + '_' + mode;
        var bindSh  = bindUn + '_shift';
        var def     = { group: g, type: 'push' };
        var defShift = { group: g, type: 'push' };

        switch (mode) {
            case 'hotcue':
                def.func = F.ip500PadHotcue; def.args = [p];
                def.outKey = 'hotcue_' + p + '_status';
                defShift.func = F.ip500PadHotcueShift; defShift.args = [p];
                defShift.outKey = 'hotcue_' + p + '_status';
                def.colorScheme = { scheme: 'hotcueColor',
                    on: { co: 'hotcue_' + p + '_status', group: g } };
                defShift.colorScheme = { scheme: 'deleteHotcue',
                    on: { co: 'hotcue_' + p + '_status', group: g } };
                break;
            case 'loop':
                def.func = F.ip500PadLoop;
                def.args = [IP500_LOOP_FRACTIONS[p - 1]];
                defShift.func = F.ip500PadLoop;
                defShift.args = [IP500_LOOP_SHIFT_FRACTIONS[p - 1]];
                def.colorScheme = { scheme: 'padLoop',
                    on: { co: 'beatloop_' + IP500_LOOP_FRACTIONS[p - 1] + '_enabled',
                          group: g } };
                defShift.colorScheme = { scheme: 'padLoop',
                    on: { co: 'beatloop_' + IP500_LOOP_SHIFT_FRACTIONS[p - 1] + '_enabled',
                          group: g } };
                break;
            case 'slicer':
                def.func = F.ip500PadSlicer; def.args = [p - 1];
                defShift.func = F.ip500PadSlicer; defShift.args = [p - 1];
                def.noLED = true; defShift.noLED = true;
                break;
            case 'sampler':
                def.func = F.ip500PadSampler; def.args = [p];
                defShift.func = F.ip500PadSamplerShift; defShift.args = [p];
                var sgrp = '[Sampler' + p + ']';
                def.colorScheme = { scheme: 'padSampler',
                    on: { co: 'play', group: sgrp } };
                defShift.noLED = true;
                break;
            case 'pitch':
                var pitchFuncs = [
                    F.ip500PadPitchDownTone, F.ip500PadPitchDownSemi,
                    F.ip500PadPitchUpSemi, F.ip500PadPitchUpTone,
                    F.ip500PitchRangeReset, F.ip500PitchRangeDown,
                    F.ip500PitchRangeUp, F.ip500PadNoop
                ];
                def.func = pitchFuncs[p - 1] || F.ip500PadNoop;
                defShift.func = F.ip500PadNoopShift;
                def.noLED = true; defShift.noLED = true;
                break;
            case 'roll':
                def.func = F.ip500PadRoll;
                def.args = [IP500_LOOP_FRACTIONS[p - 1]];
                defShift.func = F.ip500PadRoll;
                defShift.args = [IP500_LOOP_SHIFT_FRACTIONS[p - 1]];
                def.noLED = true; defShift.noLED = true;
                break;
            case 'effect':
                // Effect pad 1/2/3 toggles the corresponding effect's
                // enabled CO; the LED tracks that CO (white on, yellow
                // off — matching the community script). Pads 4..8 are
                // stateless actions, no LED in the original either.
                //
                // effectUnit is derived from side, mirroring
                // F.ip500PadEffect's group→unit check: A→1 (ch1|3),
                // B→2 (ch2|4). Diverges only if a user manually maps
                // deck A to ch2 — same divergence F.ip500PadEffect has.
                var effectUnit = (side === 'A') ? 1 : 2;
                var effectMap = [
                    { func: F.ip500PadEffect, args: [1], effectIndex: 1 },
                    { func: F.ip500PadEffect, args: [2], effectIndex: 2 },
                    { func: F.ip500PadEffect, args: [3], effectIndex: 3 },
                    { func: F.ip500PadFXRoute, args: [1] },
                    { func: F.ip500PadQFXCycle, args: [-1] },
                    { func: F.ip500PadQFXCycle, args: [1] },
                    { func: F.ip500PadQFXEnable },
                    { func: F.ip500PadFXRoute, args: [2] }
                ];
                var un = effectMap[p - 1];
                def.func = un.func;
                if (un.args !== undefined) def.args = un.args;
                if (un.effectIndex) {
                    def.colorScheme = {
                        scheme: {
                            colors: ['white, 127'],
                            offScheme: ['yellow']
                        },
                        on: {
                            co: 'enabled',
                            group: '[EffectRack1_EffectUnit' + effectUnit +
                                   '_Effect' + un.effectIndex + ']'
                        }
                    };
                    // Shift+effect pad 1-3 cycles effect_selector on the
                    // bound effect. Pads 4-8 have no shift action (noop).
                    defShift.func = F.ip500PadEffectShift;
                    defShift.args = [un.effectIndex];
                } else {
                    def.noLED = true;
                    defShift.func = F.ip500PadNoopShift;
                }
                defShift.noLED = true;
                break;
            case 'beatjump':
                def.func = F.ip500PadBeatjump;
                var mv = (p % 2 === 0) ? '_forward' : '_backward';
                def.args = ['beatjump_' + IP500_JUMP_VALUES[p - 1] + mv];
                defShift.func = F.ip500PadBeatjump;
                defShift.args = ['beatjump_' + IP500_JUMP_SHIFT_VALUES[p - 1] + mv];
                def.noLED = true; defShift.noLED = true;
                break;
        }

        out[bindUn] = def;
        out[bindSh] = defShift;
    }
    return out;
}

myCatnip.IP500_LAYERS = {
    master: {
        browserPush:   { func: F.ip500BrowserPush, noLED: true },
        browserKnob:   { func: F.ip500BrowserTurn, noLED: true },
        assistant:     { func: F.ip500Assistant, noLED: true },
        crossfader:    { func: F.ip500Crossfader, noLED: true },
        fxSel1:        { func: F.ip500DeckSel, args: ['A', 1],
                         colorScheme: { scheme: 'fxSelOn',
                             on: { state: 'selectedDeckA', equals: 1 } } },
        fxSel2:        { func: F.ip500DeckSel, args: ['B', 2],
                         colorScheme: { scheme: 'fxSelOn',
                             on: { state: 'selectedDeckB', equals: 2 } } },
        fxSel3:        { func: F.ip500DeckSel, args: ['A', 3],
                         colorScheme: { scheme: 'fxSelOn',
                             on: { state: 'selectedDeckA', equals: 3 } } },
        fxSel4:        { func: F.ip500DeckSel, args: ['B', 4],
                         colorScheme: { scheme: 'fxSelOn',
                             on: { state: 'selectedDeckB', equals: 4 } } },
        xfaderEnable:  { func: F.ip500XfaderEnable, noLED: true },
        xfaderCurve:   { func: F.ip500XfaderCurve, noLED: true }
    },
    deckABase: deckBase('A'),
    deckBBase: deckBase('B'),
    deckA_hotcue:   Object.assign({ patch: ['deckABase'] }, padLayer('A', 'hotcue')),
    deckA_loop:     Object.assign({ patch: ['deckABase'] }, padLayer('A', 'loop')),
    deckA_slicer:   Object.assign({ patch: ['deckABase'] }, padLayer('A', 'slicer')),
    deckA_sampler:  Object.assign({ patch: ['deckABase'] }, padLayer('A', 'sampler')),
    deckA_pitch:    Object.assign({ patch: ['deckABase'] }, padLayer('A', 'pitch')),
    deckA_roll:     Object.assign({ patch: ['deckABase'] }, padLayer('A', 'roll')),
    deckA_effect:   Object.assign({ patch: ['deckABase'] }, padLayer('A', 'effect')),
    deckA_beatjump: Object.assign({ patch: ['deckABase'] }, padLayer('A', 'beatjump')),
    deckB_hotcue:   Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'hotcue')),
    deckB_loop:     Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'loop')),
    deckB_slicer:   Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'slicer')),
    deckB_sampler:  Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'sampler')),
    deckB_pitch:    Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'pitch')),
    deckB_roll:     Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'roll')),
    deckB_effect:   Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'effect')),
    deckB_beatjump: Object.assign({ patch: ['deckBBase'] }, padLayer('B', 'beatjump'))
};