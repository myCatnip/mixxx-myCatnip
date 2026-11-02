'use strict';

// beatLevel + applyBeat. Pure math over (beat, count).

// ── beatLevel: default 4/4 grid ──────────────────────────────

test('beatLevel: count=1 is phrase', function(t) {
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 1).level, 'phrase');
});

test('beatLevel: count=2/3/4 are beat', function(t) {
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 2).level, 'beat');
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 3).level, 'beat');
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 4).level, 'beat');
});

test('beatLevel: count=5 is bar', function(t) {
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 5).level, 'bar');
});

test('beatLevel: count=9 bar, count=13 prePhrase', function(t) {
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4},  9).level, 'bar');
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 13).level, 'prePhrase');
});

test('beatLevel: count=17 wraps to phrase', function(t) {
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 17).level, 'phrase');
});

test('beatLevel: defaults when barBeats/phraseBars missing', function(t) {
    t.eq(XoneK3.beatLevel({}, 1).level,  'phrase');
    t.eq(XoneK3.beatLevel({}, 5).level,  'bar');
    t.eq(XoneK3.beatLevel({}, 13).level, 'prePhrase');
});

// ── beatLevel: prePhraseBeats override ──────────────────────

test('beatLevel: explicit prePhraseBeats', function(t) {
    t.eq(XoneK3.beatLevel(
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 2}, 15).level, 'prePhrase');
});

test('beatLevel: prePhraseBeats clamped to phraseLen-1', function(t) {
    // prePhraseBeats 100 → 15. preAt = 1. c = (count-1)%16. count=2 → c=1 → prePhrase.
    t.eq(XoneK3.beatLevel(
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 100}, 2).level, 'prePhrase');
});

test('beatLevel: prePhraseBeats 0 disables', function(t) {
    // preAt = phraseLen - 0 = 16, c never equals 16 → prePhrase never fires.
    t.eq(XoneK3.beatLevel(
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 0}, 14).level, 'beat');
});

test('beatLevel: negative prePhraseBeats clamps to 0', function(t) {
    t.eq(XoneK3.beatLevel(
        {barBeats: 4, phraseBars: 4, prePhraseBeats: -5}, 14).level, 'beat');
});

// ── beatLevel: half ─────────────────────────────────────────

test('beatLevel: half skips odd beats at beat level', function(t) {
    var beat = {barBeats: 4, phraseBars: 4, half: true};
    t.eq(XoneK3.beatLevel(beat,  3).skip, true);
    t.ok(!XoneK3.beatLevel(beat, 4).skip);
    t.ok(!XoneK3.beatLevel(beat, 1).skip);   // phrase
    t.ok(!XoneK3.beatLevel(beat, 5).skip);   // bar
});

// ── beatLevel: negative & zero counts ───────────────────────

test('beatLevel: count=0 lands on beat 16 of previous phrase', function(t) {
    // count=0 → phrasePos = 15 → 'beat' (same phrase-relative
    // position as count=16 and count=32).
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 0).level, 'beat');
});

test('beatLevel: count=-1 same as count=15', function(t) {
    var a = XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, -1);
    var b = XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 15);
    t.eq(a.level, b.level);
});

test('beatLevel: half normalizes for negatives', function(t) {
    // -1 % 2 = -1 in JS; the guard adds 2 then mods → 1 → odd → skip.
    var beat = {barBeats: 4, phraseBars: 4, half: true};
    t.eq(XoneK3.beatLevel(beat, -1).skip, true);
});

// ── beatLevel: TIME_SIG override ─────────────────────────────

test('beatLevel: TIME_SIG overrides per-scheme grid', function(t) {
    XoneK3.TIME_SIG = {barBeats: 3, phraseBars: 4};
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 4).level, 'bar');
    XoneK3.TIME_SIG = null;
});

test('beatLevel: TIME_SIG null restores scheme', function(t) {
    XoneK3.TIME_SIG = null;
    t.eq(XoneK3.beatLevel({barBeats: 4, phraseBars: 4}, 4).level, 'beat');
});

// ── applyBeat: no-op cases ───────────────────────────────────

