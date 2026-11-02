'use strict';

var H = require('./helpers');

// Every remaining func. Rate-gated funcs are tested with
// `rate: false` or on their first event — see rate-gate.test.js
// for the gate itself. Tests that assert on `_lastLoopChangeMs`
// need an active loop on the channel (the gate bypasses
// out-of-loop bindings entirely).

// ── k3Select / k3SelectActive ──────────────────────────────

test('k3Select: sets selectedDeckA', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['deck', 'A', 3]
    });
    H.press(c, 'press0');
    t.eq(c.selectedDeckA, 3);
});

test('k3Select: sets selectedFxA', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['fx', 'A', 2]
    });
    H.press(c, 'press0');
    t.eq(c.selectedFxA, 2);
});

test('k3Select: with modifiers.loadArm loads track', function(t) {
    var c = H.ctrl();
    c.modifiers.loadArm = true;
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['deck', 'A', 3]
    });
    H.press(c, 'press0');
    t.eq(engine.getValue('[Channel3]', 'LoadSelectedTrack'), 1);
});

test('k3Select: NaN arg is ignored', function(t) {
    var c = H.ctrl();
    c.selectedDeckA = 2;
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['deck', 'A']
    });
    H.press(c, 'press0');
    t.eq(c.selectedDeckA, 2);
});

test('k3SelectActive: uses activeFx slot', function(t) {
    var c = H.ctrl();
    c.activeFx = 'B';
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3SelectActive, args: ['fx', 3]
    });
    H.press(c, 'press0');
    t.eq(c.selectedFxB, 3);
});

test('k3SelectActive: with modifiers.loadArm loads track', function(t) {
    var c = H.ctrl();
    c.modifiers.loadArm = true;
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3SelectActive, args: ['deck', 2]
    });
    H.press(c, 'press0');
    t.eq(engine.getValue('[Channel2]', 'LoadSelectedTrack'), 1);
});

// ── setActiveFxTo / toggleActiveFx / toggleActiveDeck ──────

test('setActiveFxTo: A', function(t) {
    var c = H.ctrl();
    c.activeFx = 'B';
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.setActiveFxTo, args: ['A']
    });
    H.press(c, 'press0');
    t.eq(c.activeFx, 'A');
});

test('setActiveFxTo: B', function(t) {
    var c = H.ctrl();
    c.activeFx = 'A';
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.setActiveFxTo, args: ['B']
    });
    H.press(c, 'press0');
    t.eq(c.activeFx, 'B');
});

test('toggleActiveFx: flips A ↔ B', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {func: XoneK3.FUNCS.toggleActiveFx});
    H.press(c, 'press0');
    t.eq(c.activeFx, 'B');
    H.release(c, 'press0');
    H.press(c, 'press0');
    t.eq(c.activeFx, 'A');
});

test('toggleActiveDeck: flips A ↔ B', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {func: XoneK3.FUNCS.toggleActiveDeck});
    H.press(c, 'press0');
    t.eq(c.activeDeck, 'B');
});

// ── loadSelectedTrack ──────────────────────────────────────

test('pressR: arms loadArm modifier while held', function(t) {
    var c = H.ctrl({
        modifierStates: { loadArm: { heldBy: ['pressR'] } },
        patches: { base: { pressR: { type: 'push' } } },
        initialPatches: ['base']
    });
    c._recompute();
    H.press(c, 'pressR');
    t.eq(c.modifiers.loadArm, true);
    H.release(c, 'pressR');
    t.eq(c.modifiers.loadArm, false);
});

// ── encPregainStep ─────────────────────────────────────────

test('encPregainStep: CW adds step', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'pregain', 0.5);
    c._applyBinding('encoder0', {
        func: XoneK3.FUNCS.encPregainStep, args: [0.1],
        group: '[Channel1]', inKey: 'pregain'
    });
    H.send(c, 'encoder0', 1);
    t.approx(engine.getValue('[Channel1]', 'pregain'), 0.6, 1e-9);
});

test('encPregainStep: CCW subtracts', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'pregain', 0.5);
    c._applyBinding('encoder0', {
        func: XoneK3.FUNCS.encPregainStep, args: [0.1],
        group: '[Channel1]', inKey: 'pregain'
    });
    H.send(c, 'encoder0', 127);
    t.approx(engine.getValue('[Channel1]', 'pregain'), 0.4, 1e-9);
});

