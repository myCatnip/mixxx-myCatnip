'use strict';

var H = require('./helpers');

// _resolveDeckRef, _deckStateFor, _isBeatOffPhase.

// ── _resolveDeckRef ──────────────────────────────────────────

test('_resolveDeckRef: number passes through', function(t) {
    var c = H.ctrl();
    t.eq(c._resolveDeckRef(1), 1);
    t.eq(c._resolveDeckRef(4), 4);
});

test('_resolveDeckRef: out-of-range number → null', function(t) {
    var c = H.ctrl();
    t.eq(c._resolveDeckRef(0), null);
    t.eq(c._resolveDeckRef(5), null);
});

test('_resolveDeckRef: undefined/null uses default (active deck)', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 3);
    c.setActiveDeck('A');
    t.eq(c._resolveDeckRef(undefined), 3);
    t.eq(c._resolveDeckRef(null),      3);
});

test('_resolveDeckRef: $DECK_ACTIVE$ follows activeDeck', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 2);
    c.setSelectedFor('deck', 'B', 4);
    c.setActiveDeck('A');
    t.eq(c._resolveDeckRef('$DECK_ACTIVE$'), 2);
    c.setActiveDeck('B');
    t.eq(c._resolveDeckRef('$DECK_ACTIVE$'), 4);
});

test('_resolveDeckRef: $DECK_ALT$', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 2);
    c.setSelectedFor('deck', 'B', 4);
    c.setActiveDeck('A');
    t.eq(c._resolveDeckRef('$DECK_ALT$'), 4);
});

test('_resolveDeckRef: non-token string → null', function(t) {
    var c = H.ctrl();
    t.eq(c._resolveDeckRef('nonsense'), null);
    t.eq(c._resolveDeckRef('[Master]'), null);
});

// ── _deckStateFor ────────────────────────────────────────────

test('_deckStateFor: numeric deck returns that deck state', function(t) {
    var c = H.ctrl();
    t.eq(c._deckStateFor({beat: {deck: 2}}), c._decks[2]);
});

test('_deckStateFor: token follows activeDeck', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 1);
    c.setSelectedFor('deck', 'B', 3);
    c.setActiveDeck('A');
    t.eq(c._deckStateFor({beat: {deck: '$DECK_ACTIVE$'}}), c._decks[1]);
    c.setActiveDeck('B');
    t.eq(c._deckStateFor({beat: {deck: '$DECK_ACTIVE$'}}), c._decks[3]);
});

test('_deckStateFor: no beat → null', function(t) {
    var c = H.ctrl();
    t.eq(c._deckStateFor({}),   null);
    t.eq(c._deckStateFor(null), null);
});

// ── _isBeatOffPhase ──────────────────────────────────────────

test('_isBeatOffPhase: no beat → false', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    t.eq(b._isBeatOffPhase({}), false);
});

test('_isBeatOffPhase: no hasBeat → false', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false);
});

test('_isBeatOffPhase: active beat → false', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = true;
    c._decks[2].active  = true;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false);
});

test('_isBeatOffPhase: between beats → true', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = true;
    c._decks[2].active  = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), true);
});

test('_isBeatOffPhase: token deck re-resolves on focus change', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c.setSelectedFor('deck', 'A', 1);
    c.setSelectedFor('deck', 'B', 3);
    c.setActiveDeck('A');

    c._decks[1].hasBeat = true;  c._decks[1].playing = true;
    c._decks[1].active = false;
    c._decks[3].hasBeat = false; c._decks[3].active = false;

    var scheme = {beat: {deck: '$DECK_ACTIVE$'}};
    t.eq(b._isBeatOffPhase(scheme), true);

    c.setActiveDeck('B');
    t.eq(b._isBeatOffPhase(scheme), false);

    c._decks[3].hasBeat = true;
    c._decks[3].playing = true;
    t.eq(b._isBeatOffPhase(scheme), true);
});

test('_isBeatOffPhase: playing + pulse → position-derived', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = true;
    c._decks[2].active  = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), true);
    c._decks[2].active = true;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false);
});

test('_isBeatOffPhase: playing + solid → always on-phase', function(t) {
    var orig = XoneK3.BEAT_PLAYING_MODE;
    XoneK3.BEAT_PLAYING_MODE = 'solid';
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = true;
    c._decks[2].active  = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false);
    XoneK3.BEAT_PLAYING_MODE = orig;
});

