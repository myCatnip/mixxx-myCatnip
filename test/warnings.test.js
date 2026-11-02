'use strict';

var H = require('./helpers');

// _warnOnce dedup + every warn-once call site.

// ── _warnOnce semantics ────────────────────────────────────

test('_warnOnce: same key fires once', function(t) {
    _printLog.length = 0;
    XoneK3._warnOnce('k1', 'first');
    XoneK3._warnOnce('k1', 'second');
    t.eq(_printLog.length, 1);
});

test('_warnOnce: different keys fire separately', function(t) {
    _printLog.length = 0;
    XoneK3._warnOnce('k1', 'first');
    XoneK3._warnOnce('k2', 'second');
    t.eq(_printLog.length, 2);
});

test('_warnOnce: clearing _warned re-arms', function(t) {
    _printLog.length = 0;
    XoneK3._warnOnce('k1', 'first');
    XoneK3._warned = {};
    XoneK3._warnOnce('k1', 'second');
    t.eq(_printLog.length, 2);
});

test('_warnOnce: message prefixed with [k3]', function(t) {
    _printLog.length = 0;
    XoneK3._warnOnce('k1', 'my message');
    t.contains(_printLog[0], '[k3] my message');
});

// ── colorScheme warning paths ──────────────────────────────

test('missing scheme warns once per binding', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {colorScheme: {knob: 'knob0_0'}});
    var n1 = _printLog.length;
    t.ok(n1 > 0);
    c._applyBinding('press0', {colorScheme: {knob: 'knob0_0'}});
    t.eq(_printLog.length, n1);
});

// `on:` is true / false / conditional object. Bare booleans are
// valid and silent. Arrays and other shapes still warn. `always`
// and `never` are no longer recognised fields.

test('on: true → no warning', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: true}
    });
    t.notOk(_printLog.join('\n').indexOf('colorScheme.on') !== -1,
            'on: true is valid — no warning expected');
});

test('on: false → no warning', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: false}
    });
    t.notOk(_printLog.join('\n').indexOf('colorScheme.on') !== -1,
            'on: false is valid — no warning expected');
});

test('on: array → warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: [true]}
    });
    t.ok(_printLog.join('\n').indexOf('must be true, false, or a conditional object') !== -1);
});

test('on: string → warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: 'yes'}
    });
    t.ok(_printLog.join('\n').indexOf('must be true, false, or a conditional object') !== -1);
});

test('on: {always: true} → unknown field "always"', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: {always: true}}
    });
    var joined = _printLog.join('\n');
    t.ok(joined.indexOf('unknown field "always"') !== -1,
         'always is no longer a recognised field');
    t.ok(joined.indexOf('no recognised fields') !== -1,
         'empty after dropping unknown field');
});

test('on: {never: true} → unknown field "never"', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: {never: true}}
    });
    t.ok(_printLog.join('\n').indexOf('unknown field "never"') !== -1);
});

test('unknown field in on: warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: {state: 'isShifted', fooBar: 1}}
    });
    t.ok(_printLog.join('\n').indexOf('unknown field "fooBar"') !== -1);
});

test('empty on: object warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: {}}
    });
    t.ok(_printLog.join('\n').indexOf('no recognised fields') !== -1);
});

test('on.co without a resolvable group warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'red', on: {co: 'enabled'}}
    });
    t.ok(_printLog.join('\n').indexOf('has no group') !== -1);
});

test('schemeFromState with both state and co warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {schemeFromState: {state: 'activeDeck', co: 'enabled'}}
    });
    t.ok(_printLog.join('\n').indexOf('has both state and co') !== -1);
});

test('schemeFromState with neither warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {schemeFromState: {map: {A: 'red'}}}
    });
    t.ok(_printLog.join('\n').indexOf('neither state nor co') !== -1);
});

test('knob: pointing at missing control warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('button0_0', {
        colorScheme: {knob: 'noSuchKnob', scheme: 'red'}
    });
    t.ok(_printLog.join('\n').indexOf('knob "noSuchKnob" not found') !== -1);
});