// ── encQuickFxCycle ────────────────────────────────────────

test('encQuickFxCycle: CW advances loaded_chain_preset', function(t) {
    var c = H.ctrl();
    engine._set('[QuickEffectRack1_[Channel1]]', 'loaded_chain_preset', 0);
    c._applyBinding('encoder1', {
        func: XoneK3.FUNCS.encQuickFxCycle,
        group: '[QuickEffectRack1_[Channel1]]'
    });
    H.send(c, 'encoder1', 1);
    t.eq(engine.getValue('[QuickEffectRack1_[Channel1]]', 'loaded_chain_preset'), 1);
});

test('encQuickFxCycle: CCW decrements and wraps at index 0', function(t) {
    var c = H.ctrl();
    engine._set('[QuickEffectRack1_[Channel1]]', 'loaded_chain_preset', 0);
    c._applyBinding('encoder1', {
        func: XoneK3.FUNCS.encQuickFxCycle,
        group: '[QuickEffectRack1_[Channel1]]'
    });
    H.send(c, 'encoder1', 127);
    t.eq(engine.getValue('[QuickEffectRack1_[Channel1]]', 'loaded_chain_preset'),
         XoneK3.QFX_CHAIN_LIST.length - 1);
});

// ── encKeyShift ────────────────────────────────────────────

test('encKeyShift: CW +1 semitone', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'pitch_adjust', 0);
    c._applyBinding('encoder3', {
        func: XoneK3.FUNCS.encKeyShift, group: '[Channel1]'
    });
    H.send(c, 'encoder3', 1);
    t.eq(engine.getValue('[Channel1]', 'pitch_adjust'), 1);
});

test('encKeyShift: CCW -1', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'pitch_adjust', 0);
    c._applyBinding('encoder3', {
        func: XoneK3.FUNCS.encKeyShift, group: '[Channel1]'
    });
    H.send(c, 'encoder3', 127);
    t.eq(engine.getValue('[Channel1]', 'pitch_adjust'), -1);
});

// ── encKeySyncReset ────────────────────────────────────────

test('encKeySyncReset: CW fires sync_key', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoder2', {
        func: XoneK3.FUNCS.encKeySyncReset, group: '[Channel1]'
    });
    H.send(c, 'encoder2', 1);
    t.eq(engine.getValue('[Channel1]', 'sync_key'), 1);
});

test('encKeySyncReset: CCW fires reset_key', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoder2', {
        func: XoneK3.FUNCS.encKeySyncReset, group: '[Channel1]'
    });
    H.send(c, 'encoder2', 127);
    t.eq(engine.getValue('[Channel1]', 'reset_key'), 1);
});

// ── encStepParam ───────────────────────────────────────────

test('encStepParam: CW adds step to parameter', function(t) {
    var c = H.ctrl();
    engine.setParameter('[Master]', 'gain', 0.5);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encStepParam, args: ['[Master]', 'gain', 0.05]
    });
    H.send(c, 'encoderL', 1);
    t.approx(engine.getParameter('[Master]', 'gain'), 0.55, 1e-9);
});

test('encStepParam: clamps to [0,1]', function(t) {
    var c = H.ctrl();
    engine.setParameter('[Master]', 'gain', 0.98);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encStepParam, args: ['[Master]', 'gain', 0.05]
    });
    H.send(c, 'encoderL', 1);
    t.eq(engine.getParameter('[Master]', 'gain'), 1);
});

test('encStepParam: missing args no-op', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderL', {func: XoneK3.FUNCS.encStepParam, args: []});
    H.send(c, 'encoderL', 1);
});

// ── encPlaylistNav ─────────────────────────────────────────

test('encPlaylistNav: CW selects next', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderR', {func: XoneK3.FUNCS.encPlaylistNav});
    H.send(c, 'encoderR', 1);
    t.eq(engine.getValue('[Playlist]', 'SelectNextTrack'), 1);
});

test('encPlaylistNav: CCW selects prev', function(t) {
    var c = H.ctrl();
    c._applyBinding('encoderR', {func: XoneK3.FUNCS.encPlaylistNav});
    H.send(c, 'encoderR', 127);
    t.eq(engine.getValue('[Playlist]', 'SelectPrevTrack'), 1);
});

// ── encLoopMove ────────────────────────────────────────────

