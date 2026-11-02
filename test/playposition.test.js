'use strict';

var H = require('./helpers');

// _onPlayposition's 1500ms beat-edge guard is gated on
// st.loopActive. Outside a loop, the pulse phase tracks
// trackFrac < 0.5 every throttled tick. Inside a loop, the guard
// preserves beat_active's pulse writes so wrap doesn't flicker.

function setup(loopOn) {
    var c = H.bootCat();
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'track_loaded', 1);
    engine._set('[Channel1]', 'play_indicator', 1);
    engine._set('[Channel1]', 'loop_enabled', loopOn ? 1 : 0);
    engine._set('[Channel1]', 'playposition', 0.501167);

    // Force states after all CO observers have run.
    c._loadedState[1] = true;
    c._trackMetaCache[1] = undefined;
    var st = c._decks[1];
    st.playing = true;
    st.loopActive = loopOn;
    st.lastBeatEdge = Date.now() - 100;   // within 1500ms window
    st.active = true;
    st.lastPlayPos = 0.4;                 // forward motion
    st.lastPositionSync = 0;              // throttle passes
    return c;
}

// ── outside loop, guard behaviour ─────────────────────────────
//
// The 1500ms guard prevents double-writer flicker: it fires when
// beat_active has been heard from recently, and skips the
// _repaintFromPosition call so that st.active is written solely
// by _onBeatActive. Removing the guard reintroduces flicker,
// because the two writers disagree briefly at beat boundaries.

test('_onPlayposition: outside loop with recent beat edge, guard fires',
function(t) {
    var c = setup(false);
    // pos 0.501167 → beatF 300.7 → frac 0.7 → would set active false
    // if _repaintFromPosition ran. Guard fires, so active stays true
    // (beat_active's last write).
    c._onPlayposition(1);
    t.eq(c._decks[1].active, true,
        'guard fired, active unchanged (beat_active owns it)');
});

test('_onPlayposition: outside loop with stale beat edge, repaint runs',
function(t) {
    var c = setup(false);
    c._decks[1].lastBeatEdge = Date.now() - 2000;  // stale
    // pos 0.501167 → frac 0.7 → active false
    c._onPlayposition(1);
    t.eq(c._decks[1].active, false,
        'guard failed, repaint ran, active tracks trackFrac');
});

// ── inside loop: guard applies ────────────────────────────────

test('_onPlayposition: inside loop, guard preserves st.active',
function(t) {
    var c = setup(true);
    // pos 0.501167 → frac 0.7 would set active false, but guard
    // fires (loopActive + recent beat edge) and skips repaint.
    c._onPlayposition(1);
    t.eq(c._decks[1].active, true,
        'inside loop with recent beat_active, active unchanged');
});

// ── backward motion bypasses guard even inside loop ───────────

test('_onPlayposition: backward motion bypasses guard', function(t) {
    var c = setup(true);
    c._decks[1].lastPlayPos = 0.6;   // moving backward vs new 0.501167
    c._decks[1].lastPositionSync = 0;
    c._decks[1].active = true;

    c._onPlayposition(1);

    t.eq(c._decks[1].active, false,
        'backward → repaint → trackFrac 0.7 → active false');
});

// ── throttle still works ──────────────────────────────────────

test('_onPlayposition: throttle gate blocks rapid ticks', function(t) {
    var c = setup(false);
    // resetGlobals sets BEAT_REPAINT_THROTTLE_MS = 0 so most tests
    // skip the throttle. Enable it for this test only — resetGlobals
    // restores 0 for the next test.
    XoneK3.BEAT_REPAINT_THROTTLE_MS = 30;
    c._decks[1].lastPositionSync = Date.now();  // fresh throttle
    c._decks[1].active = true;

    c._onPlayposition(1);

    t.eq(c._decks[1].active, true, 'throttle gate skipped the body');
});

// ── count sync still runs inside the guard ────────────────────

test('_onPlayposition: inside loop, count still syncs', function(t) {
    var c = setup(true);
    // beatF 300.7 → count 301
    c._onPlayposition(1);
    t.eq(c._decks[1].count, 301,
        'count synced even though repaint skipped');
});