// Test runner.
//
//   node test/run.js                run all
//   node test/run.js <substr>       run files matching
//   node test/run.js --bail         stop on first failure
//   node test/run.js --verbose      print every passing test
//
// Between every test:
//   - engine + midi mocks reset
//   - myCatnip mutable globals reset
//   - shared.{timeSig,lastLoopTouchMs,warned,controllers} reset
//   - _compiledCacheByHw WeakMap refreshed
//   - TIMING reset from _TIMING_DEFAULTS then 0-throttled
//   - controllers array cleared, print log cleared

'use strict';

var fs = require('fs');
var path = require('path');
var harness = require('./harness');

var argv = process.argv.slice(2);
var filter = null, bail = false, verbose = false;
for (var ai = 0; ai < argv.length; ai++) {
    if (argv[ai] === '--bail')         bail = true;
    else if (argv[ai] === '--verbose') verbose = true;
    else if (!filter)                  filter = argv[ai];
}

var ctx = harness.load();

global.myCatnip  = ctx.myCatnip;
global.engine    = ctx.engine;
global.midi      = ctx.midi;
global.print     = ctx.print;
global._printLog = ctx._printLog;

// -------------------------------------------------------------
// Assertion API
// -------------------------------------------------------------
function makeT(errors) {
    function pfx(m) { return m ? '[' + m + '] ' : ''; }

    var t = {
        eq: function(actual, expected, msg) {
            if (!deepEq(actual, expected))
                errors.push(pfx(msg) + 'eq: ' + fmt(actual) + ' !== ' + fmt(expected));
        },
        neq: function(actual, expected, msg) {
            if (actual === expected)
                errors.push(pfx(msg) + 'neq: ' + fmt(actual) + ' === ' + fmt(expected));
        },
        approx: function(actual, expected, tol, msg) {
            if (typeof tol === 'string') { msg = tol; tol = 1e-6; }
            tol = (typeof tol === 'number') ? tol : 1e-6;
            if (typeof actual !== 'number' || Math.abs(actual - expected) > tol)
                errors.push(pfx(msg) + 'approx: ' + fmt(actual) +
                            ' not within ' + tol + ' of ' + expected);
        },
        ok:    function(v, msg) { if (!v) errors.push(pfx(msg) + 'ok: got '     + fmt(v)); },
        notOk: function(v, msg) { if (v)  errors.push(pfx(msg) + 'notOk: got '  + fmt(v)); },
        throws: function(fn, pattern, msg) {
            var threw = false, got = '';
            try { fn(); } catch (e) { threw = true; got = (e && e.message) || ''; }
            if (!threw) { errors.push(pfx(msg) + 'throws: no exception'); return; }
            if (pattern && !pattern.test(got))
                errors.push(pfx(msg) + 'throws: "' + got + '" did not match ' + pattern);
        },
        contains: function(hay, needle, msg) {
            if (typeof hay === 'string') {
                if (hay.indexOf(needle) === -1)
                    errors.push(pfx(msg) + 'contains: string lacks "' + needle + '"');
            } else if (Array.isArray(hay)) {
                if (hay.indexOf(needle) === -1)
                    errors.push(pfx(msg) + 'contains: ' + fmt(hay) + ' lacks ' + fmt(needle));
            } else {
                errors.push(pfx(msg) + 'contains: not iterable');
            }
        },
        hasKey: function(obj, key, msg) {
            if (!obj || !Object.prototype.hasOwnProperty.call(obj, key))
                errors.push(pfx(msg) + 'hasKey: missing ' + fmt(key));
        },
        rgb: function(led, r, g, b, tol, msg) {
            if (typeof tol === 'string') { msg = tol; tol = 2; }
            tol = (typeof tol === 'number') ? tol : 2;
            if (!led) { errors.push(pfx(msg) + 'rgb: no LED'); return; }
            if (Math.abs(led.r - r) > tol || Math.abs(led.g - g) > tol || Math.abs(led.b - b) > tol)
                errors.push(pfx(msg) + 'rgb: got [' + led.r + ',' + led.g + ',' + led.b +
                            '] expected [' + r + ',' + g + ',' + b + ']');
        },
        hw: function(led, hw, tol, msg) {
            if (typeof tol === 'string') { msg = tol; tol = 1; }
            tol = (typeof tol === 'number') ? tol : 1;
            if (!led) { errors.push(pfx(msg) + 'hw: no LED'); return; }
            if (Math.abs(led.hw - hw) > tol)
                errors.push(pfx(msg) + 'hw: got ' + led.hw + ' expected ' + hw);
        }
    };
    return t;
}

function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== 'object') return false;
    var aArr = Array.isArray(a), bArr = Array.isArray(b);
    if (aArr !== bArr) return false;
    if (aArr) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
        return true;
    }
    var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return false;
    for (var k = 0; k < ka.length; k++) if (!deepEq(a[ka[k]], b[ka[k]])) return false;
    return true;
}

function fmt(v) {
    if (typeof v === 'function') return '[fn]';
    if (v === undefined) return 'undefined';
    try { return JSON.stringify(v); } catch (e) { return String(v); }
}

