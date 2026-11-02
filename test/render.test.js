'use strict';

var H = require('./helpers');

// _refreshColorScheme: static + deviation + marker + beat.
// SYSEX_THROTTLE_MS is 0 in tests, so LED writes hit midi.sendSysexMsg
// synchronously. Read the last with H.led(ctrl, name).
//
// `on:` is true, false, or a conditional object. Bare booleans
// are the unconditional forms — always-lit / always-off-ramp.

// Setup helper — reset LED history, ensure clean mock state.
function fresh(opts) {
    var c = H.ctrl(opts);
    H.clearLeds();
    return c;
}

// Register a deterministic 2-stop scheme once.
XoneK3.SCHEMES.linearRedBlue = {
    colors: [[127, 0, 0], [0, 0, 127]],
    markerWidth: 0,
    coScheme: null,
    calibration: false
};

// ── Static render ─────────────────────────────────────────────

test('static: on: true → on colour', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red', on: true}
    });
    var led = H.led(c, 'button0_0');
    t.rgb(led, 127, 0, 0);
    t.hw(led, 110);
});

test('static: on: false → off-ramp brightness even with outKey', function(t) {
    var c = fresh();
    engine._set('[Channel1]', 'pfl', 1);   // outKey would read 1
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl', outKey: 'pfl',
        colorScheme: {scheme: 'red', on: false}
    });
    t.hw(H.led(c, 'button0_0'), 12);
});

test('static: no on, no outKey → off-ramp brightness', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red'}
    });
    t.hw(H.led(c, 'button0_0'), 12);
});

test('static: scheme on-brightness', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red, 100', on: true}
    });
    t.hw(H.led(c, 'button0_0'), 100);
});

test('static: scheme off-brightness', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20'}
    });
    t.hw(H.led(c, 'button0_0'), 20);
});

test('static: on.state reflects isShifted live', function(t) {
    var c = fresh();
    c.isShifted = false;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20', on: {state: 'isShifted'}}
    });
    t.hw(H.led(c, 'button0_0'), 20);
    c.isShifted = true;
    H.clearLeds();
    c.bindings.button0_0._refresh();
    t.hw(H.led(c, 'button0_0'), 100);
});

test('static: on.state equals strict', function(t) {
    var c = fresh();
    c.activeDeck = 'A';
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'red, 100, 20', on: {state: 'activeDeck', equals: 'B'}}
    });
    t.hw(H.led(c, 'button0_0'), 20);
    c.activeDeck = 'B';
    H.clearLeds();
    c.bindings.button0_0._refresh();
    t.hw(H.led(c, 'button0_0'), 100);
});

test('static: multi-stop scheme renders ramp[0]', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'linearRedBlue', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
});

// ── Deviation render ─────────────────────────────────────────

test('deviation: boot-white before knob reports', function(t) {
    var c = fresh();
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'linearRedBlue', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 127, 127, 127);
    t.hw(H.led(c, 'button0_0'), 127);
});

test('deviation: knob at first stop → red', function(t) {
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.25;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'linearRedBlue', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0, 2);
});

test('deviation: knob at last stop → blue', function(t) {
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.75;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'linearRedBlue', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 0, 0, 127, 2);
});

test('deviation: knob mid ramps interpolate', function(t) {
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.5;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'linearRedBlue', on: true}
    });
    var led = H.led(c, 'button0_0');
    t.approx(led.r, 63, 3);
    t.approx(led.b, 63, 3);
});

test('deviation: reverse flips direction', function(t) {
    XoneK3.SCHEMES.revTest = {
        colors: [[127,0,0], [0,0,127]],
        markerWidth: 0, coScheme: null, calibration: false, reverse: true
    };
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.25;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'revTest', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 0, 0, 127, 2);
});

// ── Marker band ──────────────────────────────────────────────

test('deviation: marker hit shows marker colour', function(t) {
    XoneK3.SCHEMES.markerTest = {
        colors: [[127, 0, 0], [0, 0, 127]],
        markerColor: [0, 127, 0, 90],
        markerPosition: 63.5, markerWidth: 20,
        coScheme: null, calibration: false
    };
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.5;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'markerTest', on: true}
    });
    t.rgb(H.led(c, 'button0_0'), 0, 127, 0);
    t.hw(H.led(c, 'button0_0'), 90);
});

test('deviation: marker miss falls through to ramp', function(t) {
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.05;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'markerTest', on: true}
    });
    var led = H.led(c, 'button0_0');
    t.ok(led.r > led.g);
});

// ── Beat integration (via render) ────────────────────────────

test('beat: skip on half → no LED write', function(t) {
    XoneK3.SCHEMES.beatHalf = {
        colors: [[127, 0, 0]],
        beat: {half: true, color: 'blue', deck: 1}
    };
    var c = fresh();
    c._decks[1].hasBeat = true;
    c._decks[1].count = 3;
    c._decks[1].active = true;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {scheme: 'beatHalf', on: true}
    });
    var led = H.led(c, 'button0_0');
    t.ok(!(led && led.r === 0 && led.g === 0 && led.b === 0x7F && led.hw === 0x7F),
         'BEAT_HOLD leaked a paint');
});

// ── off-ramp generation ──────────────────────────────────────

test('deviation: off-ramp generated from on when isOn=0', function(t) {
    var c = fresh();
    c.bindings.knob0_0._normalized = 0.25;
    c._applyBinding('button0_0', {
        group: '[Channel1]', inKey: 'pfl',
        colorScheme: {knob: 'knob0_0', scheme: 'linearRedBlue'}
    });
    // No on: → isOn = 0 → off-ramp → red at default off brightness
    t.rgb(H.led(c, 'button0_0'), 127, 0, 0);
    t.hw(H.led(c, 'button0_0'), 12);
});