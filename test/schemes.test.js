'use strict';

// Scheme engine: _warp, sampleT, _computeTmap, _buildSegments,
// sampleSegs, resolveScheme, compileScheme, markerHit,
// scaleTarget, _generateOff.

// ── _warp ─────────────────────────────────────────────────────

test('_warp: identity at k=0', function(t) {
    for (var x = 0; x <= 1; x += 0.1) t.eq(XoneK3._warp(x, 0), x);
});

test('_warp: identity at boundaries', function(t) {
    t.eq(XoneK3._warp(0, 0.5), 0);
    t.eq(XoneK3._warp(1, 0.5), 1);
    t.eq(XoneK3._warp(0, -0.5), 0);
    t.eq(XoneK3._warp(1, -0.5), 1);
});

test('_warp: pivot at 0.5', function(t) {
    t.approx(XoneK3._warp(0.5,  0.5), 0.5, 1e-9);
    t.approx(XoneK3._warp(0.5, -0.5), 0.5, 1e-9);
});

test('_warp: symmetric around 0.5', function(t) {
    var ks = [0.2, 0.5, 0.8, -0.2, -0.5, -0.8];
    for (var ki = 0; ki < ks.length; ki++) {
        for (var d = 0.05; d < 0.5; d += 0.1) {
            var l = XoneK3._warp(0.5 - d, ks[ki]);
            var r = XoneK3._warp(0.5 + d, ks[ki]);
            t.approx(l + r, 1, 1e-9, 'k=' + ks[ki] + ' d=' + d);
        }
    }
});

test('_warp: positive k squishes toward 0.5', function(t) {
    t.ok(XoneK3._warp(0.3, 0.5) > 0.3);
    t.ok(XoneK3._warp(0.3, 0.5) < 0.5);
});

test('_warp: negative k pushes away from 0.5', function(t) {
    t.ok(XoneK3._warp(0.4, -0.5) < 0.4);
});

// ── sampleT / _computeTmap ───────────────────────────────────

test('sampleT: no tmap returns t', function(t) {
    t.eq(XoneK3.sampleT({}, 0.7), 0.7);
});

test('sampleT: identity tmap', function(t) {
    var compiled = {tmap: {curve: 0, position: 0}};
    for (var x = 0; x <= 1; x += 0.1) {
        t.approx(XoneK3.sampleT(compiled, x), x, 1e-9);
    }
});

test('sampleT: position subtracts and clamps', function(t) {
    var compiled = {tmap: {curve: 0, position: 0.2}};
    t.approx(XoneK3.sampleT(compiled, 0.5), 0.3, 1e-9);
    t.eq(XoneK3.sampleT(compiled, 0), 0);
    t.approx(XoneK3.sampleT(compiled, 1), 0.8, 1e-9);
});

test('sampleT: composes position then curve', function(t) {
    var compiled = {tmap: {curve: 0.5, position: 0.1}};
    var shifted = 0.6 - 0.1;
    var expected = XoneK3._warp(shifted, 0.5);
    t.approx(XoneK3.sampleT(compiled, 0.6), expected, 1e-9);
});

test('sampleT: out-of-range holds boundary after curve', function(t) {
    // position 0.5 shifts the whole curve right; input 0.2 clamps
    // to 0 before warping, so the result is warp(0, curve) = 0.
    var compiled = {tmap: {curve: -0.65, position: 0.5}};
    t.eq(XoneK3.sampleT(compiled, 0.2), 0);
    t.eq(XoneK3.sampleT(compiled, 0.5), 0);
    t.eq(XoneK3.sampleT(compiled, 1.0), XoneK3._warp(0.5, -0.65));
});

test('_computeTmap: schemePosition 63.5 is position 0', function(t) {
    t.eq(XoneK3._computeTmap({schemePosition: 63.5, curve: 0}).position, 0);
});

test('_computeTmap: schemePosition 127 is position 0.5', function(t) {
    t.approx(XoneK3._computeTmap({schemePosition: 127, curve: 0}).position, 0.5, 1e-9);
});

// ── _buildSegments ────────────────────────────────────────────

test('_buildSegments: two colors, even split', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,0,127]], null, 127);
    t.eq(segs.length, 2);
    t.approx(segs[0].start, 0,   1e-9);
    t.approx(segs[0].end,   0.5, 1e-9);
    t.approx(segs[1].start, 0.5, 1e-9);
    t.approx(segs[1].end,   1,   1e-9);
});

