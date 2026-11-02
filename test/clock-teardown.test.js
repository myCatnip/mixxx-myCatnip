'use strict';

var H = require('./helpers');

// _closeBeatClocks tears down per-channel timeline state, but
// must leave _phraseOrigin alone — it's derived from the current
// playhead and marker hotcues, and the playhead hasn't moved, so
// the next tick would produce the same value anyway.

test('_closeBeatClocks: preserves _phraseOrigin, resets deck state', function(t) {
    var c = H.ctrl();

    // Clear the shipped marker list so the hotcue observer block
    // is skipped — otherwise _openBeatClocks wires 32 extra
    // playConns per channel.
    XoneK3.PHRASE_MARKER_COLORS = [];

    c._openBeatClocks();
    t.eq(c._beatConns.length, 4,  'one beat_active per channel');
    // 11 base connections per channel: playposition,
    // play_indicator, track_loaded, loop_enabled, slip_enabled,
    // track_samples, rate_ratio, reverse, outro_end_position,
    // duration, file_bpm. Hotcue marker observers add 32 per
    // channel when PHRASE_MARKER_COLORS is non-empty; the test
    // clears it.
    t.eq(c._playConns.length, 44, 'eleven base connections per channel');

    // Set derived state.
    c._phraseOrigin[1] = 42;
    c._phraseOrigin[2] = 17;
    c._decks[1].count   = 99;
    c._decks[1].hasBeat = true;

    c._closeBeatClocks();

    t.eq(c._beatConns.length, 0);
    t.eq(c._playConns.length, 0);

    t.eq(c._phraseOrigin[1], 42, 'phrase origin 1 must survive teardown');
    t.eq(c._phraseOrigin[2], 17, 'phrase origin 2 must survive teardown');

    t.eq(c._decks[1].count,   1,     'count must reset to fresh default');
    t.eq(c._decks[1].hasBeat, false, 'hasBeat must reset to fresh default');
});