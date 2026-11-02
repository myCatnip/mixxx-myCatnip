'use strict';

// Pure functions from lib-core.

// ── parseNum ──────────────────────────────────────────────────

test('parseNum: number passthrough', function(t) {
    t.eq(XoneK3.parseNum(0.25), 0.25);
    t.eq(XoneK3.parseNum(16), 16);
    t.eq(XoneK3.parseNum(-5), -5);
});

test('parseNum: fraction strings', function(t) {
    t.eq(XoneK3.parseNum('1/4'),  0.25);
    t.eq(XoneK3.parseNum('1/2'),  0.5);
    t.eq(XoneK3.parseNum('3/4'),  0.75);
    t.eq(XoneK3.parseNum('1/16'), 1 / 16);
});

test('parseNum: decimal strings', function(t) {
    t.eq(XoneK3.parseNum('0.5'),  0.5);
    t.eq(XoneK3.parseNum('16'),   16);
    t.eq(XoneK3.parseNum(' -3 '), -3);
});

test('parseNum: garbage → NaN', function(t) {
    t.ok(isNaN(XoneK3.parseNum('')));
    t.ok(isNaN(XoneK3.parseNum('abc')));
    t.ok(isNaN(XoneK3.parseNum(null)));
    t.ok(isNaN(XoneK3.parseNum(undefined)));
    t.ok(isNaN(XoneK3.parseNum({})));
});

// ── readPath ──────────────────────────────────────────────────

test('readPath: single key', function(t) {
    t.eq(XoneK3.readPath({a: 1}, 'a'), 1);
});

test('readPath: dot path', function(t) {
    t.eq(XoneK3.readPath({a: {b: 2}}, 'a.b'), 2);
    t.eq(XoneK3.readPath({a: {b: {c: 3}}}, 'a.b.c'), 3);
});

test('readPath: missing → undefined', function(t) {
    t.eq(XoneK3.readPath({a: {}}, 'a.b.c'), undefined);
    t.eq(XoneK3.readPath(null, 'a'), undefined);
    t.eq(XoneK3.readPath(undefined, 'a'), undefined);
});

// ── _selProp ──────────────────────────────────────────────────

test('_selProp: all four slots', function(t) {
    t.eq(XoneK3._selProp('deck', 'A'), 'selectedDeckA');
    t.eq(XoneK3._selProp('deck', 'B'), 'selectedDeckB');
    t.eq(XoneK3._selProp('fx',   'A'), 'selectedFxA');
    t.eq(XoneK3._selProp('fx',   'B'), 'selectedFxB');
});

// ── _stableStringify ──────────────────────────────────────────

test('_stableStringify: key order irrelevant', function(t) {
    t.eq(XoneK3._stableStringify({a: 2, b: 1}),
         XoneK3._stableStringify({b: 1, a: 2}));
});

test('_stableStringify: nested key order irrelevant', function(t) {
    var a = XoneK3._stableStringify({x: {y: 1, z: 2}, w: [3, 4]});
    var b = XoneK3._stableStringify({w: [3, 4], x: {z: 2, y: 1}});
    t.eq(a, b);
});

test('_stableStringify: array order preserved', function(t) {
    t.neq(XoneK3._stableStringify([1, 2]),
          XoneK3._stableStringify([2, 1]));
});

test('_stableStringify: primitives', function(t) {
    t.eq(XoneK3._stableStringify(42),        '42');
    t.eq(XoneK3._stableStringify('x'),       '"x"');
    t.eq(XoneK3._stableStringify(true),      'true');
    t.eq(XoneK3._stableStringify(null),      'null');
    t.eq(XoneK3._stableStringify(undefined), 'undefined');
});

test('_stableStringify: function uses _funcId', function(t) {
    var f = function() {};
    var s = XoneK3._stableStringify(f);
    t.ok(s.indexOf('fn:') === 0);
    t.contains(s, XoneK3._funcId(f));
});

// ── _funcId ───────────────────────────────────────────────────

test('_funcId: non-function → empty string', function(t) {
    t.eq(XoneK3._funcId('string'),  '');
    t.eq(XoneK3._funcId(42),        '');
    t.eq(XoneK3._funcId(null),      '');
    t.eq(XoneK3._funcId(undefined), '');
});

test('_funcId: stable per function identity', function(t) {
    var f = function() {};
    t.eq(XoneK3._funcId(f), XoneK3._funcId(f));
});

test('_funcId: distinct for distinct functions', function(t) {
    t.neq(XoneK3._funcId(function() {}),
          XoneK3._funcId(function() {}));
});

// ── _hashBinding ──────────────────────────────────────────────

test('_hashBinding: identical cfgs hash same', function(t) {
    t.eq(XoneK3._hashBinding({group: 'g', inKey: 'i'}),
         XoneK3._hashBinding({group: 'g', inKey: 'i'}));
});

test('_hashBinding: different group differs', function(t) {
    t.neq(XoneK3._hashBinding({group: 'g1', inKey: 'i'}),
          XoneK3._hashBinding({group: 'g2', inKey: 'i'}));
});

test('_hashBinding: colorScheme key order irrelevant', function(t) {
    t.eq(XoneK3._hashBinding({group: 'g', inKey: 'i',
                              colorScheme: {scheme: 'x', knob: 'y'}}),
         XoneK3._hashBinding({group: 'g', inKey: 'i',
                              colorScheme: {knob: 'y', scheme: 'x'}}));
});

test('_hashBinding: func identity via _funcId', function(t) {
    var f1 = function() {};
    var f2 = function() {};
    t.neq(XoneK3._hashBinding({func: f1}),
          XoneK3._hashBinding({func: f2}));
    t.eq(XoneK3._hashBinding({func: f1}),
         XoneK3._hashBinding({func: f1}));
});

test('_hashBinding: non-function func does not throw', function(t) {
    t.ok(typeof XoneK3._hashBinding({func: 'typo'}) === 'string');
});

test('_hashBinding: undefined == omitted', function(t) {
    t.eq(XoneK3._hashBinding({group: 'g', inKey: 'i'}),
         XoneK3._hashBinding({group: 'g', inKey: 'i', outKey: undefined}));
});

test('_hashBinding: null / undefined cfg → null', function(t) {
    t.eq(XoneK3._hashBinding(null),      null);
    t.eq(XoneK3._hashBinding(undefined), null);
});