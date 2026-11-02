'use strict';

var H = require('./helpers');

// Two timelines per channel: track and the loop clock.
// Phrase origin shared. Display source. Beat count.

function setupTrack(c, ch, opts) {
    opts = opts || {};
    engine._set('[Channel' + ch + ']', 'duration',           opts.duration || 300);
    engine._set('[Channel' + ch + ']', 'file_bpm',           opts.fileBpm  || 120);
    engine._set('[Channel' + ch + ']', 'track_samples',      opts.samples   || 1000);
    engine._set('[Channel' + ch + ']', 'intro_start_position', 0);
    engine._set('[Channel' + ch + ']', 'outro_end_position', opts.samples || 1000);
    engine._set('[Channel' + ch + ']', 'playposition',       opts.pos       || 0.5);
    // Simulate a loaded, settled track. The runtime gates
    // _trackMeta on _loadedState and refuses to cache inside
    // _loadSettlingAt + META_SETTLE_MS. Tests bypass the real
    // load flow; seed both directly.
    c._loadedState[ch] = true;
    c._loadSettlingAt[ch] = 0;
}

// ── _channelOf ──────────────────────────────────────────────

test('_channelOf: standard group', function(t) {
    var c = H.ctrl();
    t.eq(c._channelOf('[Channel1]'), 1);
    t.eq(c._channelOf('[Channel4]'), 4);
});

test('_channelOf: out-of-range → null', function(t) {
    var c = H.ctrl();
    t.eq(c._channelOf('[Channel0]'), null);
    t.eq(c._channelOf('[Channel5]'), null);
});

test('_channelOf: non-channel → null', function(t) {
    var c = H.ctrl();
    t.eq(c._channelOf('[Master]'),     null);
    t.eq(c._channelOf('not a string'), null);
    t.eq(c._channelOf(42),             null);
});

// ── _getContentBounds ───────────────────────────────────────

test('_getContentBounds: start always 0, end from outro', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;   // loaded, samples below
    engine._set('[Channel1]', 'track_samples', 1000);
    // intro_start_position is deliberately set here — the code
    // must ignore it. Beat 0 is always file start.
    engine._set('[Channel1]', 'intro_start_position', 200);
    engine._set('[Channel1]', 'outro_end_position',   800);
    var b = c._getContentBounds(1);
    t.eq(b.start, 0);
    t.approx(b.end, 0.8, 1e-9);
});

test('_getContentBounds: no samples → null', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;   // loaded, but samples = 0
    engine._set('[Channel1]', 'track_samples', 0);
    t.eq(c._getContentBounds(1), null);
});

test('_getContentBounds: zero markers → 0..1', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'outro_end_position', 0);
    var b = c._getContentBounds(1);
    t.eq(b.start, 0);
    t.eq(b.end,   1);
});

test('_getContentBounds: intro ignored, outro clamps', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;
    engine._set('[Channel1]', 'track_samples', 1000);
    // Intro is set above outro — previously this hit the
    // "endN <= startN" fallback. Now start is hard-coded to 0,
    // so the fallback never triggers and end simply reflects
    // outro_end_position / samples.
    engine._set('[Channel1]', 'intro_start_position', 900);
    engine._set('[Channel1]', 'outro_end_position',   100);
    var b = c._getContentBounds(1);
    t.eq(b.start, 0);
    t.approx(b.end, 0.1, 1e-9);
});

// ── _readFileBpm / _trackMeta ───────────────────────────────

test('_readFileBpm: reads file_bpm directly', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'file_bpm', 128);
    t.eq(c._readFileBpm(1), 128);
});

test('_readFileBpm: falls back to bpm/rate_ratio at unity', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'file_bpm', 0);
    engine._set('[Channel1]', 'bpm', 120);
    engine._set('[Channel1]', 'rate_ratio', 1);
    t.eq(c._readFileBpm(1), 120);
});

test('_readFileBpm: slider fallback scales by 1+rate', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'file_bpm', 0);
    engine._set('[Channel1]', 'bpm', 129.6);
    engine._set('[Channel1]', 'rate_ratio', 0);   // force slider fallback
    engine._set('[Channel1]', 'rate', 0.08);      // +8% pitch
    // file_bpm = bpm / (1 + rate) = 129.6 / 1.08 = 120
    t.approx(c._readFileBpm(1), 120, 1e-9);
});

test('_readFileBpm: no bpm → null', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'file_bpm', 0);
    engine._set('[Channel1]', 'bpm', 0);
    t.eq(c._readFileBpm(1), null);
});