test('encLoopMove: writes loop_anchor 1 for in', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_anchor', 0);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encLoopMove, args: ['in', 0.01],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    H.send(c, 'encoderL', 1);
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 1);
});

test('encLoopMove: writes loop_anchor 0 for out', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_anchor', 1);
    c._applyBinding('encoderR', {
        func: XoneK3.FUNCS.encLoopMove, args: ['out', 0.01],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    H.send(c, 'encoderR', 1);
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 0);
});

// ── encBeatjump ────────────────────────────────────────────
//
// v1.0.14: encoder beatjump is loop-only. Outside a loop the
// encoder does nothing — no beatjump, no pulse timer. Inside a
// loop, _beatjumpAllowed's 130ms cap prevents drops. The grid
// beatjump buttons (beatjumpButton) stay usable outside a loop
// and are tested separately.

test('encBeatjump: CW → beatjump_forward pulse (in loop)', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    H.send(c, 'encoderL', 1);
    t.eq(engine.getValue('[Channel1]', 'beatjump_forward'), 1);
    engine._fireOneShots();
    t.eq(engine.getValue('[Channel1]', 'beatjump_forward'), 0);
});

test('encBeatjump: CCW → beatjump_backward pulse (in loop)', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    H.send(c, 'encoderL', 127);
    t.eq(engine.getValue('[Channel1]', 'beatjump_backward'), 1);
});

test('encBeatjump: no-op outside a loop (CW)', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    H.send(c, 'encoderL', 1);
    t.eq(engine.getValue('[Channel1]', 'beatjump_forward'), 0,
        'no beatjump outside a loop');
});

test('encBeatjump: no-op outside a loop (CCW)', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBeatjump, group: '[Channel1]'
    });
    H.send(c, 'encoderL', 127);
    t.eq(engine.getValue('[Channel1]', 'beatjump_backward'), 0,
        'no beatjump outside a loop');
});

// ── encBeatjumpStepScale ───────────────────────────────────

test('encBeatjumpStepScale: CW doubles', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'beatjump_size', 1);
    c._applyBinding('encoderR', {
        func: XoneK3.FUNCS.encBeatjumpStepScale, args: ['1/32', 16],
        group: '[Channel1]'
    });
    H.send(c, 'encoderR', 1);
    t.eq(engine.getValue('[Channel1]', 'beatjump_size_double'), 1);
});

test('encBeatjumpStepScale: CCW halves', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'beatjump_size', 1);
    c._applyBinding('encoderR', {
        func: XoneK3.FUNCS.encBeatjumpStepScale, args: ['1/32', 16],
        group: '[Channel1]'
    });
    H.send(c, 'encoderR', 127);
    t.eq(engine.getValue('[Channel1]', 'beatjump_size_halve'), 1);
});

// ── encBpmOrHeadMix / bpmPress ─────────────────────────────

function pairCtrl() {
    return H.ctrl({
        modifierStates: {
            shift: { heldBy: ['shift'] },
            bpmPressHeld: { heldBy: ['pressL'] }
        },
        patches: { base: {
            shift: { type: 'push' },
            pressL: { type: 'push', func: XoneK3.FUNCS.bpmPress }
        } },
        initialPatches: ['base']
    });
}

test('encBpmOrHeadMix: unheld → BPM step', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'bpm', 120);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBpmOrHeadMix, args: [0.1, 0.05],
        group: '[Channel1]', inKey: 'bpm'
    });
    H.send(c, 'encoderL', 1);
    t.approx(engine.getValue('[Channel1]', 'bpm'), 120.1, 1e-9);
});

test('encBpmOrHeadMix: held → headMix step, sets turn flag', function(t) {
    var c = H.ctrl();
    c.modifiers.bpmPressHeld = true;
    c._bpmHeldTurned = false;
    engine._set('[Master]', 'headMix', 0.5);
    c._applyBinding('encoderL', {
        func: XoneK3.FUNCS.encBpmOrHeadMix, args: [0.1, 0.05],
        group: '[Channel1]', inKey: 'bpm'
    });
    H.send(c, 'encoderL', 1);
    t.approx(engine.getValue('[Master]', 'headMix'), 0.55, 1e-9);
    t.eq(c._bpmHeldTurned, true);
});

test('bpmPress: press clears turn flag', function(t) {
    var c = pairCtrl();
    c._recompute();
    c._bpmHeldTurned = true;
    H.press(c, 'pressL');
    t.eq(c._bpmHeldTurned, false);
});

