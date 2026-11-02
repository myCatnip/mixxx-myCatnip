'use strict';

var H = require('./helpers');

// Boot settle-aware catch-up (Fix 1) and hotcue range tuneability
// (Fix 3) + memoization (N1) + catch-up re-derive (N2).

function makeCtrl() {
    return H.ctrl({ patches: {}, initialPatches: [] });
}

// ── tunables + state ───────────────────────────────────────────

test('boot settle: tunables defined', function(t) {
    t.eq(typeof XoneK3.BOOT_SETTLE_MS, 'number');
    t.eq(typeof XoneK3.BOOT_MAX_ATTEMPTS, 'number');
    t.ok(XoneK3.BOOT_SETTLE_MS > 0);
    t.ok(XoneK3.BOOT_MAX_ATTEMPTS > 0);
});

test('boot settle: constructor inits per-channel state', function(t) {
    var c = makeCtrl();
    t.eq(c._bootSettling[1], false);
    t.eq(c._bootSettling[4], false);
    t.eq(c._bootAttempt[1], 0);
    t.eq(c._bootSettledAt[1], 0);
});

// ── _startBootSettle ───────────────────────────────────────────

test('boot settle: _startBootSettle marks all channels + schedules',
function(t) {
    var c = makeCtrl();
    var before = Date.now();
    c._startBootSettle();
    for (var ch = 1; ch <= 4; ch++) {
        t.eq(c._bootSettling[ch], true);
        t.eq(c._bootAttempt[ch], 1);
        t.ok(c._bootSettledAt[ch] >= before);
    }
});

// ── reschedule vs settle ───────────────────────────────────────

test('boot settle: reschedules while window is fresh', function(t) {
    var c = makeCtrl();
    var calls = 0;
    var orig = c._catchUpChannel;
    c._catchUpChannel = function(ch) { calls++; return orig.call(this, ch); };

    c._startBootSettle();
    t.eq(c._bootAttempt[1], 1);

    engine._fireOneShots();
    t.eq(calls, 4, 'catch-up ran once per channel');
    t.eq(c._bootAttempt[1], 2, 'rescheduled because elapsed < BOOT_SETTLE_MS');
    t.eq(c._bootSettling[1], true);
});

test('boot settle: settles when window elapsed', function(t) {
    var c = makeCtrl();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = Date.now() - 200;
    c._bootAttempt[1] = 1;

    c._checkBootChannel(1);

    t.eq(c._bootAttempt[1], 0, 'attempt counter reset after settle');
    t.eq(c._bootSettling[1], false, 'settling flag cleared');
});

test('boot settle: max attempts cap stops rescheduling', function(t) {
    var c = makeCtrl();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = Date.now();
    c._bootAttempt[1] = XoneK3.BOOT_MAX_ATTEMPTS;

    c._checkBootChannel(1);

    t.eq(c._bootAttempt[1], 0, 'attempt counter reset at cap');
    t.eq(c._bootSettling[1], false, 'settling flag cleared at cap');
});

test('boot settle: cap hit warns once per channel', function(t) {
    var c = makeCtrl();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = Date.now();
    c._bootAttempt[1] = XoneK3.BOOT_MAX_ATTEMPTS;

    c._checkBootChannel(1);

    t.ok(XoneK3._warned['bootSettle:1']);
    t.eq(c._bootSettling[1], false);
    t.eq(c._bootAttempt[1], 0);
});

// ── CO stamps ─────────────────────────────────────────────────

test('boot settle: play_indicator stamps while _bootSettling', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = 0;
    engine._trigger('[Channel1]', 'play_indicator', 1);
    t.ok(c._bootSettledAt[1] > 0);
});

test('boot settle: track_loaded stamps while _bootSettling', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = 0;
    engine._trigger('[Channel1]', 'track_loaded', 1);
    t.ok(c._bootSettledAt[1] > 0);
});

test('boot settle: loop_enabled stamps while _bootSettling', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = 0;
    engine._trigger('[Channel1]', 'loop_enabled', 1);
    t.ok(c._bootSettledAt[1] > 0);
});

test('boot settle: rate_ratio stamps while _bootSettling', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = 0;
    engine._trigger('[Channel1]', 'rate_ratio', 1.05);
    t.ok(c._bootSettledAt[1] > 0);
});

test('boot settle: reverse stamps while _bootSettling', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = true;
    c._bootSettledAt[1] = 0;
    engine._trigger('[Channel1]', 'reverse', 1);
    t.ok(c._bootSettledAt[1] > 0);
});

test('boot settle: CO fire does NOT stamp after settle', function(t) {
    var c = H.bootCat();
    c._bootSettling[1] = false;
    c._bootSettledAt[1] = 100;
    engine._trigger('[Channel1]', 'play_indicator', 1);
    t.eq(c._bootSettledAt[1], 100, 'stamp unchanged when not settling');
});

// ── init wiring ───────────────────────────────────────────────

test('init: 250ms timer calls _startBootSettle', function(t) {
    var c = H.bootCat();
    var started = 0;
    var orig = c._startBootSettle;
    c._startBootSettle = function() { started++; return orig.call(this); };
    engine._fireOneShots();
    t.eq(started, 1, '_startBootSettle fired once from the reopen timer');
});

// ── N2: _catchUpChannel re-derive ─────────────────────────────