test('_trackMeta: caches per channel', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;
    engine._set('[Channel1]', 'duration', 100);
    engine._set('[Channel1]', 'file_bpm', 120);
    var m1 = c._trackMeta(1);
    engine._set('[Channel1]', 'duration', 999);
    var m2 = c._trackMeta(1);
    t.eq(m1, m2);
    t.eq(m2.duration, 100);
});

test('_trackMeta: cache clear picks up new values', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;
    engine._set('[Channel1]', 'duration', 100);
    engine._set('[Channel1]', 'file_bpm', 120);
    c._trackMeta(1);
    engine._set('[Channel1]', 'duration', 200);
    c._trackMetaCache[1] = undefined;
    t.eq(c._trackMeta(1).duration, 200);
});

// ── _beatF ─────────────────────────────────────────────────

test('_beatF: 0.5 into a 300s 120bpm track = 300 beats', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    t.approx(c._beatF(1, 0.5), 300, 1e-6);
});

test('_beatF: zero position → 0', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    t.approx(c._beatF(1, 0), 0, 1e-6);
});

test('_beatF: no duration → null', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;   // loaded, but duration = 0
    engine._set('[Channel1]', 'track_samples', 1000);
    t.eq(c._beatF(1, 0.5), null);
});

test('_beatF: no file_bpm → null', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;   // loaded, but file_bpm = 0
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'track_samples', 1000);
    t.eq(c._beatF(1, 0.5), null);
});

test('_beatF: non-number pos → null', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    t.eq(c._beatF(1, 'x'), null);
    t.eq(c._beatF(1, NaN), null);
});

test('_beatF: negative pos returns negative beat (no pos<0 guard)', function(t) {
    // INTERNALS §25: _beatF has no pos<0 guard. A position before
    // file start returns a negative fractional beat;
    // _cascadeCount floors it and beatLevel normalises via modulo,
    // so the cascade shows the previous phrase's colours rather
    // than freezing the pipeline at pos <= 0.
    var c = H.ctrl();
    setupTrack(c, 1);   // duration 300s, 120bpm
    // pos -1 → (-1) * 300 * 120 / 60 = -600 fractional beats.
    t.approx(c._beatF(1, -1), -600, 1e-6);
});

test('_beatF: fractional part floors via Math.floor', function(t) {
    var c = H.ctrl();
    // 0.503 * 600 = 301.8 → floor 301. The same floor is applied inline 
    // wherever the absolute beat is needed.
    setupTrack(c, 1, {pos: 0.503});
    t.eq(Math.floor(c._beatF(1, 0.503)), 301);
});

// ── _deriveOriginFromPosition / _resetBeat ─────────────────

test('_deriveOriginFromPosition: marker at-or-before sets origin', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    engine._set('[Channel1]', 'hotcue_9_color',    0xC50A08);
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    c._seedHotcueCache(1);
    c._deriveOriginFromPosition(1, 0.5);
    // Marker at 0.5 → beat 300; playhead at 0.5 → floor 300.
    t.eq(c._phraseOrigin[1], 300);
    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: marker only ahead sets origin to first marker beat', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    engine._set('[Channel1]', 'hotcue_9_color',    0xC50A08);
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    c._seedHotcueCache(1);
    // Playhead at 0.2 — marker at 0.5 is ahead. Origin still
    // lands on the marker beat so the pattern extends backwards.
    c._deriveOriginFromPosition(1, 0.2);
    t.eq(c._phraseOrigin[1], 300);
    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: no matching markers → origin 0', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    engine._set('[Channel1]', 'hotcue_9_color',    0xFFFFFF);  // not a marker
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    c._seedHotcueCache(1);
    c._phraseOrigin[1] = 42;
    c._deriveOriginFromPosition(1, 0.5);
    t.eq(c._phraseOrigin[1], 0);   // no matching marker → file start
    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: reads cache only, not live COs', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];

    // Populate the cache with marker at position 0.5.
    engine._set('[Channel1]', 'hotcue_9_color',    0xC50A08);
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    c._seedHotcueCache(1);

    // Change the CO without re-seeding. If _deriveOriginFromPosition
    // were reading COs directly, this would shift origin to
    // beat 60 (0.1 * 300 * 120 / 60). It must not — the cache is
    // the sole source.
    engine._set('[Channel1]', 'hotcue_9_position', 100);

    c._deriveOriginFromPosition(1, 0.5);
    t.eq(c._phraseOrigin[1], 300,
         'derivation reads cache (0.5), not live CO (0.1)');

    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: frozen in loop mode', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    engine._set('[Channel1]', 'hotcue_9_color',    0xC50A08);
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    c._decks[1].displaySource     = 'loop';
    c._decks[1].loopClock.running = true;
    c._phraseOrigin[1] = 42;
    c._deriveOriginFromPosition(1, 0.5);
    t.eq(c._phraseOrigin[1], 42);  // unchanged while looping
    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: no metadata no-op', function(t) {
    var c = H.ctrl();
    c._loadedState[1] = true;   // loaded, but samples = 0
    XoneK3.PHRASE_MARKER_COLORS = [0xC50A08];
    engine._set('[Channel1]', 'track_samples', 0);   // no metadata
    c._phraseOrigin[1] = 5;
    c._deriveOriginFromPosition(1, 0.5);
    t.eq(c._phraseOrigin[1], 5);
    XoneK3.PHRASE_MARKER_COLORS = [];
});