test('bpmPress: shift+release without turn toggles headSplit', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'shift');
    H.press(c, 'pressL');
    H.release(c, 'pressL');
    t.eq(engine.getValue('[Master]', 'headSplit'), 1);
});

test('bpmPress: release without shift does not toggle', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'pressL');
    H.release(c, 'pressL');
    t.eq(engine.getValue('[Master]', 'headSplit'), 0);
});

test('bpmPress: shift+turn+release does not toggle', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'shift');
    H.press(c, 'pressL');
    c._bpmHeldTurned = true;
    H.release(c, 'pressL');
    t.eq(engine.getValue('[Master]', 'headSplit'), 0);
});

test('bpmPress: orphaned release skips toggle', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'shift');
    H.press(c, 'pressL');
    // Rebind pressL mid-hold — orphans the transaction
    c._applyBinding('pressL', { type: 'push', func: function() {} });
    H.release(c, 'pressL');
    t.eq(engine.getValue('[Master]', 'headSplit'), 0);
});

test('bpmPress: stray note-off (no press) does nothing', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'shift');
    H.release(c, 'pressL');   // release without press
    t.eq(engine.getValue('[Master]', 'headSplit'), 0);
});

test('bpmPress: shift released before pressL → no toggle', function(t) {
    var c = pairCtrl();
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);
    H.press(c, 'shift');
    H.press(c, 'pressL');
    H.release(c, 'shift');
    H.release(c, 'pressL');
    t.eq(engine.getValue('[Master]', 'headSplit'), 0);
});

// ── pressSetValue ──────────────────────────────────────────

test('pressSetValue: writes value', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.pressSetValue, args: ['1/4'],
        group: '[Channel1]', inKey: 'beatloop_size'
    });
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'beatloop_size'), 0.25);
});

// ── beatjumpButton ─────────────────────────────────────────

test('beatjumpButton: pulses the given CO', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_0', {
        func: XoneK3.FUNCS.beatjumpButton, args: ['beatjump_1_backward'],
        group: '[Channel1]'
    });
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
    engine._fireOneShots();
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 0);
});

// ── reloopToggleResetAnchor ────────────────────────────────

test('reloopToggleResetAnchor: anchor 0 + reloop pulse', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_anchor', 1);
    c._applyBinding('pressL', {
        func: XoneK3.FUNCS.reloopToggleResetAnchor, group: '[Channel1]'
    });
    H.press(c, 'pressL');
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 0);
    t.eq(engine.getValue('[Channel1]', 'reloop_toggle'), 1);
});

// ── beatloopActivateResetAnchor ────────────────────────────

test('beatloopActivateResetAnchor: anchor 0 + activate pulse', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_anchor', 1);
    c._applyBinding('pressR', {
        func: XoneK3.FUNCS.beatloopActivateResetAnchor, group: '[Channel1]'
    });
    H.press(c, 'pressR');
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 0);
    t.eq(engine.getValue('[Channel1]', 'beatloop_activate'), 1);
});

// ── hotcueSetPhraseColor ────────────────────────────────────

test('hotcueSetPhraseColor: creates hotcue with first phrase color', function(t) {
    var orig = XoneK3.PHRASE_MARKER_COLORS;
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08, 0x0044FF];
    var c = H.ctrl();
    engine._set('[Channel1]', 'hotcue_9_status', 0);
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.hotcueSetPhraseColor, args: [9],
        group: '[Channel1]', inKey: 'hotcue_9_activate'
    });
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_activate'), 1);
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_color'), 0xC50A08);
    XoneK3.PHRASE_MARKER_COLORS = orig;
});

test('hotcueSetPhraseColor: leaves existing hotcue color alone', function(t) {
    var orig = XoneK3.PHRASE_MARKER_COLORS;
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    var c = H.ctrl();
    engine._set('[Channel1]', 'hotcue_9_status', 1);
    engine._set('[Channel1]', 'hotcue_9_color', 0xFF8000);
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.hotcueSetPhraseColor, args: [9],
        group: '[Channel1]', inKey: 'hotcue_9_activate'
    });
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_color'), 0xFF8000);
    XoneK3.PHRASE_MARKER_COLORS = orig;
});

