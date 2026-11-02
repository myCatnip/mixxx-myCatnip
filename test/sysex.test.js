'use strict';

var H = require('./helpers');

// v1.1.0: K3 protocol and HAL live on XoneK3.HW_K3. The framework
// names (XoneK3.buildSysExLED, XoneK3.noteToLEDIndex,
// XoneK3.rgbToK2, XoneK3.idxToK2, XoneK3.sendK2Note) were removed
// at v1.1.0 and are not coming back — testing HW_K3.* directly is
// the correct surface.
//
// Transport choice is whole-controller (ctrl.sysex). The per-LED
// k2 flag and sendLED's k2Override arg were removed. K2-mode
// tests use ctrl.sysex = false on the controller instead.
//
// v1.2.0: ctrl.pacer(name) now takes an optional opts object with
// { sendFn, throttleMs }. HW_K3 supplies the sysex sender; a
// pacer created without a sendFn warns once and drops payloads.

// ── HW_K3 descriptor surface ────────────────────────────────

test('HW_K3: HAL surface present', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(typeof hw.buildBindings,      'function');
    t.eq(typeof hw.wireInputs,         'function');
    t.eq(typeof hw.writeLED,           'function');
    t.eq(typeof hw.blank,              'function');
    t.eq(typeof hw.anyPendingWrites,   'function');
    t.eq(typeof hw.decodeLedCache,     'function');
});

test('HW_K3: DEFAULTS populated', function(t) {
    var d = XoneK3.HW_K3.DEFAULTS;
    t.eq(d.midiChannel, 0x0E);
    t.eq(d.sysex, true);
    t.eq(d.calibration, 'measuredRGB');
    t.eq(d.calibrationMode, 'rms');
});

test('HW_K3: framework names removed', function(t) {
    t.eq(XoneK3.buildSysExLED,       undefined);
    t.eq(XoneK3.noteToLEDIndex,      undefined);
    t.eq(XoneK3.rgbToK2,             undefined);
    t.eq(XoneK3.idxToK2,             undefined);
    t.eq(XoneK3.sendK2Note,          undefined);
    t.eq(XoneK3._wireInputs,         undefined);
    t.eq(XoneK3._decodeLedCacheValue, undefined);
});

// ── HW_K3.noteToLEDIndex ────────────────────────────────────

test('noteToLEDIndex: grid row 0 notes 0x28..0x2B → indices 8..11', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(hw.noteToLEDIndex(0x28),  8);
    t.eq(hw.noteToLEDIndex(0x29),  9);
    t.eq(hw.noteToLEDIndex(0x2A), 10);
    t.eq(hw.noteToLEDIndex(0x2B), 11);
});

test('noteToLEDIndex: grid row 2 notes 0x30..0x33 → indices 0..3', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(hw.noteToLEDIndex(0x30), 0);
    t.eq(hw.noteToLEDIndex(0x31), 1);
    t.eq(hw.noteToLEDIndex(0x32), 2);
    t.eq(hw.noteToLEDIndex(0x33), 3);
});

test('noteToLEDIndex: layer/shift button notes', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(hw.noteToLEDIndex(0x0C), 0x1C);
    t.eq(hw.noteToLEDIndex(0x0F), 0x1D);
});

test('noteToLEDIndex: encoder row notes 0x34..0x37', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(hw.noteToLEDIndex(0x34), 0x1E);
    t.eq(hw.noteToLEDIndex(0x37), 0x21);
});

test('noteToLEDIndex: unknown note → -1', function(t) {
    var hw = XoneK3.HW_K3;
    t.eq(hw.noteToLEDIndex(0x00), -1);
    t.eq(hw.noteToLEDIndex(0xFF), -1);
});

// ── HW_K3.buildSysExLED ─────────────────────────────────────

test('buildSysExLED: frame shape', function(t) {
    var msg = XoneK3.HW_K3.buildSysExLED(5, 127, 0, 64, 100);
    t.eq(msg[0],  0xF0);
    t.eq(msg[1],  0x00);
    t.eq(msg[2],  0x00);
    t.eq(msg[3],  0x1A);
    t.eq(msg[4],  0x50);
    t.eq(msg[5],  0x15);
    t.eq(msg[6],  0x00);
    t.eq(msg[7],  0x0E);
    t.eq(msg[8],  5);
    t.eq(msg[9],  127);
    t.eq(msg[10], 0);
    t.eq(msg[11], 64);
    t.eq(msg[12], 100);
    t.eq(msg[13], 0xF7);
});

