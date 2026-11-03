// test/run.mjs — ESM test runner.
//
//   node test/run.mjs                run all
//   node test/run.mjs <substr>       run files matching
//   node test/run.mjs --bail         stop on first failure
//   node test/run.mjs --verbose      print every passing test
//
// Between every test:
//   - engine + midi mocks reset
//   - myCatnip mutable globals reset
//   - shared.{timeSig,lastLoopTouchMs,warned,controllers} reset
//   - _compiledCacheByHw WeakMap refreshed
//   - TIMING reset from _TIMING_DEFAULTS then 0-throttled
//   - controllers array cleared, print log cleared

import { load } from './harness.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
let filter = null, bail = false, verbose = false;
for (const a of argv) {
    if (a === '--bail') bail = true;
    else if (a === '--verbose') verbose = true;
    else if (!filter) filter = a;
}

const { engine, midi, print, _printLog } = await load();

global.myCatnip  = global.myCatnip;
global.engine    = engine;
global.midi      = midi;
global.print     = print;
global._printLog = _printLog;

// -------------------------------------------------------------
// Assertion API
// -------------------------------------------------------------
function makeT(errors) {
    function pfx(m) { return m ? '[' + m + '] ' : ''; }

    const t = {
        eq: (actual, expected, msg) => {
            if (!deepEq(actual, expected))
                errors.push(pfx(msg) + 'eq: ' + fmt(actual) + ' !== ' + fmt(expected));
        },
        neq: (actual, expected, msg) => {
            if (actual === expected)
                errors.push(pfx(msg) + 'neq: ' + fmt(actual) + ' === ' + fmt(expected));
        },
        approx: (actual, expected, tol, msg) => {
            if (typeof tol === 'string') { msg = tol; tol = 1e-6; }
            tol = typeof tol === 'number' ? tol : 1e-6;
            if (typeof actual !== 'number' || Math.abs(actual - expected) > tol)
                errors.push(pfx(msg) + 'approx: ' + fmt(actual) +
                            ' not within ' + tol + ' of ' + expected);
        },
        ok:    (v, msg) => { if (!v) errors.push(pfx(msg) + 'ok: got ' + fmt(v)); },
        notOk: (v, msg) => { if (v)  errors.push(pfx(msg) + 'notOk: got ' + fmt(v)); },
        throws: (fn, pattern, msg) => {
            let threw = false, got = '';
            try { fn(); } catch (e) { threw = true; got = e?.message || ''; }
            if (!threw) { errors.push(pfx(msg) + 'throws: no exception'); return; }
            if (pattern && !pattern.test(got))
                errors.push(pfx(msg) + 'throws: "' + got + '" did not match ' + pattern);
        },
        contains: (hay, needle, msg) => {
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
        hasKey: (obj, key, msg) => {
            if (!obj || !Object.prototype.hasOwnProperty.call(obj, key))
                errors.push(pfx(msg) + 'hasKey: missing ' + fmt(key));
        },
        rgb: (led, r, g, b, tol, msg) => {
            if (typeof tol === 'string') { msg = tol; tol = 2; }
            tol = typeof tol === 'number' ? tol : 2;
            if (!led) { errors.push(pfx(msg) + 'rgb: no LED'); return; }
            if (Math.abs(led.r - r) > tol || Math.abs(led.g - g) > tol || Math.abs(led.b - b) > tol)
                errors.push(pfx(msg) + 'rgb: got [' + led.r + ',' + led.g + ',' + led.b +
                            '] expected [' + r + ',' + g + ',' + b + ']');
        },
        hw: (led, hw, tol, msg) => {
            if (typeof tol === 'string') { msg = tol; tol = 1; }
            tol = typeof tol === 'number' ? tol : 1;
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
    const aArr = Array.isArray(a), bArr = Array.isArray(b);
    if (aArr !== bArr) return false;
    if (aArr) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
        return true;
    }
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return false;
    for (let k = 0; k < ka.length; k++) if (!deepEq(a[ka[k]], b[ka[k]])) return false;
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
    const X = global.myCatnip;
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
    const X = global.myCatnip;

    X._pacingTestOverride = { pacingDefaultThrottleMs: 0, beatRepaintThrottleMs: 0 };
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
    // and *reset warned in place* so any captured reference (e.g.
    // _warned alias) stays coherent.
    X.shared.timeSig         = { 1: null, 2: null, 3: null, 4: null };
    X.shared.lastLoopTouchMs = { 1: 0, 2: 0, 3: 0, 4: 0 };
    X.shared.controllers     = {};
    X.shared.warned          = Object.create(null);
    X._warned                = X.shared.warned;

    X._modeSeen                = { edit: false, slots: false };
    X._schemeCache             = {};
    X._compiledCache           = {};
    X._compiledCacheByHw       = new WeakMap();
    X.controllers              = [];
    X.PHRASE_MARKER_COLORS       = [0xF2F2FF];
    X.PHRASE_HOTCUE_SLOTS        = [9, 10, 11, 12];
    X._phraseHotcueSlotsCache    = null;
    X._phraseHotcueSlotsCacheSrc = null;

    engine._reset();
    midi._reset();
    _printLog.length = 0;
}

// -------------------------------------------------------------
// Test registration
// -------------------------------------------------------------
const results = [];
let currentFile = '';

global.test = (name, fn) => {
    const errors = [];
    const t = makeT(errors);
    resetGlobals();
    const start = Date.now();
    try {
        fn(t);
    } catch (e) {
        errors.push('threw: ' + (e?.message || e) + '\n    ' +
                    String(e?.stack || '').split('\n').slice(1, 4).join('\n    '));
    }
    results.push({ file: currentFile, name, errors, ms: Date.now() - start });
    if (bail && errors.length > 0) { report(); process.exit(1); }
};

// -------------------------------------------------------------
// Load test files
// -------------------------------------------------------------
const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.mjs'))
    .sort();
if (filter) {
    const filtered = files.filter(f => f.indexOf(filter) !== -1);
    files.length = 0;
    files.push(...filtered);
}

for (const fi of files) {
    currentFile = fi.replace('.test.mjs', '');
    await import(path.join(__dirname, fi));
}

report();

// -------------------------------------------------------------
// Report
// -------------------------------------------------------------
function report() {
    const byFile = {};
    for (const r of results) {
        if (!byFile[r.file]) byFile[r.file] = [];
        byFile[r.file].push(r);
    }
    const names = Object.keys(byFile).sort();
    let totalPass = 0, totalFail = 0, totalMs = 0;

    for (const fn of names) {
        const rs = byFile[fn];
        let pass = 0, fail = 0;
        const failed = [];
        for (const r2 of rs) {
            totalMs += r2.ms;
            if (r2.errors.length === 0) {
                pass++;
                if (verbose) console.log('    ✓ ' + r2.name);
            } else {
                fail++;
                failed.push(r2);
            }
        }
        totalPass += pass;
        totalFail += fail;
        console.log('  ' + (fail === 0 ? '✓' : '✗') + '  ' +
                    padRight(fn, 30) + padLeft(pass + '/' + (pass + fail), 8));
        for (const f of failed) {
            console.log('       ✗ ' + f.name);
            for (const e of f.errors) console.log('           ' + e);
        }
    }
    console.log('');
    console.log(padLeft(totalPass, 5) + ' passed, ' +
                padLeft(totalFail, 5) + ' failed   (' + totalMs + ' ms)');
    process.exit(totalFail > 0 ? 1 : 0);
}

function padRight(s, n) { while (s.length < n) s += ' '; return s; }
function padLeft(s, n)  { s = String(s); while (s.length < n) s = ' ' + s; return s; }