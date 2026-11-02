'use strict';

var H = require('./helpers');

// _applyBinding / _unbind lifecycle, soft takeover rearm,
// LED blanking on unbind, hash skip on identical cfg.

// ── bind / unbind basics ─────────────────────────────────────

test('rebind: replaces binding, LED updates', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    });
    H.clearLeds();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'green', on: true}
    });
    var led = H.led(c, 'button0_0');
    t.rgb(led, 0, 127, 0);
});

test('unbind: nulls the binding and blanks the LED', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    });
    H.clearLeds();
    c._applyBinding('button0_0', null);
    var led = H.led(c, 'button0_0');
    t.rgb(led, 0, 0, 0);
    t.hw(led, 0);
    t.eq(c.bindings.button0_0._rawCfg, null);
    t.eq(c.bindings.button0_0._csActive, false);
});

test('non-function func: warn, no crash, _func undefined', function(t) {
    var c = H.ctrl();
    c._applyBinding('press0', {
        group: '[Channel1]', inKey: 'play',
        func: 'not-a-function'
    });
    t.eq(c.bindings.press0._func, undefined);
});

// ── soft takeover ────────────────────────────────────────────

test('soft takeover: rearm on new group', function(t) {
    var c = H.ctrl();
    c._applyBinding('fader0', {group: '[Channel1]', inKey: 'volume'});
    engine._st = [];
    c._applyBinding('fader0', {group: '[Channel2]', inKey: 'volume'});
    t.eq(engine._st.length, 2);
    t.eq(engine._st[0], ['enable', '[Channel2]', 'volume', false]);
    t.eq(engine._st[1], ['enable', '[Channel2]', 'volume', true]);
});

test('soft takeover: unbind fires ignore-next-value', function(t) {
    var c = H.ctrl();
    c._applyBinding('fader0', {group: '[Channel1]', inKey: 'volume'});
    engine._st = [];
    c._applyBinding('fader0', null);
    t.eq(engine._st.length, 1);
    t.eq(engine._st[0], ['ignore', '[Channel1]', 'volume']);
});

test('soft takeover: no rearm when group/inKey unchanged', function(t) {
    var c = H.ctrl();
    c._applyBinding('fader0', {group: '[Channel1]', inKey: 'volume'});
    engine._st = [];
    c._applyBinding('fader0', {group: '[Channel1]', inKey: 'volume'});
    t.eq(engine._st.length, 0);
});

// ── hash skip ────────────────────────────────────────────────

test('_applyResolved: no rebind on identical cfg', function(t) {
    var c = H.ctrl();
    var cfg = {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    };
    c._applyResolved({button0_0: cfg});
    H.clearLeds();
    c._applyResolved({button0_0: cfg});
    t.eq(midi._sysex.length, 0);
});

test('_applyResolved: rebind on changed cfg', function(t) {
    var c = H.ctrl();
    c._applyResolved({button0_0: {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    }});
    H.clearLeds();
    c._applyResolved({button0_0: {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'blue', on: true}
    }});
    t.rgb(H.led(c, 'button0_0'), 0, 0, 127);
});

test('_applyResolved: removed bindings get unbound', function(t) {
    var c = H.ctrl();
    c._applyResolved({button0_0: {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    }});
    H.clearLeds();
    c._applyResolved({});
    var led = H.led(c, 'button0_0');
    t.rgb(led, 0, 0, 0);
    t.hw(led, 0);
});

// ── observers on input dispatch ──────────────────────────────

test('input: fires binding func', function(t) {
    var c = H.ctrl();
    var seen = 0;
    c._applyBinding('press0', {
        func: function() { seen++; }
    });
    H.press(c, 'press0');
    t.eq(seen, 1);
});

test('input: func args passed through', function(t) {
    var c = H.ctrl();
    var captured = null;
    c._applyBinding('press0', {
        func: function(args) { captured = args; },
        args: ['a', 'b']
    });
    H.press(c, 'press0');
    t.eq(captured, ['a', 'b']);
});

test('_refreshBinding: throwing _refresh does not propagate', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: { scheme: 'red', on: true }
    });
    // Shadow _refresh on the instance so it throws when called.
    // Real callers only reach _refreshBinding via the layer-arm
    // refresh path; a binding is free to throw here.
    c.bindings.button0_0._refresh = function() { throw new Error('boom'); };

    XoneK3._warned = {};
    _printLog.length = 0;
    var threw = false;
    try { c._refreshBinding('button0_0'); }
    catch (e) { threw = true; }
    t.notOk(threw, '_refreshBinding must not propagate');
    t.contains(_printLog.join('\n'), '_refreshBinding: button0_0 threw: boom');
});

test('_refreshBinding: unknown binding no-op', function(t) {
    var c = H.ctrl();
    c._refreshBinding('noSuchBinding');
});

// ── _refresh fallback (outKey, no colorScheme) ──────────────

test('_refresh: outKey-only off-frame sends black', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl'
        // No colorScheme → _refresh takes the fallback branch
    });
    engine._set('[Channel1]', 'pfl', 0);
    H.clearLeds(c);
    c.bindings.button0_0._refresh();
    var led = H.led(c, 'button0_0');
    t.ok(led, 'should have sent a frame');
    t.eq(led.r,  0);
    t.eq(led.g,  0);
    t.eq(led.b,  0);
    t.eq(led.hw, 0);
});

test('_refresh: outKey-only on-frame sends white', function(t) {
    var c = H.ctrl();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl'
    });
    engine._set('[Channel1]', 'pfl', 1);
    H.clearLeds(c);
    c.bindings.button0_0._refresh();
    var led = H.led(c, 'button0_0');
    t.eq(led.r,  127);
    t.eq(led.g,  127);
    t.eq(led.b,  127);
    t.eq(led.hw, 127);
});

// ── _applyBinding skipRefresh contract ──────────────────────

test('_applyBinding: skipRefresh true → no immediate refresh', function(t) {
    var c = H.ctrl();
    H.clearLeds(c);
    var refreshed = 0;
    var orig = c.bindings.button0_0._refresh.bind(c.bindings.button0_0);
    c.bindings.button0_0._refresh = function() { refreshed++; return orig(); };

    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: { scheme: 'red', on: true }
    }, undefined, true);

    t.eq(refreshed, 0, 'skipRefresh must not refresh');
});

test('_applyBinding: skipRefresh false → refresh fires', function(t) {
    var c = H.ctrl();
    H.clearLeds(c);
    var refreshed = 0;
    var orig = c.bindings.button0_0._refresh.bind(c.bindings.button0_0);
    c.bindings.button0_0._refresh = function() { refreshed++; return orig(); };

    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: { scheme: 'red', on: true }
    }, undefined, false);

    t.ok(refreshed > 0, 'refresh should fire when skipRefresh is false');
});

// ── shutdown suppresses captured release ────────────────────

test('shutdown: held transaction does not fire captured release', function(t) {
    var c = H.ctrl();
    var fired = [];
    c._applyBinding('press0', {
        type: 'push',
        func: function(args, ch, cc, v) { fired.push(v); }
    });

    H.press(c, 'press0');
    t.eq(fired, [127], 'press fired');

    c.shutdown();            // _shuttingDown set
    H.release(c, 'press0');  // short-circuited by _shuttingDown guard
    t.eq(fired, [127], 'release after shutdown must be suppressed');
});