test('_deriveOriginFromPosition: empty marker list short-circuits', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    XoneK3.PHRASE_MARKER_COLORS = [];
    c._phraseOrigin[1] = 42;
    c._deriveOriginFromPosition(1, 0.5);
    t.eq(c._phraseOrigin[1], 42);
});

test('_resetBeat: clears origin and state', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._phraseOrigin[1] = 50;
    c._decks[1].count = 99;
    c._resetBeat(1);
    t.eq(c._phraseOrigin[1], 0);
    t.eq(c._decks[1].count, 1);
});

// ── _syncBeatCount ─────────────────────────────────────────

test('_syncBeatCount: updates count from beat math', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    var changed = c._syncBeatCount(1);
    t.eq(changed, true);
    t.eq(c._decks[1].count, 301);
    t.eq(c._decks[1].hasBeat, true);
});

test('_syncBeatCount: unchanged count returns false', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._syncBeatCount(1);
    t.eq(c._syncBeatCount(1), false);
});

test('_syncBeatCount: no metadata returns false', function(t) {
    var c = H.ctrl();
    t.eq(c._syncBeatCount(1), false);
});

// ── _phraseSourcePos ───────────────────────────────────────

test('_phraseSourcePos: track mode reads playposition', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1, {pos: 0.3});
    c._decks[1].displaySource = 'track';
    t.approx(c._phraseSourcePos(1), 0.3, 1e-9);
});

test('_phraseSourcePos: loop mode reads loop clock', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._decks[1].displaySource = 'loop';
    c._decks[1].loopClock.running = true;
    c._decks[1].loopClock.pos = 0.7;
    t.approx(c._phraseSourcePos(1), 0.7, 1e-9);
});

test('_phraseSourcePos: virtual not running → fall back to playposition', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1, {pos: 0.2});
    c._decks[1].displaySource = 'loop';
    c._decks[1].loopClock.running = false;
    t.approx(c._phraseSourcePos(1), 0.2, 1e-9);
});

// ── _startVirtualClock / _stopVirtualClock ─────────────────

test('_startVirtualClock: seeds pos from playposition', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1, {pos: 0.42});
    c._startVirtualClock(1);
    t.eq(c._decks[1].loopClock.running, true);
    t.approx(c._decks[1].loopClock.pos, 0.42, 1e-9);
});

test('_startVirtualClock: refreshes display source', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._startVirtualClock(1);
    t.eq(c._decks[1].displaySource, 'loop');
});

test('_stopVirtualClock: clears running and re-resolves display', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._startVirtualClock(1);
    c._stopVirtualClock(1);
    t.eq(c._decks[1].loopClock.running, false);
    t.eq(c._decks[1].displaySource, 'track');
});

// ── _advanceVirtualClock ───────────────────────────────────

test('_advanceVirtualClock: not running → no-op', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    var before = c._decks[1].loopClock.pos;
    c._advanceVirtualClock(1);
    t.eq(c._decks[1].loopClock.pos, before);
});

test('_advanceVirtualClock: real-time advances by dt/duration', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1, {duration: 100, pos: 0.1});
    engine._set('[Channel1]', 'play_indicator', 1);
    c._startVirtualClock(1);
    var start = c._decks[1].loopClock.pos;
    c._decks[1].loopClock.lastTs = Date.now() - 1000;
    c._advanceVirtualClock(1);
    var advanced = c._decks[1].loopClock.pos - start;
    t.approx(advanced, 0.01, 0.005);
});

test('_advanceVirtualClock: real-time does not advance when paused', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1, {duration: 100});
    engine._set('[Channel1]', 'play_indicator', 0);
    c._startVirtualClock(1);
    var start = c._decks[1].loopClock.pos;
    c._decks[1].loopClock.lastTs = Date.now() - 1000;
    c._advanceVirtualClock(1);
    t.eq(c._decks[1].loopClock.pos, start);
});

// ── _resolveDisplaySource ──────────────────────────────────