test('_isBeatOffPhase: playing + off → always off-phase', function(t) {
    var orig = XoneK3.BEAT_PLAYING_MODE;
    XoneK3.BEAT_PLAYING_MODE = 'off';
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = true;
    c._decks[2].active  = true;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), true);
    XoneK3.BEAT_PLAYING_MODE = orig;
});

test('_isBeatOffPhase: paused + solid → on-phase', function(t) {
    var orig = XoneK3.BEAT_PAUSED_MODE;
    XoneK3.BEAT_PAUSED_MODE = 'solid';
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = false;
    c._decks[2].active  = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false);
    XoneK3.BEAT_PAUSED_MODE = orig;
});

test('_isBeatOffPhase: paused + pulse → position-derived', function(t) {
    var orig = XoneK3.BEAT_PAUSED_MODE;
    XoneK3.BEAT_PAUSED_MODE = 'pulse';
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = false;
    c._decks[2].active  = false;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), true, 'second half → off-phase');
    c._decks[2].active = true;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), false, 'first half → on-phase');
    XoneK3.BEAT_PAUSED_MODE = orig;
});

test('_isBeatOffPhase: paused + off → always off-phase', function(t) {
    var orig = XoneK3.BEAT_PAUSED_MODE;
    XoneK3.BEAT_PAUSED_MODE = 'off';
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[2].hasBeat = true;
    c._decks[2].playing = false;
    c._decks[2].active  = true;
    t.eq(b._isBeatOffPhase({beat: {deck: 2}}), true);
    XoneK3.BEAT_PAUSED_MODE = orig;
});

test('countdownScheme: paused with track loaded shows beat colour', function(t) {
    H.bootCat();
    H.setCO('[Channel1]', 'duration',            240);
    H.setCO('[Channel1]', 'file_bpm',            128);
    H.setCO('[Channel1]', 'track_samples',       1000000);
    H.setCO('[Channel1]', 'outro_end_position',  1000000);
    H.setCO('[Channel1]', 'playposition',        0.05);
    H.setCO('[Channel1]', 'play_indicator',      0);
    H.setCO('[Channel1]', 'track_loaded',        1);

    // track_loaded must set hasBeat on its own — no jog needed.
    H.fireCO('[Channel1]', 'track_loaded', 1);

    var c = XoneK3.controllers[0];
    t.eq(c._decks[1].hasBeat, true,
         'track_loaded must set hasBeat without a playposition tick');

    H.clearLeds(c);
    c.bindings['layer']._refresh();
    var frame = H.led(c, 'layer');
    t.ok(frame && frame.r + frame.g + frame.b > 0,
         'layer LED should show beat colour while paused');
});

// ── _beatStateFor ────────────────────────────────────────────

test('_beatStateFor: null without hasBeat', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    t.eq(b._beatStateFor({beat: {deck: 1}}), null);
});

test('_beatStateFor: returns deck state when hasBeat', function(t) {
    var c = H.ctrl();
    var b = c.bindings.press0;
    c._decks[1].hasBeat = true;
    t.eq(b._beatStateFor({beat: {deck: 1}}), c._decks[1]);
});

test('pausing at off-phase with solid mode lights the LED', function(t) {
    H.bootCat();
    H.setCO('[Channel1]', 'duration',            240);
    H.setCO('[Channel1]', 'file_bpm',            128);
    H.setCO('[Channel1]', 'track_samples',       1000000);
    H.setCO('[Channel1]', 'outro_end_position',  1000000);
    H.setCO('[Channel1]', 'playposition',        0.6015);   // off-phase beat
    H.setCO('[Channel1]', 'track_loaded',        1);
    H.fireCO('[Channel1]', 'track_loaded', 1);

    var c = XoneK3.controllers[0];

    // Playing, off-phase: pulse mode → off-ramp, base colour black.
    H.setCO('[Channel1]', 'play_indicator', 1);
    H.fireCO('[Channel1]', 'play_indicator', 1);
    c._decks[1].active = false;
    H.clearLeds(c);
    c.bindings['layer']._refresh();
    var playingFrame = H.led(c, 'layer');
    t.ok(!playingFrame || playingFrame.r + playingFrame.g + playingFrame.b === 0,
         'playing pulse at off-phase is off-ramp');

    // Pause. Falling edge must repaint; solid paused mode flips
    // to on-ramp + cascade.
    H.clearLeds(c);
    H.setCO('[Channel1]', 'play_indicator', 0);
    H.fireCO('[Channel1]', 'play_indicator', 0);

    var pausedFrame = H.led(c, 'layer');
    t.ok(pausedFrame && pausedFrame.r + pausedFrame.g + pausedFrame.b > 0,
         'pausing at off-phase with solid mode must light the LED');
});

