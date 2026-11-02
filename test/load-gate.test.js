'use strict';

var H = require('./helpers');

// The load gate: when track_loaded = 0, _trackMeta must return
// synthetic empty meta without reading any CO — otherwise a
// stale duration (Mixxx hasn't zeroed it yet) leaks into the
// track-end countdown. Source-tracing Mixxx 2.5 shows the
// runtime can't trust ordering; this test pins the defensive
// behaviour.
//
// The duration / file_bpm observer tests require beat clocks to
// be open. Binding a beat scheme keeps _needsBeatClocks() true,
// which is what stops _onTrackLoaded's internal _syncBeatClocks
// from closing the observers mid-test.

function setup() {
    var c = H.ctrl();
    XoneK3.PHRASE_MARKER_COLORS = [];
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'outro_end_position', 1000);
    engine._set('[Channel1]', 'track_loaded', 1);

    XoneK3.SCHEMES.lgBeat = { colors: [[127,0,0]], beat: { color: 'blue' } };
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: { scheme: 'lgBeat' }
    });
    c._syncBeatClocks();
    // _catchUpChannel stamped settle for all channels — clear it
    // so tests that want immediate cache writes can get them.
    for (var ch = 1; ch <= 4; ch++) c._loadSettlingAt[ch] = 0;
    return c;
}

test('load gate: track_loaded=0 → synthetic empty meta', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 0);
    // Even though duration is still 300 on the CO, the load gate
    // blocks the read.
    var meta = c._trackMeta(1);
    t.eq(meta.duration, 0);
    t.eq(meta.fileBpm,  null);
    t.eq(meta.samples,  0);
    t.eq(meta.outroEnd, 0);
});

test('load gate: track_loaded=0 bypasses stale duration', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 1);    // loaded
    c._loadSettlingAt[1] = 0;
    c._trackMeta(1);           // warms cache
    // Simulate unload: track_loaded = 0 lands first. duration
    // still 300 (Mixxx hasn't zeroed it yet — the ordering
    // problem).
    engine._set('[Channel1]', 'track_loaded', 0);
    c._onTrackLoaded(1, 0);
    var meta = c._trackMeta(1);
    t.eq(meta.duration, 0,
         'stale duration must not leak through the gate');
});

test('load gate: track_loaded=1 → metadata readable', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 1);
    c._loadSettlingAt[1] = 0;   // skip settle
    var meta = c._trackMeta(1);
    t.eq(meta.duration, 300);
    t.eq(meta.fileBpm,  120);
    t.eq(meta.samples,  1000);
});

test('settle window: reads live but does not cache', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 1);    // stamps settle = now
    // Read immediately — settle active, no cache write.
    var meta = c._trackMeta(1);
    t.eq(meta.duration, 300, 'reads live during settle');
    t.eq(c._trackMetaCache[1], undefined, 'no cache write during settle');
});

test('settle window: cache writes after META_SETTLE_MS', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 1);
    // Fast-forward settle by setting the stamp to the past.
    c._loadSettlingAt[1] = Date.now() - (XoneK3.META_SETTLE_MS + 100);
    c._trackMeta(1);
    t.ok(c._trackMetaCache[1] !== undefined, 'cache writes post-settle');
    t.eq(c._trackMetaCache[1].duration, 300);
});

test('duration observer: clears cache and refreshes', function(t) {
    var c = setup();
    c._onTrackLoaded(1, 1);
    c._loadSettlingAt[1] = 0;
    c._trackMeta(1);
    t.eq(c._trackMetaCache[1].duration, 300);

    // Duration changes mid-track (metadata edit / re-analysis).
    engine._set('[Channel1]', 'duration', 900);
    engine._trigger('[Channel1]', 'duration', 900);

    // Observer cleared cache and stamped settle — next read is
    // live, no cache write.
    t.eq(c._trackMeta(1).duration, 900);
    t.eq(c._trackMetaCache[1], undefined,
         'cache cleared by duration observer');
});

test('_catchUpChannel: seeds _loadedState from track_loaded CO', function(t) {
    var c = H.ctrl();
    XoneK3.PHRASE_MARKER_COLORS = [];
    engine._set('[Channel1]', 'track_loaded', 1);
    engine._set('[Channel2]', 'track_loaded', 0);
    c._catchUpChannel(1);
    c._catchUpChannel(2);
    t.eq(c._loadedState[1], true);
    t.eq(c._loadedState[2], false);
});