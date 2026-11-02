'use strict';

// Direct tests of XoneK3.builders.composeScheme.

// ── bare string fast path ──────────────────────────────────

test('composeScheme: string + no overrides → string', function(t) {
    t.eq(XoneK3.builders.composeScheme({scheme: 'myCatnip'}), 'myCatnip');
});

test('composeScheme: null opts → base', function(t) {
    t.eq(XoneK3.builders.composeScheme(null, 'fallback'), 'fallback');
});

test('composeScheme: opts.scheme undefined falls to base', function(t) {
    t.eq(XoneK3.builders.composeScheme({}, 'fallback'), 'fallback');
});

test('composeScheme: both undefined → null', function(t) {
    t.eq(XoneK3.builders.composeScheme({}, undefined), null);
});

// ── string + overrides ─────────────────────────────────────

test('composeScheme: string + markerPosition → object', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', markerPosition: 42});
    t.eq(typeof s, 'object');
    t.eq(s.markerPosition, 42);
    t.ok(Array.isArray(s.colors));
});

test('composeScheme: base scheme values preserved', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', markerPosition: 42});
    t.eq(s.curve, -0.7);
    t.eq(s.markerWidth, 2);
});

test('composeScheme: override replaces, not merges', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', markerWidth: 10});
    t.eq(s.markerWidth, 10);   // base had 2
});

// ── marker shorthand ───────────────────────────────────────

test('composeScheme: marker → markerPosition', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', marker: 'low'});
    t.eq(s.markerPosition, 0);
});

test('composeScheme: marker: mid → 63.5', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', marker: 'mid'});
    t.eq(s.markerPosition, 63.5);
});

test('composeScheme: marker: high → 127', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', marker: 'high'});
    t.eq(s.markerPosition, 127);
});

test('composeScheme: marker: number passthrough', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'myCatnip', marker: 90});
    t.eq(s.markerPosition, 90);
});

test('composeScheme: markerPosition beats marker shorthand', function(t) {
    var s = XoneK3.builders.composeScheme({
        scheme: 'myCatnip', markerPosition: 42, marker: 'low'
    });
    t.eq(s.markerPosition, 42);
});

// ── object ref + overrides ─────────────────────────────────

test('composeScheme: object ref + overrides', function(t) {
    var s = XoneK3.builders.composeScheme({
        scheme: {colors: [[127,0,0]]},
        markerColor: 'red'
    });
    t.eq(s.markerColor, 'red');
    t.eq(s.colors[0][0], 127);
});

test('composeScheme: object ref no overrides returns copy', function(t) {
    var src = {colors: [[127,0,0]]};
    var s = XoneK3.builders.composeScheme({scheme: src});
    t.neq(s, src);
    t.eq(s.colors[0][0], 127);
});

// ── function ref (deferred) ────────────────────────────────

test('composeScheme: function ref → function', function(t) {
    var fn = function() { return 'myCatnip'; };
    var wrapped = XoneK3.builders.composeScheme({scheme: fn});
    t.eq(typeof wrapped, 'function');
    t.eq(wrapped(), 'myCatnip');
});

test('composeScheme: function ref + overrides composes per call', function(t) {
    var fn = function() { return 'myCatnip'; };
    var wrapped = XoneK3.builders.composeScheme({scheme: fn, marker: 'high'});
    var out = wrapped();
    t.eq(typeof out, 'object');
    t.eq(out.markerPosition, 127);
});

// ── edge cases ─────────────────────────────────────────────

test('composeScheme: unknown base warns and returns null', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 'noSuchScheme', marker: 'low'});
    t.eq(s, null);
});

test('composeScheme: patch syntax returns null', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: {patch: ['x']}});
    t.eq(s, null);
});

test('composeScheme: number scheme returns null', function(t) {
    var s = XoneK3.builders.composeScheme({scheme: 42});
    t.eq(s, null);
});

// ── marker helper ──────────────────────────────────────────

test('builders.marker: names + numbers', function(t) {
    t.eq(XoneK3.builders.marker('low'),  0);
    t.eq(XoneK3.builders.marker('mid'),  63.5);
    t.eq(XoneK3.builders.marker('high'), 127);
    t.eq(XoneK3.builders.marker(90),     90);
    t.eq(XoneK3.builders.marker(undefined), undefined);
});