test('_openBeatClocks re-reads play_indicator', function(t) {
    XoneK3.PHRASE_MARKER_COLORS = [];
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: {colors: [[127,0,0]], beat: {color: 'blue'}}}
    });
    c._refreshAllLeds();

    // Simulate reload-during-playback: deck is playing, but the
    // handler never fired because the CO tree pre-dates re-open.
    H.setCO('[Channel1]', 'play_indicator', 1);
    c._closeBeatClocks();               // freshDeckState → playing=false
    c._openBeatClocks();                // must read play_indicator
    t.eq(c._decks[1].playing, true,
         '_openBeatClocks must sync st.playing from the CO');
});

test('_onPlayIndicator: refreshes beat LEDs on every transition', function(t) {
    XoneK3.PHRASE_MARKER_COLORS = [];
    H.bootCat();
    var c = XoneK3.controllers[0];

    // Bind a beat LED on channel 1 with a real outKey.
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: { scheme: { colors: [[127,0,0]], beat: { color: 'green' } } }
    });
    H.setCO('[Channel1]', 'duration',            240);
    H.setCO('[Channel1]', 'file_bpm',            128);
    H.setCO('[Channel1]', 'track_samples',       1000000);
    H.setCO('[Channel1]', 'outro_end_position',  1000000);
    H.setCO('[Channel1]', 'playposition',        0.5);
    H.setCO('[Channel1]', 'pfl',                 1);
    H.fireCO('[Channel1]', 'track_loaded', 1);

    // Force the "was playing" precondition without going through
    // the play handler — this test asserts the *transition*, not
    // how st.playing got there. Firing play_indicator: 1 would
    // also work, but would leave an extra _refreshBeatLeds call
    // between the setup and the counter, adding noise to the
    // assertion.
    c._decks[1].playing = true;

    // Count _refreshBeatLeds calls during the pause transition.
    var calls = 0;
    var orig = c._refreshBeatLeds;
    c._refreshBeatLeds = function(ch) { calls++; return orig.call(this, ch); };

    H.setCO('[Channel1]', 'play_indicator', 0);
    H.fireCO('[Channel1]', 'play_indicator', 0);

    t.ok(calls >= 1, '_refreshBeatLeds must fire on pause transition');
});

// ── _refreshBeatLeds: fn scheme vs base scheme ──────────────
//
// The gate must follow the scheme that _evaluateScheme() actually
// returns (fn output when _csSchemeFn is set, else base), not the
// base scheme's beat block. A binding with both a base scheme
// (beat on deck A) and a fn scheme (beat on deck B) must gate on
// deck B, not A.

test('_refreshBeatLeds: gates on fn scheme\'s beat deck, not base\'s', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;
    c._loadedState[2] = true;
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel2]', 'duration', 300);
    engine._set('[Channel2]', 'file_bpm', 120);
    engine._set('[Channel2]', 'track_samples', 1000);

    // Base scheme beat on deck 1; fn returns beat on deck 2
    var fnBeat2 = { colors: [[0,127,0]], beat: { deck: 2, color: 'blue' } };
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {
            scheme: { colors: [[127,0,0]], beat: { deck: 1, color: 'green' } },
            schemeFromState: { state: 'activeDeck', map: { A: fnBeat2, B: fnBeat2 } }
        }
    });

    var count = 0;
    var orig = c.bindings.button0_0._refresh.bind(c.bindings.button0_0);
    c.bindings.button0_0._refresh = function() { count++; return orig(); };

    c._refreshBeatLeds(2);
    var afterCh2 = count;
    c._refreshBeatLeds(1);
    var afterCh1 = count;

    t.ok(afterCh2 > 0, 'ch2 (fn beat deck) refreshes');
    t.eq(afterCh1, afterCh2, 'ch1 (base beat deck) does not refresh');
});