test('hotcueSetPhraseColor: no color write when marker list empty', function(t) {
    var orig = XoneK3.PHRASE_MARKER_COLORS;
    XoneK3.PHRASE_MARKER_COLORS = [];
    var c = H.ctrl();
    engine._set('[Channel1]', 'hotcue_9_status', 0);
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.hotcueSetPhraseColor, args: [9],
        group: '[Channel1]', inKey: 'hotcue_9_activate'
    });
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_color'), 0);
    XoneK3.PHRASE_MARKER_COLORS = orig;
});

test('hotcueSetPhraseColor: release writes 0', function(t) {
    var c = H.ctrl();
    c._applyBinding('grid0_2', {
        func: XoneK3.FUNCS.hotcueSetPhraseColor, args: [9],
        group: '[Channel1]', inKey: 'hotcue_9_activate'
    });
    H.release(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_activate'), 0);
});

// ── toggleLayerOverlay ──────────────────────────────────────

test('toggleLayerOverlay: cue layer toggles args[0]', function(t) {
    var c = H.ctrl({patches: {
        cue: {}, loop: {},
        ovCue: {_host: 'cue'}, ovLoop: {_host: 'loop'}
    }});
    c.activePatches = ['cue'];
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.toggleLayerOverlay, args: ['ovCue', 'ovLoop']
    });
    H.press(c, 'press0');
    t.contains(c.activePatches, 'ovCue');
    t.notOk(c.activePatches.indexOf('ovLoop') !== -1);
});

test('toggleLayerOverlay: loop layer toggles args[1]', function(t) {
    var c = H.ctrl({patches: {
        cue: {}, loop: {},
        ovCue: {_host: 'cue'}, ovLoop: {_host: 'loop'}
    }});
    c.activePatches = ['loop'];
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.toggleLayerOverlay, args: ['ovCue', 'ovLoop']
    });
    H.press(c, 'press0');
    t.contains(c.activePatches, 'ovLoop');
    t.notOk(c.activePatches.indexOf('ovCue') !== -1);
});

test('toggleLayerOverlay: second press toggles off', function(t) {
    var c = H.ctrl({patches: {
        cue: {}, ovCue: {_host: 'cue'}
    }});
    c.activePatches = ['cue', 'ovCue'];
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.toggleLayerOverlay, args: ['ovCue', null]
    });
    H.press(c, 'press0');
    t.notOk(c.activePatches.indexOf('ovCue') !== -1);
});

test('toggleLayerOverlay: no-op outside cue / loop', function(t) {
    var c = H.ctrl({patches: {
        cue: {}, ovCue: {_host: 'cue'}
    }});
    c.activePatches = [];
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.toggleLayerOverlay, args: ['ovCue', null]
    });
    H.press(c, 'press0');
    t.notOk(c.activePatches.indexOf('ovCue') !== -1);
});

test('toggleLayerOverlay: release event no-op', function(t) {
    var c = H.ctrl({patches: {
        cue: {}, ovCue: {_host: 'cue'}
    }});
    c.activePatches = ['cue'];
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.toggleLayerOverlay, args: ['ovCue', null]
    });
    H.release(c, 'press0');
    t.notOk(c.activePatches.indexOf('ovCue') !== -1);
});

// ── bounce guard ───────────────────────────────────────────────

test('bounce: v>0 during active transaction does not reset bpmHeldTurned',
function(t) {
    var c = H.ctrl({
        modifierStates: {
            shift: { heldBy: ['shift'] },
            bpmPressHeld: { heldBy: ['pressL'] }
        },
        patches: { base: {
            shift: { type: 'push' },
            pressL: { type: 'push', func: XoneK3.FUNCS.bpmPress }
        } },
        initialPatches: ['base']
    });
    c._recompute();
    engine._set('[Master]', 'headSplit', 0);

    H.press(c, 'shift');
    H.press(c, 'pressL');            // captured, _bpmHeldTurned=false
    c._bpmHeldTurned = true;          // simulate encoder turn
    H.press(c, 'pressL');            // bounce — must NOT reset flag
    H.release(c, 'pressL');           // real release

    t.eq(engine.getValue('[Master]', 'headSplit'), 0,
        'turn survived bounce → no headSplit toggle');
});

