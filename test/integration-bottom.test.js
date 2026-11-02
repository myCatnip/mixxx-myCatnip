'use strict';

var H = require('./helpers');

// Cue / loop layers, their overlays, hotcues, loops, beatjumps,
// layer cycle, phrase origin.

function setupCue() {
    return H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
}
function setupLoop() {
    return H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop']});
}

// ── hotcues ────────────────────────────────────────────────

test('hotcue 1 fires hotcue_1_activate', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'hotcue_1_activate', 0);
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_1_activate'), 1);
});

test('hotcue release sends 0', function(t) {
    var c = setupCue();
    H.press(c, 'grid0_2');
    H.release(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_1_activate'), 0);
});

test('hotcue 8 on grid3_3', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'hotcue_8_activate', 0);
    H.press(c, 'grid3_3');
    t.eq(engine.getValue('[Channel1]', 'hotcue_8_activate'), 1);
});

test('shift+hotcue clears', function(t) {
    var c = setupCue();
    H.press(c, 'shift');
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_1_clear'), 1);
});

// ── play / cue ─────────────────────────────────────────────

test('play button toggles play', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'play', 0);
    H.press(c, 'grid3_1');
    t.eq(engine.getValue('[Channel1]', 'play'), 1);
});

test('cue button presses cue_default', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'cue_default', 0);
    H.press(c, 'grid3_0');
    t.eq(engine.getValue('[Channel1]', 'cue_default'), 1);
});

// ── slip ───────────────────────────────────────────────────

test('slip toggle flips slip_enabled', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'slip_enabled', 0);
    H.press(c, 'grid2_1');
    t.eq(engine.getValue('[Channel1]', 'slip_enabled'), 1);
});

// ── beatjump ───────────────────────────────────────────────

test('grid0_0 fires beatjump_1_backward pulse', function(t) {
    var c = setupCue();
    H.press(c, 'grid0_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 1);
    engine._fireOneShots();
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_backward'), 0);
});

test('grid1_0 fires beatjump_1_forward pulse', function(t) {
    var c = setupCue();
    H.press(c, 'grid1_0');
    t.eq(engine.getValue('[Channel1]', 'beatjump_1_forward'), 1);
});

test('grid0_1 fires beatjump_16_backward', function(t) {
    var c = setupCue();
    H.press(c, 'grid0_1');
    t.eq(engine.getValue('[Channel1]', 'beatjump_16_backward'), 1);
});

// ── loop sizes ─────────────────────────────────────────────

test('loop grid2_2 writes beatloop_size 2', function(t) {
    var c = setupLoop();
    H.press(c, 'grid2_2');
    t.eq(engine.getValue('[Channel1]', 'beatloop_size'), 2);
});

test('loop grid3_3 writes beatloop_size 1/2', function(t) {
    var c = setupLoop();
    H.press(c, 'grid3_3');
    t.eq(engine.getValue('[Channel1]', 'beatloop_size'), 0.5);
});

// ── layer cycle ────────────────────────────────────────────

test('layer press cycles cue → loop', function(t) {
    var c = setupCue();
    H.press(c, 'layer');
    t.ok(c.activePatches.indexOf('loop') !== -1);
    t.notOk(c.activePatches.indexOf('cue') !== -1);
});

test('layer press cycles loop → cue', function(t) {
    var c = setupLoop();
    H.press(c, 'layer');
    t.ok(c.activePatches.indexOf('cue') !== -1);
    t.notOk(c.activePatches.indexOf('loop') !== -1);
});

// ── hotcue2 overlay (cue mode, chord + slip) ───────────────

function enterChord(c) {
    H.press(c, 'shift');
    H.press(c, 'layer');
}
function exitChord(c) {
    H.release(c, 'layer');
    H.release(c, 'shift');
}

test('hotcue2: chord + slip in cue activates it', function(t) {
    var c = setupCue();
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.contains(c.activePatches, 'hotcue2');
    t.ok(c._patchActive('hotcue2'));
});

test('hotcue2: chord + slip again removes it', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.notOk(c.activePatches.indexOf('hotcue2') !== -1);
});

test('hotcue2: does not toggle loopOdd', function(t) {
    var c = setupCue();
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.notOk(c.activePatches.indexOf('loopOdd') !== -1);
});

test('hotcue2: grid0_2 targets hotcue 9', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'hotcue_9_activate', 0);
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_activate'), 1);
});

test('hotcue2: shift clears hotcue 9', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    H.press(c, 'shift');
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_9_clear'), 1);
});

// ── hotcue2 row 3: intro/outro markers ─────────────────────