test('applyBeat: no beat → unchanged', function(t) {
    var e = {rgb: [10,20,30], brightness: 100};
    t.eq(XoneK3.applyBeat(e, null, 1), e);
});

test('applyBeat: null / undefined / NaN count → unchanged', function(t) {
    var e = {rgb: [10,20,30], brightness: 100};
    var beat = {color: 'red'};
    t.eq(XoneK3.applyBeat(e, beat, null),      e, 'null');
    t.eq(XoneK3.applyBeat(e, beat, undefined), e, 'undefined');
    t.eq(XoneK3.applyBeat(e, beat, NaN),       e, 'NaN');
});

test('applyBeat: zero count passes through (valid)', function(t) {
    var out = XoneK3.applyBeat({rgb: [0,0,0], brightness: 100}, {color: 'red'}, 0);
    t.ok(out !== null);
    t.ok(out !== XoneK3.BEAT_HOLD);
});

test('applyBeat: negative count passes through', function(t) {
    var out = XoneK3.applyBeat({rgb: [0,0,0], brightness: 100}, {color: 'red'}, -5);
    t.ok(out !== XoneK3.BEAT_HOLD);
});

test('applyBeat: no overrides in beat → unchanged object', function(t) {
    var e = {rgb: [10,20,30], brightness: 100};
    t.eq(XoneK3.applyBeat(e, {barBeats: 4, phraseBars: 4}, 2), e);
});

// ── applyBeat: color / brightness overrides ──────────────────

test('applyBeat: beat.color overrides rgb', function(t) {
    var out = XoneK3.applyBeat(
        {rgb: [10,20,30], brightness: 100}, {color: 'red'}, 2);
    t.eq(out.rgb, [127, 0, 0]);
});

test('applyBeat: beat.brightness overrides', function(t) {
    var out = XoneK3.applyBeat(
        {rgb: [10,20,30], brightness: 100}, {brightness: 42}, 2);
    t.eq(out.brightness, 42);
});

test('applyBeat: inline brightness on color spec', function(t) {
    var out = XoneK3.applyBeat(
        {rgb: [0,0,0], brightness: 100}, {color: 'red, 60'}, 2);
    t.eq(out.rgb, [127, 0, 0]);
    t.eq(out.brightness, 60);
});

test('applyBeat: RGB array as beat color', function(t) {
    var out = XoneK3.applyBeat(
        {rgb: [0,0,0], brightness: 100}, {color: [10, 20, 30]}, 2);
    t.eq(out.rgb, [10, 20, 30]);
});

// ── applyBeat: cascade preference ────────────────────────────

test('applyBeat: phrase wins over beat-level color', function(t) {
    var out = XoneK3.applyBeat({rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, color: 'red', phrase: {color: 'blue'}}, 1);
    t.eq(out.rgb, [0, 0, 127]);
});

test('applyBeat: bar wins over beat-level', function(t) {
    var out = XoneK3.applyBeat({rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, color: 'red', bar: {color: 'green'}}, 5);
    t.eq(out.rgb, [0, 127, 0]);
});

test('applyBeat: prePhrase wins over phrase', function(t) {
    var out = XoneK3.applyBeat({rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 4,
         phrase: {color: 'red'}, prePhrase: {color: 'blue'}}, 13);
    t.eq(out.rgb, [0, 0, 127]);
});

// ── applyBeat: half → BEAT_HOLD ──────────────────────────────

test('applyBeat: half skip returns BEAT_HOLD', function(t) {
    var beat = {barBeats: 4, phraseBars: 4, half: true};
    t.eq(XoneK3.applyBeat({rgb: [0,0,0], brightness: 100}, beat, 3),
         XoneK3.BEAT_HOLD);
});

test('applyBeat: half does not skip bar/phrase', function(t) {
    var beat = {barBeats: 4, phraseBars: 4, half: true, color: 'red'};
    t.ok(XoneK3.applyBeat({rgb: [0,0,0], brightness: 100}, beat, 5) !== XoneK3.BEAT_HOLD);
    t.ok(XoneK3.applyBeat({rgb: [0,0,0], brightness: 100}, beat, 1) !== XoneK3.BEAT_HOLD);
});