test('buildSysExLED: idx masked to 7 bits, rgb+hw clamped', function(t) {
    var msg = XoneK3.HW_K3.buildSysExLED(200, 200, -50, 300, -1);
    t.eq(msg[8],  200 & 0x7F);
    t.eq(msg[9],  127);
    t.eq(msg[10], 0);
    t.eq(msg[11], 127);
    t.eq(msg[12], 0);
});

// ── HW_K3.rgbToK2 ───────────────────────────────────────────

test('rgbToK2: hw 0 → -1', function(t) {
    t.eq(XoneK3.HW_K3.rgbToK2(127, 0, 0, 0), -1);
});

test('rgbToK2: black → -1', function(t) {
    t.eq(XoneK3.HW_K3.rgbToK2(0, 0, 0, 127), -1);
});

test('rgbToK2: red-dominant → 0', function(t) {
    t.eq(XoneK3.HW_K3.rgbToK2(127, 20, 0, 127), 0);
});

test('rgbToK2: green-dominant → 2', function(t) {
    t.eq(XoneK3.HW_K3.rgbToK2(20, 127, 0, 127), 2);
});

test('rgbToK2: balanced (r≈g) → 1', function(t) {
    t.eq(XoneK3.HW_K3.rgbToK2(0, 20, 127, 127), 1);
    t.eq(XoneK3.HW_K3.rgbToK2(80, 80, 0, 127), 1);
    t.eq(XoneK3.HW_K3.rgbToK2(127, 127, 127, 127), 1);
});

// ── HW_K3.idxToK2 ───────────────────────────────────────────

test('idxToK2: encoder/grid row 0 (idx 0..3) → base 0x30', function(t) {
    t.eq(XoneK3.HW_K3.idxToK2(0).base, 0x30);
    t.eq(XoneK3.HW_K3.idxToK2(3).base, 0x33);
});

test('idxToK2: layer / shift', function(t) {
    t.eq(XoneK3.HW_K3.idxToK2(0x1C).base, 0x0C);
    t.eq(XoneK3.HW_K3.idxToK2(0x1D).base, 0x0F);
});

test('idxToK2: unknown idx → null', function(t) {
    t.eq(XoneK3.HW_K3.idxToK2(0xFF), null);
});

// ── HW_K3.sendK2Note ────────────────────────────────────────
//
// Bucket → offset: 0 → base+0, 1 → base+36, 2 → base+72.

test('sendK2Note: black → note-off on base', function(t) {
    XoneK3.HW_K3.sendK2Note(0x0E, 0, 0, 0, 0, 0);
    var last = midi._short[midi._short.length - 1];
    t.eq(last[0], 0x90 + 0x0E);
    t.eq(last[1], 0x30);
    t.eq(last[2], 0x00);
});

test('sendK2Note: red bucket uses offset 0', function(t) {
    XoneK3.HW_K3.sendK2Note(0x0E, 0, 127, 0, 0, 127);
    var last = midi._short[midi._short.length - 1];
    t.eq(last[1], 0x30);
});

test('sendK2Note: balanced bucket uses offset 36', function(t) {
    XoneK3.HW_K3.sendK2Note(0x0E, 0, 0, 0, 127, 127);
    var last = midi._short[midi._short.length - 1];
    t.eq(last[1], 0x30 + 36);
});

test('sendK2Note: green bucket uses offset 72', function(t) {
    XoneK3.HW_K3.sendK2Note(0x0E, 0, 0, 127, 0, 127);
    var last = midi._short[midi._short.length - 1];
    t.eq(last[1], 0x30 + 72);
});

// ── HW_K3.decodeLedCache ────────────────────────────────────

test('decodeLedCache: unpacks packed int', function(t) {
    var val = ((100 << 21) | (50 << 14) | (25 << 7) | 90) >>> 0;
    t.eq(XoneK3.HW_K3.decodeLedCache(val), '100:50:25:90');
});

test('decodeLedCache: non-number passes through', function(t) {
    t.eq(XoneK3.HW_K3.decodeLedCache(undefined), 'undefined');
    t.eq(XoneK3.HW_K3.decodeLedCache('junk'),    'junk');
});

// ── HW_K3.writeLED ──────────────────────────────────────────