test('_resolveDisplaySource: default track with no loop clock', function(t) {
    var c = H.ctrl();
    c._resolveDisplaySource(1);
    t.eq(c._decks[1].displaySource, 'track');
});

test('_resolveDisplaySource: loop clock running → loop', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._startVirtualClock(1);
    t.eq(c._decks[1].displaySource, 'loop');
});

test('_resolveDisplaySource: falls back to track when loop clock stops', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._startVirtualClock(1);
    c._stopVirtualClock(1);
    t.eq(c._decks[1].displaySource, 'track');
});

// ── _refreshDisplayFlags ───────────────────────────────────

test('_refreshDisplayFlags: reflects active deck state', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c.setSelectedFor('deck', 'A', 1);
    c.setActiveDeck('A');
    c._decks[1].displaySource = 'loop';
    c._decks[1].loopClock.running = true;
    c._refreshDisplayFlags();
    t.eq(c.activeDisplaySource, 'loop');
    t.eq(c.activeDeckVirtual, true);
    t.eq(c.activeLoopVirtual, true);
});

// ── Beat clock connections ─────────────────────────────────

test('_needsBeatClocks: false with no beat LEDs', function(t) {
    var c = H.ctrl();
    t.eq(c._needsBeatClocks(), false);
});

test('_syncBeatClocks: opens clocks when beat LED attached', function(t) {
    XoneK3.PHRASE_MARKER_COLORS = [];
    XoneK3.SCHEMES.tBeat = {colors: [[127,0,0]], beat: {color: 'blue'}};
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'tBeat', on: true}
    });
    c._syncBeatClocks();
    t.ok(c._beatConns.length > 0);
});

test('_syncBeatClocks: closes clocks when beat LED removed', function(t) {
    XoneK3.PHRASE_MARKER_COLORS = [];
    XoneK3.SCHEMES.tBeat = {colors: [[127,0,0]], beat: {color: 'blue'}};
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'tBeat', on: true}
    });
    c._syncBeatClocks();
    c._applyBinding('button0_0', null);
    c._syncBeatClocks();
    t.eq(c._beatConns.length, 0);
});

// ── _readLoopState ─────────────────────────────────────────

test('_readLoopState: reads loop_enabled', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 1);
    c._readLoopState(1);
    t.eq(c._decks[1].loopActive, true);
});

test('_readLoopState: clears when disabled', function(t) {
    var c = H.ctrl();
    engine._set('[Channel1]', 'loop_enabled', 0);
    c._decks[1].loopActive = true;
    c._readLoopState(1);
    t.eq(c._decks[1].loopActive, false);
});

// ── cycleDisplaySource (func) ──────────────────────────────

test('cycleDisplaySource: no loop clock → stays track', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._applyBinding('grid2_0', {
        func: XoneK3.FUNCS.cycleDisplaySource, group: '[Channel1]'
    });
    c._decks[1].displaySource = 'track';
    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'track');
});

test('cycleDisplaySource: track → loop when loop clock running', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._decks[1].loopClock.running = true;
    c._decks[1].displaySource = 'track';
    c._applyBinding('grid2_0', {
        func: XoneK3.FUNCS.cycleDisplaySource, group: '[Channel1]'
    });
    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'loop');
});

test('cycleDisplaySource: loop → track', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._decks[1].loopClock.running = true;
    c._decks[1].displaySource = 'loop';
    c._applyBinding('grid2_0', {
        func: XoneK3.FUNCS.cycleDisplaySource, group: '[Channel1]'
    });
    H.press(c, 'grid2_0');
    t.eq(c._decks[1].displaySource, 'track');
});

// ── hotcue press (default push handler) ────────────────────
//
// hotcueWithPhraseCheck was removed; hotcues use the default
// push handler. Origin re-derives on the next playposition tick
// via the hotcue observers wired by _openBeatClocks. These tests
// verify the press/release wiring — the derivation logic itself
// is covered by the _deriveOriginFromPosition tests above.

test('hotcue press: writes 1 to activate CO on press', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._applyBinding('grid0_2', {
        group: '[Channel1]', inKey: 'hotcue_1_activate', type: 'push'
    });
    H.press(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_1_activate'), 1);
    t.eq(c._phraseOrigin[1], 0);   // no marker on this channel
});

test('hotcue press: release writes 0 to activate CO', function(t) {
    var c = H.ctrl();
    setupTrack(c, 1);
    c._applyBinding('grid0_2', {
        group: '[Channel1]', inKey: 'hotcue_1_activate', type: 'push'
    });
    H.release(c, 'grid0_2');
    t.eq(engine.getValue('[Channel1]', 'hotcue_1_activate'), 0);
});