test('_buildSegments: ratio weights', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,0,127]], [3, 1], 127);
    t.approx(segs[0].end,   0.75, 1e-9);
    t.approx(segs[1].start, 0.75, 1e-9);
});

test('_buildSegments: skips unresolvable entries', function(t) {
    var segs = XoneK3._buildSegments(
        [[127,0,0], 'noSuchColour', [0,127,0]], null, 127);
    t.eq(segs.length, 2);
    t.eq(segs[0].color.rgb, [127, 0, 0]);
    t.eq(segs[1].color.rgb, [0, 127, 0]);
});

test('_buildSegments: empty / null → null', function(t) {
    t.eq(XoneK3._buildSegments([],   null, 127), null);
    t.eq(XoneK3._buildSegments(null, null, 127), null);
});

test('_buildSegments: per-entry ratio object', function(t) {
    var segs = XoneK3._buildSegments([
        {color: [127,0,0], ratio: 3},
        {color: [0,0,127], ratio: 1}
    ], null, 127);
    t.approx(segs[0].end, 0.75, 1e-9);
});

// ── sampleSegs ────────────────────────────────────────────────

test('sampleSegs: snap picks nearest stop', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    t.eq(XoneK3.sampleSegs(segs, 0.1, false).rgb, [127, 0, 0]);
    t.eq(XoneK3.sampleSegs(segs, 0.9, false).rgb, [0, 127, 0]);
    t.eq(XoneK3.sampleSegs(segs, 0.4, false).rgb, [127, 0, 0]);
    t.eq(XoneK3.sampleSegs(segs, 0.6, false).rgb, [0, 127, 0]);
});

test('sampleSegs: interp at center', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    var mid = XoneK3.sampleSegs(segs, 0.5, true);
    t.approx(mid.rgb[0], 63, 2);
    t.approx(mid.rgb[1], 63, 2);
    t.approx(mid.rgb[2],  0, 2);
});

test('sampleSegs: interp at boundaries picks stop', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    t.eq(XoneK3.sampleSegs(segs, 0, true).rgb, [127, 0, 0]);
    t.eq(XoneK3.sampleSegs(segs, 1, true).rgb, [0, 127, 0]);
});

test('sampleSegs: empty / null → null', function(t) {
    t.eq(XoneK3.sampleSegs(null, 0.5, true), null);
    t.eq(XoneK3.sampleSegs([],   0.5, true), null);
});

test('sampleSegs: out-of-range t clamps', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    t.eq(XoneK3.sampleSegs(segs, -1, false).rgb, [127, 0, 0]);
    t.eq(XoneK3.sampleSegs(segs,  2, false).rgb, [0, 127, 0]);
});

// ── resolveScheme ────────────────────────────────────────────

test('resolveScheme: string name', function(t) {
    var s = XoneK3.resolveScheme('coMatch');
    t.ok(s);
    t.ok(Array.isArray(s.colors));
});

test('resolveScheme: unknown name → null', function(t) {
    t.eq(XoneK3.resolveScheme('noSuchScheme'), null);
});

test('resolveScheme: object with colors fills defaults', function(t) {
    var s = XoneK3.resolveScheme({colors: [[127,0,0]]});
    t.eq(s.brightness,  127);
    t.eq(s.interp,      true);
    t.eq(s.calibration, true);
    t.eq(s.reverse,     false);
});

test('resolveScheme: object without colors → null', function(t) {
    var before = _printLog.length;
    t.eq(XoneK3.resolveScheme({markerWidth: 2}), null);
    t.ok(_printLog.length > before);
});

test('resolveScheme: patch syntax → null', function(t) {
    var before = _printLog.length;
    t.eq(XoneK3.resolveScheme({patch: ['x'], colors: [[0,0,0]]}), null);
    t.ok(_printLog.length > before);
});

test('resolveScheme: caches by string name', function(t) {
    var a = XoneK3.resolveScheme('coMatch');
    var b = XoneK3.resolveScheme('coMatch');
    t.eq(a, b);
});

// ── compileScheme ─────────────────────────────────────────────

test('compileScheme: bare palette name', function(t) {
    var c = XoneK3.compileScheme('magenta');
    t.eq(c.on.length, 1);
    t.eq(c.on[0].color.rgb, [127, 0, 127]);
});