test('writeLED: sysex path when sysex true', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    XoneK3.HW_K3.writeLED(c, 5, 100, 50, 25, 90);
    t.eq(midi._sysex.length, 1);
    t.eq(midi._short.length, 0);
    var m = midi._sysex[0];
    t.eq(m[8],  5);
    t.eq(m[9],  100);
    t.eq(m[10], 50);
    t.eq(m[11], 25);
    t.eq(m[12], 90);
});

test('writeLED: K2 path when sysex false', function(t) {
    var c = H.ctrl({sysex: false});
    H.clearLeds(c);
    XoneK3.HW_K3.writeLED(c, 0, 127, 0, 0, 127);
    t.eq(midi._sysex.length, 0);
    t.ok(midi._short.length > 0);
});

test('writeLED: identical sysex value not resent', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    XoneK3.HW_K3.writeLED(c, 5, 100, 0, 0, 100);
    XoneK3.HW_K3.writeLED(c, 5, 100, 0, 0, 100);
    t.eq(midi._sysex.length, 1);
});

test('writeLED: different sysex value resends', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    XoneK3.HW_K3.writeLED(c, 5, 100, 0, 0, 100);
    XoneK3.HW_K3.writeLED(c, 5, 100, 0, 0, 101);
    t.eq(midi._sysex.length, 2);
});

test('writeLED: K2 path bypasses _ledCache', function(t) {
    var c = H.ctrl({sysex: false});
    H.clearLeds(c);
    XoneK3.HW_K3.writeLED(c, 0, 127, 0, 0, 127);
    t.eq(c._ledCache[0], undefined);
});

// ── HW_K3.blank ─────────────────────────────────────────────

test('blank: sends note-offs and black sysex', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    XoneK3.HW_K3.blank(c);
    t.ok(midi._short.length > 0);
    t.ok(midi._sysex.length > 0);
    for (var i = 0; i < midi._sysex.length; i++) {
        var m = midi._sysex[i];
        t.eq(m[9],  0);
        t.eq(m[10], 0);
        t.eq(m[11], 0);
    }
});

test('blank: sysex false → only short-msg sweep', function(t) {
    var c = H.ctrl({sysex: false});
    H.clearLeds(c);
    XoneK3.HW_K3.blank(c);
    t.ok(midi._short.length > 0);
    t.eq(midi._sysex.length, 0);
});

// ── HW_K3.anyPendingWrites ──────────────────────────────────

test('anyPendingWrites: no pacer → false', function(t) {
    var c = H.ctrl({sysex: true});
    t.eq(XoneK3.HW_K3.anyPendingWrites(c), false);
});

test('anyPendingWrites: empty pacer → false', function(t) {
    var c = H.ctrl({sysex: true});
    c.pacer('led', { sendFn: function() {} });
    t.eq(XoneK3.HW_K3.anyPendingWrites(c), false);
});

// ── ctrl.pacer ──────────────────────────────────────────────

test('pacer: "led" exists after boot blank (sysex path)', function(t) {
    var c = H.ctrl({sysex: true});
    // init() → _blankLeds() → hw.blank() → ctrl.pacer('led', {sendFn})
    t.ok(c._pacers.led);
    t.eq(c._pacers.led.name, 'led');
});

test('pacer: "led" absent after boot in K2 mode', function(t) {
    var c = H.ctrl({sysex: false});
    // K2 blank returns before touching the pacer.
    t.eq(c._pacers.led, undefined);
});

test('pacer: lazy creation for a new name', function(t) {
    var c = H.ctrl();
    t.eq(c._pacers.other, undefined);
    var p = c.pacer('other', { sendFn: function() {} });
    t.ok(p);
    t.eq(c._pacers.other, p);
});

test('pacer: caches instance', function(t) {
    var c = H.ctrl();
    t.eq(c.pacer('led', { sendFn: function() {} }),
         c.pacer('led', { sendFn: function() {} }));
});

test('pacer: throttleMs matches TIMING.pacingDefaultThrottleMs', function(t) {
    var c = H.ctrl();
    t.eq(c.pacer('led', { sendFn: function() {} }).throttleMs,
         XoneK3.TIMING.pacingDefaultThrottleMs);
});

test('pacer: TIMING.sysexThrottleMs aliases pacingDefaultThrottleMs', function(t) {
    t.eq(XoneK3.TIMING.sysexThrottleMs,
         XoneK3.TIMING.pacingDefaultThrottleMs);
});