// Row 3 uses direct CO binding — same shape as hotcue_*_activate
// and hotcue_*_clear. Mixxx's _activate does jump-if-set /
// set-if-unset; the mock can only verify the trigger CO fires.

test('hotcue2: press grid0_3 fires intro_start_activate', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_start_activate', 0);
    H.press(c, 'grid0_3');
    t.eq(engine.getValue('[Channel1]', 'intro_start_activate'), 1);
});

test('hotcue2: release grid0_3 clears intro_start_activate', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    H.press(c, 'grid0_3');
    H.release(c, 'grid0_3');
    t.eq(engine.getValue('[Channel1]', 'intro_start_activate'), 0);
});

test('hotcue2: press grid1_3 fires intro_end_activate', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_end_activate', 0);
    H.press(c, 'grid1_3');
    t.eq(engine.getValue('[Channel1]', 'intro_end_activate'), 1);
});

test('hotcue2: press grid2_3 fires outro_start_activate', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'outro_start_activate', 0);
    H.press(c, 'grid2_3');
    t.eq(engine.getValue('[Channel1]', 'outro_start_activate'), 1);
});

test('hotcue2: press grid3_3 fires outro_end_activate', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'outro_end_activate', 0);
    H.press(c, 'grid3_3');
    t.eq(engine.getValue('[Channel1]', 'outro_end_activate'), 1);
});

test('hotcue2: shift+grid0_3 fires intro_start_clear', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_start_clear', 0);
    H.press(c, 'shift');
    H.press(c, 'grid0_3');
    t.eq(engine.getValue('[Channel1]', 'intro_start_clear'), 1);
});

test('hotcue2: shift+grid1_3 fires intro_end_clear', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_end_clear', 0);
    H.press(c, 'shift');
    H.press(c, 'grid1_3');
    t.eq(engine.getValue('[Channel1]', 'intro_end_clear'), 1);
});

test('hotcue2: shift+grid2_3 fires outro_start_clear', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'outro_start_clear', 0);
    H.press(c, 'shift');
    H.press(c, 'grid2_3');
    t.eq(engine.getValue('[Channel1]', 'outro_start_clear'), 1);
});

test('hotcue2: shift+grid3_3 fires outro_end_clear', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'outro_end_clear', 0);
    H.press(c, 'shift');
    H.press(c, 'grid3_3');
    t.eq(engine.getValue('[Channel1]', 'outro_end_clear'), 1);
});

test('hotcue2: row-3 LED follows _enabled (on)', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_start_enabled', 1);
    H.clearLeds(c);
    c.bindings['grid0_3']._refresh();
    t.rgb(H.led(c, 'grid0_3'), 0, 127, 0);
});

test('hotcue2: row-3 LED follows _enabled (off)', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    engine._set('[Channel1]', 'intro_start_enabled', 0);
    H.clearLeds(c);
    c.bindings['grid0_3']._refresh();
    // v1.0.11: unset markers dim-render their own colour at
    // brightnessOff = 12 (DEFAULT_RGB_BRIGHTNESS_OFF) so the
    // button stays locatable. Was fully dark (hw = 0) before.
    // intro_start's marker colour is green, so the dim state is
    // dim green — rgb unchanged, only hw reduced.
    t.rgb(H.led(c, 'grid0_3'), 0, 127, 0);
    t.hw(H.led(c, 'grid0_3'), 12);
});

test('hotcue2: hidden in loop, reappears in cue', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue', 'hotcue2']});
    t.ok(c._patchActive('hotcue2'));
    H.press(c, 'layer');   // cue → loop
    H.release(c, 'layer');
    t.notOk(c._patchActive('hotcue2'));
    t.contains(c.activePatches, 'hotcue2');
    H.press(c, 'layer');   // loop → cue
    H.release(c, 'layer');
    t.ok(c._patchActive('hotcue2'));
});

// ── loopOdd overlay (loop mode, chord + slip) ──────────────

test('loopOdd: chord + slip in loop activates it', function(t) {
    var c = setupLoop();
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.contains(c.activePatches, 'loopOdd');
    t.ok(c._patchActive('loopOdd'));
});

test('loopOdd: chord + slip again removes it', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.notOk(c.activePatches.indexOf('loopOdd') !== -1);
});

test('loopOdd: does not toggle hotcue916', function(t) {
    var c = setupLoop();
    enterChord(c);
    H.press(c, 'grid2_1');
    exitChord(c);
    t.notOk(c.activePatches.indexOf('hotcue916') !== -1);
});