test('bounce: v>0 during active transaction does not restart shutdown timer',
function(t) {
    var c = H.ctrl();
    c._applyBinding('press3', { type: 'push', func: XoneK3.FUNCS.shutdownHold });
    H.press(c, 'press3');
    var first = c.bindings.press3._shutdownHoldTimer;
    t.ok(first, 'timer armed on first press');

    H.press(c, 'press3');            // bounce
    t.eq(c.bindings.press3._shutdownHoldTimer, first,
        'bounce did not restart the timer');

    H.release(c, 'press3');           // cleanup
});

test('bounce: release still fires captured func', function(t) {
    var c = H.ctrl();
    var log = [];
    c._applyBinding('press0', {
        type: 'push',
        func: function(args, ch, cc, v) { log.push(v); }
    });
    H.press(c, 'press0');            // log: [127]
    H.press(c, 'press0');            // bounce — no log
    H.release(c, 'press0');           // log: [127, 0]
    t.eq(log, [127, 0], 'bounce skipped, real press + release logged');
});

// ── toggle-mode bounce guard ─────────────────────────────────

test('bounce: toggle-mode does not double-flip on bounce', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'play', 0);
    c._applyBinding('grid3_1', {
        group: '[Channel1]', inKey: 'play', outKey: 'play_indicator'
    });

    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1, 'first press toggles');

    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1, 'bounce does not toggle');
});

test('bounce: toggle-mode release-then-press toggles correctly', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'play', 0);
    c._applyBinding('grid3_1', {
        group: '[Channel1]', inKey: 'play', outKey: 'play_indicator'
    });

    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1);
    H.release(c, 'grid3_1');
    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 0,
        'real second press toggles back');
});

// Closes the toggle → push → toggle rebind case: the flag must
// be cleared on release regardless of the binding's *current*
// mode, or a mid-hold rebind to push leaves _togglePressActive
// stuck true and the next toggle press is swallowed.
test('bounce: toggle→push→release→toggle does not swallow next press', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'play', 0);
    c._applyBinding('grid3_1', {
        group: '[Channel1]', inKey: 'play', outKey: 'play_indicator'
    });

    // Press as toggle: flag set, CO toggled 0→1.
    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1);
    t.eq(c.bindings.grid3_1._togglePressActive, true, 'flag set by toggle press');

    // Rebind to push mid-hold.
    c._applyBinding('grid3_1', {
        group: '[Channel1]', inKey: 'play', outKey: 'play_indicator',
        type: 'push'
    });

    // Release: push-mode _defaultInput writes 0; flag must clear.
    H.release(c, 'grid3_1');
    t.eq(c.bindings.grid3_1._togglePressActive, false,
        'flag cleared on release despite push mode');

    // Rebind back to toggle.
    c._applyBinding('grid3_1', {
        group: '[Channel1]', inKey: 'play', outKey: 'play_indicator'
    });

    // Press: must toggle normally (0→1), not be swallowed.
    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1,
        'press after rebind cycle toggles normally');
});

// ── _loadSelectedOntoChannel range guard ────────────────────

test('k3Select: load-arm + out-of-range channel does not write', function(t) {
    var c = H.ctrl();
    c.modifiers.loadArm = true;
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['deck', 'A', 5]
    });
    H.press(c, 'press0');
    t.eq(engine.getValue('[Channel5]', 'LoadSelectedTrack'), 0);
    t.eq(engine.getValue('[Channel1]', 'LoadSelectedTrack'), 0);
});

test('k3Select: load-arm + valid channel loads track', function(t) {
    var c = H.ctrl();
    c.modifiers.loadArm = true;
    c._applyBinding('press0', {
        func: XoneK3.FUNCS.k3Select, args: ['deck', 'A', 2]
    });
    H.press(c, 'press0');
    t.eq(engine.getValue('[Channel2]', 'LoadSelectedTrack'), 1);
});

// ── encQuickFxCycle empty list ──────────────────────────────

test('encQuickFxCycle: empty list does not write NaN', function(t) {
    var orig = XoneK3.QFX_CHAIN_LIST;
    XoneK3.QFX_CHAIN_LIST = [];
    var c = H.ctrl();
    c._applyBinding('encoder1', {
        func: XoneK3.FUNCS.encQuickFxCycle,
        group: '[QuickEffectRack1_[Channel1]]'
    });
    H.send(c, 'encoder1', 1);
    var v = engine.getValue('[QuickEffectRack1_[Channel1]]', 'loaded_chain_preset');
    t.ok(!isNaN(v), 'must not write NaN, got ' + v);
    XoneK3.QFX_CHAIN_LIST = orig;
});