test('compileScheme: object with colors', function(t) {
    t.eq(XoneK3.compileScheme({colors: [[127,0,0], [0,0,127]]}).on.length, 2);
});

test('compileScheme: cached by string name', function(t) {
    t.eq(XoneK3.compileScheme('coMatch'), XoneK3.compileScheme('coMatch'));
});

test('compileScheme: overrides don\'t pollute cache', function(t) {
    var base  = XoneK3.compileScheme('coMatch');
    var over  = XoneK3.compileScheme('coMatch', {markerWidth: 99});
    t.eq(over.markerWidth, 99);
    t.eq(XoneK3.compileScheme('coMatch').markerWidth, base.markerWidth);
});

test('compileScheme: unknown name → null', function(t) {
    t.eq(XoneK3.compileScheme('noSuchScheme'), null);
});

test('compileScheme: beat enabled false → null', function(t) {
    var c = XoneK3.compileScheme({
        colors: [[127,0,0]],
        beat: {enabled: false, color: 'red'}
    });
    t.eq(c.beat, null);
});

test('compileScheme: beat enabled default preserved', function(t) {
    var c = XoneK3.compileScheme({
        colors: [[127,0,0]],
        beat: {color: 'red'}
    });
    t.ok(c.beat);
    t.eq(c.beat.color, 'red');
});

test('compileScheme: marker parsed', function(t) {
    var c = XoneK3.compileScheme({
        colors: [[127,0,0]],
        markerColor: 'white',
        markerWidth: 4
    });
    t.ok(c.marker);
    t.eq(c.marker.rgb, [127, 127, 127]);
    t.eq(c.markerWidth, 4);
});

test('compileScheme: coScheme null disables', function(t) {
    t.eq(XoneK3.compileScheme({colors: [[127,0,0]], coScheme: null}).co, null);
});

test('compileScheme: coScheme default is coMatch', function(t) {
    t.ok(XoneK3.compileScheme({colors: [[127,0,0]]}).co);
});

test('compileScheme: off-ramp generated by default', function(t) {
    var c = XoneK3.compileScheme({colors: [[127,0,0]]});
    t.eq(c.off.length, 1);
    t.eq(c.off[0].color.brightness, XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF);
});

test('_generateOff: drops brightness to default off', function(t) {
    var segs = XoneK3._buildSegments([[127,0,0], [0,127,0]], null, 127);
    var off = XoneK3._generateOff(segs);
    t.eq(off.length, 2);
    for (var i = 0; i < off.length; i++) {
        t.eq(off[i].color.brightness, XoneK3.DEFAULT_RGB_BRIGHTNESS_OFF);
    }
});

// ── markerHit / scaleTarget ───────────────────────────────────

test('markerHit: inside band', function(t) {
    var c = {marker: {rgb: [127,0,0]}, markerPosition: 63.5, markerWidth: 20};
    t.ok(XoneK3.markerHit(c, 0));
    t.ok(XoneK3.markerHit(c, 0.1));
});

test('markerHit: outside band', function(t) {
    var c = {marker: {rgb: [127,0,0]}, markerPosition: 63.5, markerWidth: 20};
    t.notOk(XoneK3.markerHit(c,  0.5));
    t.notOk(XoneK3.markerHit(c, -0.5));
});

test('markerHit: zero width → no hit', function(t) {
    var c = {marker: {rgb: [127,0,0]}, markerPosition: 63.5, markerWidth: 0};
    t.notOk(XoneK3.markerHit(c, 0));
});

test('markerHit: no marker → no hit', function(t) {
    var c = {marker: null, markerPosition: 63.5, markerWidth: 20};
    t.notOk(XoneK3.markerHit(c, 0));
});

test('scaleTarget: null passthrough', function(t) {
    t.eq(XoneK3.scaleTarget(null, 1), null);
    t.eq(XoneK3.scaleTarget(null, 2), null);
});

test('scaleTarget: scale 1 identity', function(t) {
    t.eq(XoneK3.scaleTarget(0.5, 1), 0.5);
});

test('scaleTarget: scales', function(t) {
    t.eq(XoneK3.scaleTarget(0.5, 2), 1.0);
});

test('scaleTarget: non-number scale → identity', function(t) {
    t.eq(XoneK3.scaleTarget(0.5, undefined), 0.5);
    t.eq(XoneK3.scaleTarget(0.5, 'x'),       0.5);
});