test('unresolvable scheme warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: {scheme: 'noSuchScheme'}
    });
    t.ok(_printLog.join('\n').indexOf('cannot resolve scheme') !== -1);
});

// ── func-type warning ─────────────────────────────────────

test('non-function func warns', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {func: 'not a function'});
    t.ok(_printLog.join('\n').indexOf('func must be a function reference') !== -1);
});

// ── scheme resolver warnings ──────────────────────────────

test('scheme patch syntax removed warns', function(t) {
    _printLog.length = 0;
    XoneK3.resolveScheme({patch: ['x'], colors: [[0,0,0]]});
    t.ok(_printLog.join('\n').indexOf('scheme patch syntax removed') !== -1);
});

test('scheme object with no colors warns', function(t) {
    _printLog.length = 0;
    XoneK3.resolveScheme({markerWidth: 2});
    t.ok(_printLog.join('\n').indexOf('scheme object has no colors') !== -1);
});

// ── composeScheme warnings ────────────────────────────────

test('composeScheme: unknown base warns', function(t) {
    // Fast path (string ref + no overrides) passes through
    // without checking existence. Force resolution via an
    // override.
    _printLog.length = 0;
    XoneK3.builders.composeScheme({scheme: 'noSuchScheme', marker: 'low'});
    t.ok(_printLog.join('\n').indexOf('composeScheme: scheme "noSuchScheme" not found') !== -1);
});

test('composeScheme: patch syntax warns', function(t) {
    _printLog.length = 0;
    XoneK3.builders.composeScheme({scheme: {patch: ['x']}});
    t.ok(_printLog.join('\n').indexOf('scheme patches are no longer supported') !== -1);
});

test('composeScheme: function returning null warns once', function(t) {
    _printLog.length = 0;
    var fn = function() { return null; };
    var wrapped = XoneK3.builders.composeScheme({scheme: fn});
    wrapped();
    wrapped();
    var n = _printLog.filter(function(s) {
        return s.indexOf('scheme function returned') !== -1;
    }).length;
    t.eq(n, 1);
});

// ── boot re-arms warnings ─────────────────────────────────

test('boot clears _warned', function(t) {
    XoneK3._warnOnce('k1', 'first');
    XoneK3.bootCat();
    t.notOk(XoneK3._warned['k1']);
});

// ── audit path only fires when debug on ───────────────────

test('_auditBindingCfg: silent when debug off', function(t) {
    var c = H.ctrl();
    _printLog.length = 0;
    c._applyBinding('press0', {fooBar: 1});
    t.notOk(_printLog.join('\n').indexOf('_BINDING_CFG_FIELDS') !== -1);
});

test('_auditBindingCfg: warns on unknown key when debug on', function(t) {
    var c = H.ctrl();
    XoneK3._debugPrintsOn = true;
    _printLog.length = 0;
    c._applyBinding('press0', {fooBar: 1});
    t.ok(_printLog.join('\n').indexOf('"fooBar" not in _BINDING_CFG_FIELDS') !== -1);
    XoneK3._debugPrintsOn = false;
});

test('_auditSnapshotFields: clean state produces no warnings', function(t) {
    XoneK3._debugPrintsOn = true;
    _printLog.length = 0;
    H.bootCat();
    var audit = _printLog.filter(function(s) {
        return s.indexOf('not classified for _snapshotBinding') !== -1;
    });
    t.eq(audit.length, 0);
    XoneK3._debugPrintsOn = false;
});

test('on: patchActive + equals warns', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: { scheme: 'red',
                       on: { patchActive: 'cue', equals: 1 } }
    });
    t.contains(_printLog.join('\n'),
        'comparators are ignored when patchActive is the source');
});

test('on: patchActive + contains warns', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: { scheme: 'red',
                       on: { patchActive: 'cue', contains: 'x' } }
    });
    t.contains(_printLog.join('\n'),
        'comparators are ignored when patchActive is the source');
});

test('on: patchActive alone does not warn', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    _printLog.length = 0;
    c._applyBinding('press0', {
        colorScheme: { scheme: 'red', on: { patchActive: 'cue' } }
    });
    t.notOk(_printLog.join('\n')
        .indexOf('comparators are ignored') !== -1);
});