test('pacer: onDrop clears _ledCache slot', function(t) {
    var c = H.ctrl();
    var p = c.pacer('led', { sendFn: function() {} });
    c._ledCache[5] = 42;
    p.onDrop(5);
    t.eq(c._ledCache[5], undefined);
});

test('pacer: sendFn param routes payload through provided fn', function(t) {
    var c = H.ctrl({sysex: true});
    var captured = [];
    var p = c.pacer('custom', {
        throttleMs: 0,
        sendFn: function(msg) { captured.push(msg); }
    });
    p.enqueue('k', 'PAYLOAD');
    p.start();
    t.eq(captured, ['PAYLOAD']);
});

test('pacer: no sendFn → warn-once, payload dropped', function(t) {
    var c = H.ctrl({sysex: true});
    var before = _printLog.length;
    var p = c.pacer('warn-test');
    t.ok(_printLog.length > before, 'expected warn-once');
    p.enqueue('k', 'x');
    p.start();  // no-op sendFn should not throw
    t.eq(p.length(), 0);
});

// ── XoneK3.Pacing ───────────────────────────────────────────

test('Pacing: throttle 0 flushes immediately on start', function(t) {
    var sent = [];
    var p = new XoneK3.Pacing('test', 0, function(msg) { sent.push(msg); });
    p.enqueue('a', 'A');
    p.enqueue('b', 'B');
    p.start();
    t.eq(sent, ['A', 'B']);
    t.eq(p.length(), 0);
});

test('Pacing: replace-in-place on duplicate key', function(t) {
    var sent = [];
    var p = new XoneK3.Pacing('test', 0, function(msg) { sent.push(msg); });
    p.enqueue('a', 'A1');
    p.enqueue('a', 'A2');
    p.start();
    t.eq(sent, ['A2']);
    t.eq(p.length(), 0);
});

test('Pacing: overflow drops oldest', function(t) {
    var sent = [];
    var dropped = [];
    var p = new XoneK3.Pacing('test', 0, function(msg) { sent.push(msg); });
    p.onDrop = function(k) { dropped.push(k); };
    var cap = XoneK3.TIMING.pacingMaxQueue;
    for (var i = 0; i <= cap; i++) p.enqueue('k' + i, i);
    t.eq(p.length(), cap);
    t.eq(dropped, ['k0']);
});

// ── sendLED (framework dispatch) ────────────────────────────

test('sendLED: delegates to HW writeLED', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    c.sendLED(5, 100, 50, 25, 90);
    t.eq(midi._sysex.length, 1);
    t.eq(midi._sysex[0][8], 5);
});

test('sendLED: idx < 0 skips dispatch', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    c.sendLED(-1, 100, 0, 0, 100);
    t.eq(midi._sysex.length, 0);
    t.eq(midi._short.length, 0);
});

test('sendLED: shutdown gate', function(t) {
    var c = H.ctrl({sysex: true});
    c._shuttingDown = true;
    H.clearLeds(c);
    c.sendLED(5, 100, 0, 0, 100);
    t.eq(midi._sysex.length, 0);
});

// ── _blankLeds (framework dispatch) ─────────────────────────

test('_blankLeds: sends note-offs and black sysex', function(t) {
    var c = H.ctrl({sysex: true});
    H.clearLeds(c);
    c._blankLeds();
    t.ok(midi._short.length > 0);
    t.ok(midi._sysex.length > 0);
    for (var i = 0; i < midi._sysex.length; i++) {
        var m = midi._sysex[i];
        t.eq(m[9],  0);
        t.eq(m[10], 0);
        t.eq(m[11], 0);
    }
});

test('_blankLeds: sysex false → only short-msg sweep', function(t) {
    var c = H.ctrl({sysex: false});
    H.clearLeds(c);
    c._blankLeds();
    t.ok(midi._short.length > 0);
    t.eq(midi._sysex.length, 0);
});

test('_blankLeds: sysex true repopulates _ledCache to 0', function(t) {
    var c = H.ctrl({sysex: true});
    c._ledCache[5] = 999;
    c._blankLeds();
    t.eq(c._ledCache[5], 0);
});

test('_blankLeds: sysex false leaves _ledCache empty', function(t) {
    var c = H.ctrl({sysex: false});
    c._ledCache[5] = 999;
    c._blankLeds();
    t.eq(c._ledCache[5], undefined);
});