'use strict';

// resolveColorEntry, mapMixxxColor, HW_K3 palette surface.

// ── resolveColorEntry ────────────────────────────────────────

test('resolveColorEntry: palette name', function(t) {
    var e = myCatnip.resolveColorEntry('red');
    t.eq(e.rgb, [127, 0, 0]);
    t.eq(e.brightness, 110);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: name + on brightness', function(t) {
    var e = myCatnip.resolveColorEntry('red, 80');
    t.eq(e.rgb, [127, 0, 0]);
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: name + on + off', function(t) {
    var e = myCatnip.resolveColorEntry('red, 80, 16');
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, 16);
});

test('resolveColorEntry: rgb array', function(t) {
    var e = myCatnip.resolveColorEntry([10, 20, 30]);
    t.eq(e.rgb, [10, 20, 30]);
    t.eq(e.brightness, 110);
    t.eq(e.brightnessOff, null);
});

test('resolveColorEntry: rgb array + on', function(t) {
    t.eq(myCatnip.resolveColorEntry([10, 20, 30, 80]).brightness, 80);
});

test('resolveColorEntry: rgb array + on + off', function(t) {
    var e = myCatnip.resolveColorEntry([10, 20, 30, 80, 16]);
    t.eq(e.brightness, 80);
    t.eq(e.brightnessOff, 16);
});

test('resolveColorEntry: clamps out-of-range rgb', function(t) {
    t.eq(myCatnip.resolveColorEntry([300, -10, 50]).rgb, [127, 0, 50]);
});

test('resolveColorEntry: clamps out-of-range brightness', function(t) {
    t.eq(myCatnip.resolveColorEntry('red, 300').brightness, 127);
    t.eq(myCatnip.resolveColorEntry('red, -10').brightness, 0);
});

test('resolveColorEntry: default brightness passthrough', function(t) {
    t.eq(myCatnip.resolveColorEntry('red',        64).brightness, 64);
    t.eq(myCatnip.resolveColorEntry([10, 20, 30], 64).brightness, 64);
});

test('resolveColorEntry: mixxx type', function(t) {
    var e = myCatnip.resolveColorEntry('mixxx');
    t.eq(e.rgb, null);
    t.eq(e.type, 'mixxx');
    t.eq(e.brightness, 110);
});

test('resolveColorEntry: unknown name → null', function(t) {
    t.eq(myCatnip.resolveColorEntry('noSuchColour'), null);
    t.eq(myCatnip.resolveColorEntry('noSuchColour, 80'), null);
});

test('resolveColorEntry: null / undefined / number → null', function(t) {
    t.eq(myCatnip.resolveColorEntry(null),      null);
    t.eq(myCatnip.resolveColorEntry(undefined), null);
    t.eq(myCatnip.resolveColorEntry(42),        null);
});

test('resolveColorEntry: empty string → null', function(t) {
    t.eq(myCatnip.resolveColorEntry(''),   null);
    t.eq(myCatnip.resolveColorEntry('   '), null);
});

test('resolveColorEntry: rgb-in-string form', function(t) {
    t.eq(myCatnip.resolveColorEntry('10, 20, 30').rgb, [10, 20, 30]);
});

test('resolveColorEntry: every palette entry resolves', function(t) {
    // v1.2.0: palette lives on the hardware descriptor.
    for (var name in myCatnip.HW_K3.PALETTE) {
        if (!myCatnip.HW_K3.PALETTE.hasOwnProperty(name)) continue;
        var e = myCatnip.resolveColorEntry(name);
        t.ok(e, 'palette entry ' + name + ' failed');
    }
});

// ── mapMixxxColor ────────────────────────────────────────────

test('mapMixxxColor: 0 → null', function(t) {
    t.eq(myCatnip.mapMixxxColor(0), null);
});

test('mapMixxxColor: known hexes', function(t) {
    t.eq(myCatnip.mapMixxxColor(0xC50A08), [0x6F, 0x05, 0x00]);
    t.eq(myCatnip.mapMixxxColor(0xFF8000), [0x7F, 0x20, 0x00]);
    t.eq(myCatnip.mapMixxxColor(0x0044FF), [0x00, 0x0F, 0x7F]);
});

test('mapMixxxColor: unknown halves the RGB', function(t) {
    // 0x123456 → [18, 52, 86] → halved → [9, 26, 43]
    t.eq(myCatnip.mapMixxxColor(0x123456), [9, 26, 43]);
});

// ── HW_K3 palette / Mixxx colour surface ────────────────────

test('HW_K3: exposes PALETTE and MIXXX_COLORS', function(t) {
    t.ok(myCatnip.HW_K3.PALETTE);
    t.ok(myCatnip.HW_K3.MIXXX_COLORS);
    t.eq(myCatnip.HW_K3.PALETTE.red,               [127, 0, 0]);
    t.eq(myCatnip.HW_K3.PALETTE.magenta,           [127, 0, 127]);
    t.eq(myCatnip.HW_K3.MIXXX_COLORS[0xC50A08],    [0x6F, 0x05, 0x00]);
    t.eq(myCatnip.HW_K3.MIXXX_COLORS[0xFF8000],    [0x7F, 0x20, 0x00]);
});

test('resolveNamedColour: K3 hardware populates the table', function(t) {
    t.eq(myCatnip.resolveNamedColour('red'),     [127, 0, 0]);
    t.eq(myCatnip.resolveNamedColour('magenta'), [127, 0, 127]);
    t.eq(myCatnip.resolveNamedColour('nope'),    null);
});

test('mapMixxxColor: K3 hardware implements the hook', function(t) {
    t.eq(myCatnip.mapMixxxColor(0xC50A08), [0x6F, 0x05, 0x00]);
    t.eq(myCatnip.mapMixxxColor(0),        null);
});