// -------------------------------------------------------------
// Reset between tests
// -------------------------------------------------------------
function _refreshTimingAliases() {
    var X = global.myCatnip;
    X.PACING_DEFAULT_THROTTLE_MS = X.TIMING.pacingDefaultThrottleMs;
    X.SYSEX_THROTTLE_MS          = X.TIMING.sysexThrottleMs;
    X.BEAT_REPAINT_THROTTLE_MS   = X.TIMING.beatRepaintThrottleMs;
    X.PULSE_CO_MS                = X.TIMING.pulseCoMs;
    X.BEATJUMP_GAP_MS            = X.TIMING.beatjumpGapMs;
    X.BEAT_STALL_MS              = X.TIMING.beatStallMs;
    X.META_SETTLE_MS             = X.TIMING.metaSettleMs;
    X.BOOT_SETTLE_MS             = X.TIMING.bootSettleMs;
    X.BOOT_MAX_ATTEMPTS          = X.TIMING.bootMaxAttempts;
    X.CO_MATCH_EPSILON           = X.TIMING.coMatchEpsilon;
    X.TAKEOVER_EPSILON           = X.TIMING.takeoverEpsilon;
}

function resetGlobals() {
    var X = global.myCatnip;

    // applyPacing resets TIMING from _TIMING_DEFAULTS, so tests
    // need a hook to force zero-throttle across every boot path.
    X._pacingTestOverride = {
        pacingDefaultThrottleMs: 0,
        beatRepaintThrottleMs:   0
    };

    if (X.TIMING && X._TIMING_DEFAULTS) {
        Object.assign(X.TIMING, X._TIMING_DEFAULTS);
        X.TIMING.sysexThrottleMs       = 0;
        X.TIMING.beatRepaintThrottleMs = 0;
        _refreshTimingAliases();
    }

    X.BEATJUMP_MIN             = 1 / 32;
    X.BEATJUMP_MAX             = 16;
    X.BEAT_PLAYING_MODE        = 'pulse';
    X.BEAT_PAUSED_MODE         = 'solid';
    X._debugPrintsOn           = false;
    X.MODE_PRINTS              = false;

    // shared.* — reassign timeSig / lastLoopTouchMs / controllers,
    // and reset warned *in place* so _warned (which aliases
    // shared.warned at module load in lib/core.js) stays coherent.
    X.shared.warned          = Object.create(null);
    X._warned                = X.shared.warned;
    X.shared.timeSig         = { 1: null, 2: null, 3: null, 4: null };
    X.shared.lastLoopTouchMs = { 1: 0, 2: 0, 3: 0, 4: 0 };
    X.shared.controllers     = {};

    X._modeSeen                = { edit: false, slots: false };
    X._schemeCache             = {};
    X._compiledCache           = {};
    X._compiledCacheByHw       = new WeakMap();
    X.controllers              = [];
    X.PHRASE_MARKER_COLORS       = [0xF2F2FF];
    X.PHRASE_HOTCUE_SLOTS        = [9, 10, 11, 12];
    X._phraseHotcueSlotsCache    = null;
    X._phraseHotcueSlotsCacheSrc = null;
    global.engine._reset();
    global.midi._reset();
    global._printLog.length = 0;
}

// -------------------------------------------------------------
// Test registration
// -------------------------------------------------------------
var results = [];
var currentFile = '';

global.test = function(name, fn) {
    var errors = [];
    var t = makeT(errors);
    resetGlobals();
    var start = Date.now();
    try {
        fn(t);
    } catch (e) {
        errors.push('threw: ' + (e && e.message || e) + '\n    ' +
                    String(e && e.stack || '').split('\n').slice(1, 4).join('\n    '));
    }
    results.push({ file: currentFile, name: name, errors: errors, ms: Date.now() - start });
    if (bail && errors.length > 0) { report(); process.exit(1); }
};

// -------------------------------------------------------------
// Load test files
// -------------------------------------------------------------
var files = fs.readdirSync(__dirname)
    .filter(function(f) { return /\.test\.js$/.test(f); })
    .sort();
if (filter) files = files.filter(function(f) { return f.indexOf(filter) !== -1; });

for (var fi = 0; fi < files.length; fi++) {
    currentFile = files[fi].replace('.test.js', '');
    require(path.join(__dirname, files[fi]));
}

report();

// -------------------------------------------------------------
// Report
// -------------------------------------------------------------
function report() {
    var byFile = {};
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!byFile[r.file]) byFile[r.file] = [];
        byFile[r.file].push(r);
    }
    var names = Object.keys(byFile).sort();
    var totalPass = 0, totalFail = 0, totalMs = 0;

    for (var n = 0; n < names.length; n++) {
        var fn = names[n], rs = byFile[fn];
        var pass = 0, fail = 0, failed = [];
        for (var r2 = 0; r2 < rs.length; r2++) {
            totalMs += rs[r2].ms;
            if (rs[r2].errors.length === 0) {
                pass++;
                if (verbose) console.log('    ✓ ' + rs[r2].name);
            } else { fail++; failed.push(rs[r2]); }
        }
        totalPass += pass;
        totalFail += fail;
        console.log('  ' + (fail === 0 ? '✓' : '✗') + '  ' +
                    padRight(fn, 30) + padLeft(pass + '/' + (pass + fail), 8));
        for (var f = 0; f < failed.length; f++) {
            console.log('       ✗ ' + failed[f].name);
            for (var e = 0; e < failed[f].errors.length; e++)
                console.log('           ' + failed[f].errors[e]);
        }
    }
    console.log('');
    console.log(padLeft(totalPass, 5) + ' passed, ' +
                padLeft(totalFail, 5) + ' failed   (' + totalMs + ' ms)');
    process.exit(totalFail > 0 ? 1 : 0);
}

function padRight(s, n) { while (s.length < n) s += ' '; return s; }
function padLeft(s, n)  { s = String(s); while (s.length < n) s = ' ' + s; return s; }