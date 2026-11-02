'use strict';

var H = require('./helpers');

// countdownScheme: layer button pulses with deck A's track-end
// countdown. The layer binding is group '$DECK_A$' → [Channel1]
// in Cat. The scheme has colors:[[0,0,0]] plus a beat block, so
// the LED is only non-black when the beat cascade fires.

test('countdownScheme: layer LED is non-black when deck playing on beat', function(t) {
    var c = H.bootCat();

    // Populate the COs _beatF needs. Layer follows [Channel1].
    H.setCO('[Channel1]', 'duration',             240);
    H.setCO('[Channel1]', 'file_bpm',             128);
    H.setCO('[Channel1]', 'track_samples',        1000000);
    H.setCO('[Channel1]', 'intro_start_position', 0);
    H.setCO('[Channel1]', 'outro_end_position',   1000000);
    H.setCO('[Channel1]', 'playposition',         0.05);
    H.setCO('[Channel1]', 'play_indicator',       1);

    // Fire a beat edge. Sets hasBeat + active on the deck state,
    // then repaints every beat LED on channel 1 — layer included.
    H.fireCO('[Channel1]', 'beat_active', 1);

    // Read the last frame written for the layer LED's index.
    var frame = H.led(c, 'layer');
    t.ok(frame, 'layer LED should have sent a frame');
    t.ok(frame.r + frame.g + frame.b + frame.hw > 0,
         'layer LED should be non-black when deck playing on beat (got r=' +
         frame.r + ' g=' + frame.g + ' b=' + frame.b + ' hw=' + frame.hw + ')');
});

test('countdownScheme: layer LED is black when deck not playing', function(t) {
    var c = H.bootCat();

    // Same track state, but play_indicator stays 0.
    H.setCO('[Channel1]', 'duration',             240);
    H.setCO('[Channel1]', 'file_bpm',             128);
    H.setCO('[Channel1]', 'track_samples',        1000000);
    H.setCO('[Channel1]', 'intro_start_position', 0);
    H.setCO('[Channel1]', 'outro_end_position',   1000000);
    H.setCO('[Channel1]', 'playposition',         0.05);

    H.clearLeds(c);
    c.bindings['layer']._refresh();

    var frame = H.led(c, 'layer');
    if (frame) {
        // countdownIdle's colour is [0,0,0], so rgb is 0 on both
        // the on- and off-ramps. hw differs (127 vs 16) but is
        // irrelevant when the colour itself is black.
        t.eq(frame.r + frame.g + frame.b, 0,
             'layer LED should be black when play_indicator is 0');
    }
});