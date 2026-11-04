'use strict';

// applyBeat cascade with partial levels: color and brightness
// inherited independently from a higher-precedence level.

test('applyBeat: bar.color inherits top-level brightness', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, brightness: 60, bar: {color: 'green'}},
        5);
    t.eq(out.rgb, [0, 127, 0]);
    t.eq(out.brightness, 60);
});

test('applyBeat: phrase.color + bar.brightness cascade', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4,
         phrase: {color: 'blue'},
         bar:    {brightness: 40}},
        1);
    t.eq(out.rgb, [0, 0, 127]);
    t.eq(out.brightness, 40);
});

test('applyBeat: prePhrase brightness only, phrase color', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 4,
         prePhrase: {brightness: 20},
         phrase:    {color: 'blue'}},
        13);
    t.eq(out.rgb, [0, 0, 127]);
    t.eq(out.brightness, 20);
});

test('applyBeat: prePhrase missing falls through to phrase', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, prePhraseBeats: 4,
         phrase: {color: 'red'}},
        13);
    t.eq(out.rgb, [127, 0, 0]);
});

test('applyBeat: sub-object color inline brightness', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4, bar: {color: 'green, 30'}},
        5);
    t.eq(out.rgb, [0, 127, 0]);
    t.eq(out.brightness, 30);
});

test('applyBeat: phrase inline brightness used when no other brightness set', function(t) {
    // Inline brightness on a color spec fills in when no higher
    // level provided one.
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100},
        {barBeats: 4, phraseBars: 4,
         phrase: {color: 'red, 20'}},
        1);
    t.eq(out.rgb, [127, 0, 0]);
    t.eq(out.brightness, 20);
});

test('applyBeat: preserves brightnessOff, overrides type to rgb', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100, brightnessOff: 5, type: 'mixxx'},
        {color: 'red'}, 2);
    t.eq(out.brightnessOff, 5);
    // v2.3.1: a cascade-supplied rgb overrides type to 'rgb'.
    // A base 'mixxx' type would otherwise cause _sendColor to
    // re-resolve the hotcue colour CO and silently drop the
    // cascade colour.
    t.eq(out.type, 'rgb');
});

test('applyBeat: preserves type when only brightness overridden', function(t) {
    var out = myCatnip.applyBeat(
        {rgb: [0,0,0], brightness: 100, brightnessOff: 5, type: 'mixxx'},
        {brightness: 40}, 2);
    t.eq(out.brightnessOff, 5);
    t.eq(out.type, 'mixxx');
});

test('applyBeat: original entry not mutated', function(t) {
    var e = {rgb: [10, 20, 30], brightness: 100};
    myCatnip.applyBeat(e, {color: 'red'}, 2);
    t.eq(e.rgb, [10, 20, 30]);
    t.eq(e.brightness, 100);
});