test('loopOdd: grid0_2 writes beatloop_size 7', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'beatloop_size'), 7);
});

test('loopOdd: grid3_3 writes beatloop_size 1/2', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    H.press(c, 'grid3_3');
    t.eq(engine.getValue('[Channel1]', 'beatloop_size'), 0.5);
});

test('loopOdd: shift+grid0_2 writes odd beatjump_size', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    H.press(c, 'shift');
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'beatjump_size'), 7);
});

test('loopOdd: beatjump direction stays functional', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    H.press(c, 'grid0_1');
    t.eq(engine.getValue('[Channel1]', 'beatjump_backward'), 1);
});

test('loopOdd: hidden in cue, reappears in loop', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'loop', 'loopOdd']});
    t.ok(c._patchActive('loopOdd'));
    H.press(c, 'layer');   // loop → cue
    H.release(c, 'layer');
    t.notOk(c._patchActive('loopOdd'));
    t.contains(c.activePatches, 'loopOdd');
    H.press(c, 'layer');   // cue → loop
    H.release(c, 'layer');
    t.ok(c._patchActive('loopOdd'));
});

// ── overlays coexist ───────────────────────────────────────

// ── overlays coexist across layer switches ─────────────────

test('hotcue2 and loopOdd both persist; only host-active is visible', function(t) {
    var c = setupCue();

    // Add hotcue2 in cue mode.
    enterChord(c);
    H.press(c, 'grid2_1');
    H.release(c, 'grid2_1');
    exitChord(c);
    t.contains(c.activePatches, 'hotcue2');
    t.ok(c._patchActive('hotcue2'));

    // Switch to loop, add loopOdd. hotcue2 stays in activePatches
    // but its host ('cue') is gone.
    H.press(c, 'layer');
    H.release(c, 'layer');
    enterChord(c);
    H.press(c, 'grid2_1');
    H.release(c, 'grid2_1');
    exitChord(c);

    t.contains(c.activePatches, 'hotcue2');
    t.contains(c.activePatches, 'loopOdd');
    t.notOk(c._patchActive('hotcue2'));
    t.ok(c._patchActive('loopOdd'));

    // Back to cue. hotcue2 visible again, loopOdd hidden.
    H.press(c, 'layer');
    t.ok(c._patchActive('hotcue2'));
    t.notOk(c._patchActive('loopOdd'));
});

// ── reloop / beatloop activate via encoder presses ─────────

test('pressL reloop resets anchor and pulses', function(t) {
    var c = setupLoop();
    engine._set('[Channel1]', 'loop_anchor', 1);
    H.press(c, 'pressL');
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 0);
    t.eq(engine.getValue('[Channel1]', 'reloop_toggle'), 1);
});

test('pressR beatloop activate resets anchor', function(t) {
    var c = setupLoop();
    engine._set('[Channel1]', 'loop_anchor', 1);
    H.press(c, 'pressR');
    t.eq(engine.getValue('[Channel1]', 'loop_anchor'), 0);
    t.eq(engine.getValue('[Channel1]', 'beatloop_activate'), 1);
});

// ── display cycle from LOOP layer ──────────────────────────

test('grid2_0 on LOOP cycles display source', function(t) {
    var c = setupLoop();
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'playposition', 0.5);

    c._startVirtualClock(1);
    c._decks[1].displaySource = 'track';

    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'loop');
});

// ── display cycle from CUE layer ───────────────────────────

test('CUE grid2_0 cycles display source when loop clock running', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'playposition', 0.5);

    c._startVirtualClock(1);
    c._decks[1].displaySource = 'track';

    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'loop');
});

test('CUE grid2_0 no-op when loop clock stopped', function(t) {
    var c = setupCue();
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);

    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'track');
});

// ── playlist nav ───────────────────────────────────────────

test('encoderR navigates playlist', function(t) {
    var c = setupCue();
    H.send(c, 'encoderR', 1);
    t.eq(engine.getValue('[Playlist]', 'SelectNextTrack'), 1);
});

// ── track load shortcut ───────────────────────────────────

test('pressR arms loadArm modifier', function(t) {
    var c = setupCue();
    H.press(c, 'pressR');
    t.eq(c.modifiers.loadArm, true);
    H.release(c, 'pressR');
    t.eq(c.modifiers.loadArm, false);
});

test('pressR + deck select loads track', function(t) {
    var c = H.bootCat({
        initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']
    });
    H.press(c, 'pressR');
    H.press(c, 'press0');
    t.eq(engine.getValue('[Channel1]', 'LoadSelectedTrack'), 1);
});