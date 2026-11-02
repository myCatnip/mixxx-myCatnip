'use strict';

var H = require('./helpers');

// Internal audit paths: _validateBindings, _auditSnapshotFields,
// _buildCsFromStateClosure, CAT.fxScheme memoization.

// ── _validateBindings ─────────────────────────────────────

test('_validateBindings: clean config → no output', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {group: '[Channel1]', inKey: 'play'});
    c._validated = false;
    _printLog.length = 0;
    c._validateBindings();
    t.eq(_printLog.length, 0);
});

test('_validateBindings: unknown token prints warning', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {group: '$BOGUS$', inKey: 'play'});
    c._validated = false;
    _printLog.length = 0;
    c._validateBindings();
    t.contains(_printLog.join('\n'), 'unknown token $BOGUS$');
});

test('_validateBindings: same unknown token in two bindings → two warnings', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {group: '$BOGUS$', inKey: 'play'});
    c._applyBinding('press1', {group: '$BOGUS$', inKey: 'play'});
    c._validated = false;
    _printLog.length = 0;
    c._validateBindings();
    var hits = _printLog.join('\n').split('unknown token $BOGUS$').length - 1;
    t.eq(hits, 2);
});

test('_validateBindings: unknown token in schemeFromState.co warns', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {
        group: '[Channel1]', inKey: 'play',
        colorScheme: {
            scheme: 'red',
            schemeFromState: {co: '$BAD$', group: '[G]'}
        }
    });
    c._validated = false;
    _printLog.length = 0;
    c._validateBindings();
    t.contains(_printLog.join('\n'), 'unknown token $BAD$');
});

test('_validateBindings: runs once per controller', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {group: '$BOGUS$', inKey: 'play'});
    c._validated = false;
    _printLog.length = 0;
    c._validateBindings();
    var first = _printLog.length;
    t.ok(first > 0);
    // Second call short-circuits on _validated.
    c._validateBindings();
    t.eq(_printLog.length, first);
});

// ── _auditSnapshotFields ──────────────────────────────────

test('_auditSnapshotFields: clean state → no warnings', function(t) {
    XoneK3._debugPrintsOn = true;
    _printLog.length = 0;
    XoneK3._auditSnapshotFields();
    XoneK3._debugPrintsOn = false;
    t.eq(_printLog.length, 0);
});

test('_auditSnapshotFields: unclassified field warns', function(t) {
    var orig = XoneK3._bindingDefaults;
    XoneK3._bindingDefaults = function() {
        var d = orig();
        d._testNewField = null;
        return d;
    };
    XoneK3._debugPrintsOn = true;
    _printLog.length = 0;
    XoneK3._auditSnapshotFields();
    XoneK3._debugPrintsOn = false;
    XoneK3._bindingDefaults = orig;
    t.contains(_printLog.join('\n'),
        'reset-able Binding field "_testNewField" not classified');
});

test('_auditSnapshotFields: silent when debug off', function(t) {
    var orig = XoneK3._bindingDefaults;
    XoneK3._bindingDefaults = function() {
        var d = orig();
        d._testNewField = null;
        return d;
    };
    _printLog.length = 0;
    XoneK3._auditSnapshotFields();
    XoneK3._bindingDefaults = orig;
    t.eq(_printLog.length, 0);
});

test('_auditSnapshotFields: ignored field does not warn', function(t) {
    XoneK3._debugPrintsOn = true;
    _printLog.length = 0;
    XoneK3._auditSnapshotFields();
    XoneK3._debugPrintsOn = false;
    t.notOk(_printLog.join('\n').indexOf('_shutdownHoldTimer') !== -1);
});

// ── _buildCsFromStateClosure ──────────────────────────────

test('_buildCsFromStateClosure: co source reads live value', function(t) {
    var c = H.ctrl();
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        co: 'enabled',
        group: '[EffectRack1_EffectUnit1]',
        map: {0: 'red', 1: 'blue'}
    });
    engine._set('[EffectRack1_EffectUnit1]', 'enabled', 1);
    engine._trigger('[EffectRack1_EffectUnit1]', 'enabled', 1);
    t.eq(closure(), 'blue');
    engine._set('[EffectRack1_EffectUnit1]', 'enabled', 0);
    engine._trigger('[EffectRack1_EffectUnit1]', 'enabled', 0);
    t.eq(closure(), 'red');
});