test('_catchUpChannel: re-derives origin after clocks closed across load',
function(t) {
    var c = H.bootCat();
    engine._set('[Channel1]', 'duration', 300);
    engine._set('[Channel1]', 'file_bpm', 120);
    engine._set('[Channel1]', 'track_samples', 1000);
    engine._set('[Channel1]', 'track_loaded', 1);
    engine._set('[Channel1]', 'hotcue_9_position', 500);
    engine._set('[Channel1]', 'hotcue_9_color', XoneK3.PHRASE_MARKER_COLORS[0]);
    engine._set('[Channel1]', 'playposition', 0.6);

    // Force the state that would result if clocks were closed:
    // stale origin, empty cache, loaded track.
    c._phraseOrigin[1] = 100;
    c._decks[1].hotcueState = {};
    c._trackMetaCache[1] = undefined;
    c._loadedState[1] = true;

    c._catchUpChannel(1);

    t.eq(c._phraseOrigin[1], 300, 'origin re-derived from marker');
});

test('_catchUpChannel: skips reseed when hotcue cache populated',
function(t) {
    var c = H.bootCat();
    c._decks[1].hotcueState = { 9: { color: 0, pos: 0 } };
    var seedCalls = 0;
    var orig = c._seedHotcueCache;
    c._seedHotcueCache = function(ch) {
        seedCalls++;
        return orig.call(this, ch);
    };

    c._catchUpChannel(1);

    t.eq(seedCalls, 0, 'no redundant seed on normal boot path');
});

// ── N1: _phraseHotcueSlots memoization ────────────────────────

function freshSlotsCache() {
    XoneK3._phraseHotcueSlotsCache = null;
    XoneK3._phraseHotcueSlotsCacheSrc = null;
}

test('_phraseHotcueSlots: caches by array identity', function(t) {
    freshSlotsCache();
    var a = XoneK3._phraseHotcueSlots();
    var b = XoneK3._phraseHotcueSlots();
    t.eq(a, b, 'same reference on second call');
});

test('_phraseHotcueSlots: invalidates when array replaced', function(t) {
    var origSlots = XoneK3.PHRASE_HOTCUE_SLOTS;
    freshSlotsCache();
    var a = XoneK3._phraseHotcueSlots();

    XoneK3.PHRASE_HOTCUE_SLOTS = [1, 2, 3, 4];
    var b = XoneK3._phraseHotcueSlots();
    t.neq(a, b, 'new reference after array replaced');
    t.eq(b.length, 4);

    XoneK3.PHRASE_HOTCUE_SLOTS = origSlots;
    freshSlotsCache();
});

// ── _validatePhraseHotcueSlots ────────────────────────────────

test('_validatePhraseHotcueSlots: warns on non-array', function(t) {
    var orig = XoneK3.PHRASE_HOTCUE_SLOTS;
    XoneK3.PHRASE_HOTCUE_SLOTS = 'bad';
    var c = H.ctrl();
    c._validateBindings();
    t.ok(XoneK3._warned['phraseSlotsShape']);
    XoneK3.PHRASE_HOTCUE_SLOTS = orig;
});

test('_validatePhraseHotcueSlots: warns on out-of-range', function(t) {
    var orig = XoneK3.PHRASE_HOTCUE_SLOTS;
    XoneK3.PHRASE_HOTCUE_SLOTS = [0, 99];
    var c = H.ctrl();
    c._validateBindings();
    t.ok(XoneK3._warned['phraseSlotRange:0']);
    t.ok(XoneK3._warned['phraseSlotRange:99']);
    XoneK3.PHRASE_HOTCUE_SLOTS = orig;
});

test('_validatePhraseHotcueSlots: warns on duplicate', function(t) {
    var orig = XoneK3.PHRASE_HOTCUE_SLOTS;
    XoneK3.PHRASE_HOTCUE_SLOTS = [9, 9, 10];
    var c = H.ctrl();
    c._validateBindings();
    t.ok(XoneK3._warned['phraseSlotDup:9']);
    XoneK3.PHRASE_HOTCUE_SLOTS = orig;
});

test('_validatePhraseHotcueSlots: warns on non-integer', function(t) {
    var orig = XoneK3.PHRASE_HOTCUE_SLOTS;
    XoneK3.PHRASE_HOTCUE_SLOTS = [9.5];
    var c = H.ctrl();
    c._validateBindings();
    t.ok(XoneK3._warned['phraseSlotRange:9.5']);
    XoneK3.PHRASE_HOTCUE_SLOTS = orig;
});

test('_phraseHotcueSlots: rejects non-integer slots', function(t) {
    var orig = XoneK3.PHRASE_HOTCUE_SLOTS;
    XoneK3._phraseHotcueSlotsCache = null;
    XoneK3._phraseHotcueSlotsCacheSrc = null;
    XoneK3.PHRASE_HOTCUE_SLOTS = [9.5, 10, 11];

    var slots = XoneK3._phraseHotcueSlots();
    t.eq(slots.length, 2, '9.5 rejected');
    t.contains(slots, 10);
    t.contains(slots, 11);

    XoneK3.PHRASE_HOTCUE_SLOTS = orig;
    XoneK3._phraseHotcueSlotsCache = null;
    XoneK3._phraseHotcueSlotsCacheSrc = null;
});