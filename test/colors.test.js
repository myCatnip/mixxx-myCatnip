'use strict';

// resolveColorEntry, mapMixxxColor.

// ── resolveColorEntry ────────────────────────────────────────

test('resolveColorEntry: palette name', function(t) {
    var e = XoneK3.resolveColorEntry('red');
    t.eq(e.rgb, [127, 0, 0]);
    t.eq(e.brightness, 110);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: name + on brightness', function(t) {
    var e = XoneK3.resolveColorEntry('red, 80');
    t.eq(e.rgb, [127, 0, 0]);
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: name + on + off', function(t) {
    var e = XoneK3.resolveColorEntry('red, 80, 16');
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, 16);
});

test('resolveColorEntry: rgb array', function(t) {
    var e = XoneK3.resolveColorEntry([10, 20, 30]);
    t.eq(e.rgb, [10, 20, 30]);
    t.eq(e.brightness, 110);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: rgb array + on', function(t) {
    t.eq(XoneK3.resolveColorEntry([10, 20, 30, 80]).brightness, 80);
});

test('resolveColorEntry: rgb array + on + off', function(t) {
    var e = XoneK3.resolveColorEntry([10, 20, 30, 80, 16]);
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, 16);
});

test('resolveColorEntry: clamps out-of-range rgb', function(t) {
    t.eq(XoneK3.resolveColorEntry([300, -10, 50]).rgb, [127, 0, 50]);
});

test('resolveColorEntry: clamps out-of-range brightness', function(t) {
    t.eq(XoneK3.resolveColorEntry('red, 300').brightness, 127);
    t.eq(XoneK3.resolveColorEntry('red, -10').brightness, 0);
});

test('resolveColorEntry: default brightness passthrough', function(t) {
    t.eq(XoneK3.resolveColorEntry('red',        64).brightness, 64);
    t.eq(XoneK3.resolveColorEntry([10, 20, 30], 64).brightness, 64);
});

test('resolveColorEntry: mixxx type', function(t) {
    var e = XoneK3.resolveColorEntry('mixxx');
    t.eq(e.rgb, null);
    t.eq(e.type, 'mixxx');
    t.eq(e.brightness, 110);
});

test('resolveColorEntry: unknown name → null', function(t) {
    t.eq(XoneK3.resolveColorEntry('noSuchColour'), null);
    t.eq(XoneK3.resolveColorEntry('noSuchColour, 80'), null);
});

test('resolveColorEntry: null / undefined / number → null', function(t) {
    t.eq(XoneK3.resolveColorEntry(null),      null);
    t.eq(XoneK3.resolveColorEntry(undefined), null);
    t.eq(XoneK3.resolveColorEntry(42),        null);
});

test('resolveColorEntry: empty string → null', function(t) {
    t.eq(XoneK3.resolveColorEntry(''),   null);
    t.eq(XoneK3.resolveColorEntry('   '), null);
});

test('resolveColorEntry: rgb-in-string form', function(t) {
    t.eq(XoneK3.resolveColorEntry('10, 20, 30').rgb, [10, 20, 30]);
});

test('resolveColorEntry: every palette entry resolves', function(t) {
    for (var name in XoneK3.SYSEX_PALETTE) {
        if (!XoneK3.SYSEX_PALETTE.hasOwnProperty(name)) continue;
        var e = XoneK3.resolveColorEntry(name);
        t.ok(e, 'palette entry ' + name + ' failed');
    }
});

// ── mapMixxxColor ────────────────────────────────────────────

test('mapMixxxColor: 0 → null', function(t) {
    t.eq(XoneK3.mapMixxxColor(0), null);
});

test('mapMixxxColor: known hexes', function(t) {
    t.eq(XoneK3.mapMixxxColor(0xC50A08), [0x6F, 0x05, 0x00]);
    t.eq(XoneK3.mapMixxxColor(0xFF8000), [0x7F, 0x20, 0x00]);
    t.eq(XoneK3.mapMixxxColor(0x0044FF), [0x00, 0x0F, 0x7F]);
});

test('mapMixxxColor: unknown halves the RGB', function(t) {
    // 0x123456 → [18, 52, 86] → halved → [9, 26, 43]
    t.eq(XoneK3.mapMixxxColor(0x123456), [9, 26, 43]);
});