test('_buildCsFromStateClosure: state dot path', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'B';
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        state: 'activeDeck',
        map: {A: 'red', B: 'blue'}
    });
    t.eq(closure(), 'blue');
});

test('_buildCsFromStateClosure: list clamps high index', function(t) {
    var c = H.ctrl();
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        co: 'x', group: '[TestGroup]',
        list: ['a', 'b', 'c']
    });
    engine._set('[TestGroup]', 'x', 100);
    engine._trigger('[TestGroup]', 'x', 100);
    t.eq(closure(), 'c');
});

test('_buildCsFromStateClosure: list clamps low index', function(t) {
    var c = H.ctrl();
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        co: 'x', group: '[TestGroup]',
        list: ['a', 'b', 'c']
    });
    engine._set('[TestGroup]', 'x', -5);
    t.eq(closure(), 'a');
});

test('_buildCsFromStateClosure: list floors fractional index', function(t) {
    var c = H.ctrl();
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        co: 'x', group: '[TestGroup]',
        list: ['a', 'b', 'c', 'd']
    });
    engine._set('[TestGroup]', 'x', 2.9);
    engine._trigger('[TestGroup]', 'x', 2.9);
    t.eq(closure(), 'c');
});

test('_buildCsFromStateClosure: map function values called per read', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    var calls = 0;
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        state: 'activeDeck',
        map: {A: function() { calls++; return 'red'; }}
    });
    closure();
    closure();
    t.eq(calls, 2);
});

test('_buildCsFromStateClosure: state wins over co, warns', function(t) {
    var c = H.ctrl();
    c.activeDeck = 'A';
    _printLog.length = 0;
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        state: 'activeDeck',
        co: 'x', group: '[TestGroup]',
        map: {A: 'red'}
    });
    t.contains(_printLog.join('\n'), 'has both state and co');
    t.eq(closure(), 'red');
});

test('_buildCsFromStateClosure: no state, no co → null + warn', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    var closure = c._buildCsFromStateClosure(c.bindings.button0_0, {
        map: {A: 'red'}
    });
    t.eq(closure, null);
    t.contains(_printLog.join('\n'), 'neither state nor co');
});

test('_buildCsFromStateClosure: co opens a connection', function(t) {
    var c = H.ctrl();
    var b = c.bindings.button0_0;
    c._buildCsFromStateClosure(b, {
        co: 'enabled', group: '[EffectRack1_EffectUnit1]'
    });
    t.ok(b._csFromStateConn);
    var conns = engine._conns['[EffectRack1_EffectUnit1]|enabled'] || [];
    t.eq(conns.length, 1);
});

// ── CAT.fxScheme memoization ──────────────────────────────

test('fxScheme: memoized by THEME value', function(t) {
    var orig = XoneK3.THEME.fx[1];
    var a = XoneK3.CAT.fxScheme(1);
    var b = XoneK3.CAT.fxScheme(1);
    t.eq(a, b);
    XoneK3.THEME.fx[1] = 'red';
    var c2 = XoneK3.CAT.fxScheme(1);
    t.neq(a, c2);
    XoneK3.THEME.fx[1] = orig;
});

test('fxScheme: distinct THEME values → distinct objects', function(t) {
    var orig2 = XoneK3.THEME.fx[2];
    var orig4 = XoneK3.THEME.fx[4];
    XoneK3.THEME.fx[2] = 'cyan';
    XoneK3.THEME.fx[4] = 'magenta';
    var a = XoneK3.CAT.fxScheme(2);
    var b = XoneK3.CAT.fxScheme(4);
    t.neq(a, b);
    XoneK3.THEME.fx[2] = orig2;
    XoneK3.THEME.fx[4] = orig4;
});

test('fxScheme: same scheme object returned across calls', function(t) {
    var a = XoneK3.CAT.fxScheme(3);
    var b = XoneK3.CAT.fxScheme(3);
    t.eq(a, b);
});