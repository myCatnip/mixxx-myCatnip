// lib/core.js — bootstrap, utilities, tokens, binding field table,
// palette hooks, beat math, shared namespace.
//
// Loaded first by every preset. Defines the `myCatnip` global that
// every other file attaches to.

'use strict';

var myCatnip = (typeof myCatnip !== 'undefined') ? myCatnip : {};

// ============================================================
// SHARED STATE (session-scoped)
// ============================================================
// Session-scoped mutable state. Reset by _bootWith (see
// lib/controller-boot.js). Owner-writes, everyone-reads:
//   timeSig          {ch → {barBeats, phraseBars}} — per-channel
//   lastLoopTouchMs  {ch → ms} — beatjump gate timestamp
//   warned           {key → true} — _warnOnce dedupe
//   controllers      {label → block} — cross-controller publish
//   rw               {*} — free-form escape hatch for future
//                    cross-controller coordination
var shared = myCatnip.shared = {
    timeSig:         { 1: null, 2: null, 3: null, 4: null },
    lastLoopTouchMs: { 1: 0, 2: 0, 3: 0, 4: 0 },
    warned:          Object.create(null),
    controllers:     {},
    rw:              {}
};

// _warned proxies shared.warned. Old code / tests reset warn state
// by reassigning myCatnip._warned = {} — the setter keeps both in
// sync. _warnOnce reads shared.warned directly.
Object.defineProperty(myCatnip, '_warned', {
    get: function() { return shared.warned; },
    set: function(v) { shared.warned = v; },
    configurable: true,
    enumerable: false
});

// Legacy TIME_SIG accessor. v2.0.0 had myCatnip.TIME_SIG as a
// single session-global. v2.1.0 is per-channel (shared.timeSig).
// Getter returns channel 1's sig (or null); setter writes all
// four channels — matches setTimeSig(bb, pb) 2-arg form.
//
// Direct assignment of an invalid value (non-numeric barBeats,
// fractional phraseBars) bypasses setTimeSig's coercion and
// corrupts the cascade silently — setTimeSig is the supported
// write path. The setter here just fans out.
Object.defineProperty(myCatnip, 'TIME_SIG', {
    get: function() { return shared.timeSig[1]; },
    set: function(v) {
        if (v === null || v === undefined) {
            for (var c = 1; c <= 4; c++) shared.timeSig[c] = null;
        } else {
            for (var c = 1; c <= 4; c++) shared.timeSig[c] = v;
        }
    },
    configurable: true,
    enumerable: false
});

// ============================================================
// TUNABLES
// ============================================================
myCatnip.DEFAULT_RGB_BRIGHTNESS     = 110;
myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF = 12;
myCatnip.DEFAULT_CO_SCHEME = 'coMatch';
myCatnip.CURVE_GAIN = 4.0;
myCatnip.RATIO_GAIN = 12.0;
myCatnip.DEFAULT_BAR_BEATS   = 4;
myCatnip.DEFAULT_PHRASE_BARS = 4;
myCatnip.DEFAULT_BEAT_DECK   = '$DECK_ACTIVE$';
myCatnip.BEATJUMP_MIN = 1/32;
myCatnip.BEATJUMP_MAX = 16;

// What a beat-enabled LED shows while its deck is playing /
// paused. Same three values for both:
//   'pulse' — bright first half, dim second (position-derived)
//   'solid' — on-ramp + cascade, no brightness pulse
//   'off'   — off-ramp, no cascade
myCatnip.BEAT_PLAYING_MODE = 'pulse';
myCatnip.BEAT_PAUSED_MODE  = 'solid';

// ============================================================
// PATCH NAMES
// ============================================================
myCatnip.PATCH_NAMES = {
    FOCUS_BASE: 'topShared', FOCUS_LAYOUT: 'fxLayout',
    TWODECK_BASE: 'twoDeck', TWODECK_A_LAYOUT: 'fxLayoutA',
    TWODECK_B_LAYOUT: 'fxLayoutB', MINI_BASE: 'twoDeckMini',
    MINI_LAYOUT: 'fxMini', CHORD: 'chord', CUE: 'cue',
    LOOP: 'loop', SELECT_AB: 'selectAB', FX_ROUTING: 'fxRouting'
};

// ============================================================
// TIME SIG
// ============================================================
myCatnip.setTimeSig = function(barBeats, phraseBars, ch) {
    // Floor + reject non-finite. Fractional barBeats produce a
    // fractional phraseLen; the modulo positions in beatLevel
    // then only coincide with integer beat counts at a subset
    // of the expected positions, silently corrupting the
    // cascade. NaN/Infinity propagate the same way.
    barBeats = Math.floor(Number(barBeats));
    phraseBars = Math.floor(Number(phraseBars));
    if (!isFinite(barBeats) || barBeats < 1) return;
    if (!isFinite(phraseBars) || phraseBars < 1) return;
    var val = { barBeats: barBeats, phraseBars: phraseBars };
    if (ch === undefined) {
        for (var c = 1; c <= 4; c++) shared.timeSig[c] = val;
    } else if (ch >= 1 && ch <= 4) {
        shared.timeSig[ch] = val;
    }
    if (!myCatnip.controllers) return;
    for (var i = 0; i < myCatnip.controllers.length; i++) {
        myCatnip.controllers[i]._refreshAllLeds('timesig');
    }
};

myCatnip.clearTimeSig = function(ch) {
    if (ch === undefined) {
        for (var c = 1; c <= 4; c++) shared.timeSig[c] = null;
    } else if (ch >= 1 && ch <= 4) {
        shared.timeSig[ch] = null;
    }
    if (!myCatnip.controllers) return;
    for (var i = 0; i < myCatnip.controllers.length; i++) {
        myCatnip.controllers[i]._refreshAllLeds('timesig');
    }
};

// ============================================================
// WARN-ONCE
// ============================================================
myCatnip._warnOnce = function(key, msg) {
    if (shared.warned[key]) return;
    shared.warned[key] = true;
    print('[myCatnip] ' + msg);
};

// ============================================================
// DEBUG PRINTS
// ============================================================
myCatnip.PRINT_TABLES = [];
myCatnip._debugPrintsOn = false;
myCatnip.registerPrintTable = function(table, name) {
    myCatnip.PRINT_TABLES.push({ table: table, name: name || 'unnamed' });
};
myCatnip.debugPrint = function(key, vars) {
    if (!myCatnip._debugPrintsOn) return;
    var tpl = null;
    for (var i = 0; i < myCatnip.PRINT_TABLES.length; i++) {
        var t = myCatnip.PRINT_TABLES[i].table;
        if (t[key] !== undefined) { tpl = t[key]; break; }
    }
    if (tpl === null) return;
    if (vars) {
        for (var k in vars) {
            if (!vars.hasOwnProperty(k)) continue;
            tpl = tpl.split('{' + k + '}').join(vars[k]);
        }
    }
    print('[myCatnip] ' + tpl);
};

myCatnip.registerPrintTable({
    overlayOn:  'overlay {name} ON',
    overlayOff: 'overlay {name} OFF'
}, 'lib');

// ============================================================
// UTILITIES
// ============================================================
myCatnip.parseNum = function(s) {
    var v;
    if (typeof s === 'number') v = s;
    else if (typeof s !== 'string') return NaN;
    else {
        s = s.trim();
        if (s === '') return NaN;
        var p = s.split('/');
        if (p.length === 2) {
            var a = parseFloat(p[0]), b = parseFloat(p[1]);
            if (isNaN(a) || isNaN(b) || b === 0) return NaN;
            v = a / b;
        } else if (p.length === 1) {
            v = parseFloat(s);
        } else return NaN;
    }
    // Callers guard with isNaN, which accepts Infinity. A
    // config typo like args: ['1e999'] would write Infinity
    // to a CO (engine.setValue / setParameter paths).
    return isFinite(v) ? v : NaN;
};

myCatnip.readPath = function(obj, path) {
    if (obj === undefined || obj === null) return undefined;
    if (typeof path !== 'string' || path.indexOf('.') === -1) return obj[path];
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
        if (cur === undefined || cur === null) return undefined;
        cur = cur[parts[i]];
    }
    return cur;
};

myCatnip._selProp = function(kind, which) {
    return 'selected' + kind.charAt(0).toUpperCase() + kind.slice(1) + which;
};

// ============================================================
// PALETTE HOOKS (per-HW)
// ============================================================
myCatnip.resolveNamedColour = function(name, ctrl) {
    if (ctrl && ctrl.hw && ctrl.hw.PALETTE && ctrl.hw.PALETTE[name]) {
        return ctrl.hw.PALETTE[name];
    }
    // Fallback: caller passed no ctrl (bootstrap, direct test call).
    // Use HW_K3 palette as framework default. Only when !ctrl —
    // a ctrl with no PALETTE still warns (that's a real HW config gap).
    if (!ctrl && myCatnip.HW_K3 && myCatnip.HW_K3.PALETTE &&
        myCatnip.HW_K3.PALETTE[name]) {
        return myCatnip.HW_K3.PALETTE[name];
    }
    myCatnip._warnOnce('noPalette:' + name,
        'resolveNamedColour: hardware has no PALETTE for "' + name +
        '" — LED will be dark.');
    return null;
};

myCatnip.mapMixxxColor = function(rgb, ctrl) {
    if (!rgb || rgb <= 0) return null;
    if (ctrl && ctrl.hw && ctrl.hw.MIXXX_COLORS &&
        ctrl.hw.MIXXX_COLORS[rgb]) {
        return ctrl.hw.MIXXX_COLORS[rgb];
    }
    if (!ctrl && myCatnip.HW_K3 && myCatnip.HW_K3.MIXXX_COLORS &&
        myCatnip.HW_K3.MIXXX_COLORS[rgb]) {
        return myCatnip.HW_K3.MIXXX_COLORS[rgb];
    }
    // Generic 50%-brightness fallback for hardware without a
    // mapped-hotcue table. Same 50% scale as the K3 fallback.
    return [
        Math.round(((rgb >> 16) & 0xFF) / 2),
        Math.round(((rgb >> 8)  & 0xFF) / 2),
        Math.round(( rgb        & 0xFF) / 2)
    ];
};

// ============================================================
// BINDING FIELD TABLE
// ============================================================
// One table describing every field the binding pipeline
// recognises. Adding a field is one row — _BINDING_CFG_FIELDS,
// _SNAPSHOT_FIELDS, _SNAPSHOT_IGNORED, _tokenFields and
// _resolvedTargetHash all derive from this array.
//
// Row shape:
//   name       cfg path (dot-paths allowed, e.g. 'colorScheme.on.group')
//   hash       include in _hashBinding's field list
//   token      emit from _tokenFields + resolve in _resolvedTargetHash;
//              value is the label used in warnings
//   snapshot   { dest, source?, transform? }
//              source defaults to name; transform is a name in
//              myCatnip._snapshotTransform
//   ignored    reset-able binding field that _unbind /
//              _rearmSoftTakeover do not read
myCatnip._BINDING_FIELDS = [
    // ---- cfg fields (hashed) ----
    { name: 'group', hash: true, token: 'group', snapshot: { dest: 'group' } },
    { name: 'inKey', hash: true, token: 'inKey', snapshot: { dest: 'inKey' } },
    { name: 'outKey', hash: true, token: 'outKey', ignored: true },
    { name: 'type', hash: true, snapshot: { dest: 'wasPot', transform: 'isPot' } },
    { name: 'func', hash: true },
    { name: 'args', hash: true },
    { name: 'valueCurve', hash: true },
    { name: 'softTakeover', hash: true, ignored: true },
    { name: 'noLED', hash: true, snapshot: { dest: 'wasNoLED', source: '_noLED' } },
    { name: 'colorScheme', hash: true },
    { name: 'colorScheme.on.group', token: 'on.group' },
    { name: 'colorScheme.schemeFromState.group', token: 'schemeFromState.group' },
    { name: 'colorScheme.schemeFromState.co', token: 'schemeFromState.co' },
    { name: '_rawCfg', snapshot: { dest: 'wasBound', transform: 'truthy' } },
    { name: 'idx', snapshot: { dest: 'idx' } },
    { name: 'buttonMode', ignored: true },
    { name: '_func', ignored: true },
    { name: '_funcArgs', ignored: true },
    { name: '_usedTokens', ignored: true },
    { name: '_csActive', ignored: true },
    { name: '_csFailed', ignored: true },
    { name: '_csDeviation', ignored: true },
    { name: '_csScheme', ignored: true },
    { name: '_csSchemeFn', ignored: true },
    { name: '_csSchemeMemo', ignored: true },
    { name: '_csCompiledMemo', ignored: true },
    { name: '_csKnob', ignored: true },
    { name: '_csFromStateConn', ignored: true },
    { name: '_csOn', ignored: true },
    { name: '_valueConn', ignored: true },
    { name: '_conns', ignored: true },
    { name: '_valueCurve', ignored: true },
    { name: '_hotcueColorCO', ignored: true },
    { name: '_cachedHotcueColor', ignored: true },
    { name: '_shutdownHoldTimer', ignored: true }
];

// Derived view: hashed cfg fields, in table order. Consumed by
// _hashBinding and _auditBindingCfg.
myCatnip._BINDING_CFG_FIELDS = (function() {
    var out = [];
    for (var i = 0; i < myCatnip._BINDING_FIELDS.length; i++) {
        if (myCatnip._BINDING_FIELDS[i].hash) out.push(myCatnip._BINDING_FIELDS[i].name);
    }
    return out;
})();

// Derived view: [source, dest, transform] triples consumed by
// _snapshotBinding. transform is a name in
// myCatnip._snapshotTransform, or null for identity.
myCatnip._SNAPSHOT_FIELDS = (function() {
    var out = [];
    for (var i = 0; i < myCatnip._BINDING_FIELDS.length; i++) {
        var row = myCatnip._BINDING_FIELDS[i];
        if (!row.snapshot) continue;
        var s = row.snapshot;
        out.push([s.source || row.name, s.dest, s.transform || null]);
    }
    return out;
})();

// Derived view: reset-able fields _snapshotBinding doesn't
// capture. Consumed by _auditSnapshotFields.
myCatnip._SNAPSHOT_IGNORED = (function() {
    var out = [];
    for (var i = 0; i < myCatnip._BINDING_FIELDS.length; i++) {
        if (myCatnip._BINDING_FIELDS[i].ignored) out.push(myCatnip._BINDING_FIELDS[i].name);
    }
    return out;
})();

// Tokenable fields, in _BINDING_FIELDS order. Consumed by
// _collectTokens (populates b._usedTokens) and _validateBindings
// (unknown-token warnings).
myCatnip._tokenFields = function(cfg) {
    var out = [];
    for (var i = 0; i < myCatnip._BINDING_FIELDS.length; i++) {
        var row = myCatnip._BINDING_FIELDS[i];
        if (!row.token) continue;
        var v = myCatnip.readPath(cfg, row.name);
        if (v === undefined) continue;
        var label = (typeof row.token === 'string') ? row.token : row.name;
        out.push([label, v]);
    }
    return out;
};

// ============================================================
// FUNC IDENTITY + HASHING
// ============================================================
// Stable function identity. Same function → same id;
// different closures never collide.
myCatnip._funcIdCounter = 0;
myCatnip._funcIdMap = new WeakMap();
myCatnip._funcId = function(fn) {
    if (typeof fn !== 'function') return '';
    var id = myCatnip._funcIdMap.get(fn);
    if (id === undefined) {
        id = '_' + (myCatnip._funcIdCounter++);
        myCatnip._funcIdMap.set(fn, id);
    }
    return id;
};

// Recursive helpers, hoisted. Called only at runtime, after
// myCatnip._stableStringify has been assigned.
function _stableStringifyArray(arr, seen) {
    var parts = [];
    for (var i = 0; i < arr.length; i++) parts.push(myCatnip._stableStringify(arr[i], seen));
    return '[' + parts.join(',') + ']';
}
function _stableStringifyObject(obj, seen) {
    var keys = Object.keys(obj).sort(), parts = [];
    for (var k = 0; k < keys.length; k++) {
        parts.push(JSON.stringify(keys[k]) + ':' + myCatnip._stableStringify(obj[keys[k]], seen));
    }
    return '{' + parts.join(',') + '}';
}
myCatnip._stableStringify = function(o, seen) {
    if (o === null) return 'null';
    if (o === undefined) return 'undefined';
    var t = typeof o;
    if (t === 'number' || t === 'boolean') return String(o);
    if (t === 'string') return JSON.stringify(o);
    if (t === 'function') return 'fn:' + myCatnip._funcId(o);
    if (t === 'object') {
        seen = seen || new Set();
        if (seen.has(o)) {
            myCatnip._warnOnce('stableStringifyCycle',
                '_stableStringify: cycle detected — hashing truncated');
            return '"[cycle]"';
        }
        seen.add(o);
        try {
            if (Array.isArray(o)) return _stableStringifyArray(o, seen);
            return _stableStringifyObject(o, seen);
        } finally { seen.delete(o); }
    }
    return String(o);
};

myCatnip._hashBindingValue = function(field, v) {
    if (v === undefined) return '';
    if (field === 'func') return myCatnip._funcId(v);
    if (typeof v === 'object' && v !== null) return myCatnip._stableStringify(v);
    // JSON-quote strings so a '\u0001' inside a CO name can't
    // shift the field boundary in _hashBinding's join. JSON's
    // encoder escapes \u0001 to "\u0001", so the literal
    // separator byte never appears in the quoted output.
    if (typeof v === 'string') return JSON.stringify(v);
    return String(v);
};

myCatnip._hashBinding = function(cfg) {
    if (cfg === null || cfg === undefined) return null;
    var parts = [];
    for (var i = 0; i < myCatnip._BINDING_CFG_FIELDS.length; i++) {
        var f = myCatnip._BINDING_CFG_FIELDS[i];
        parts.push(myCatnip._hashBindingValue(f, cfg[f]));
    }
    // \u0001 can't appear in CO names or numeric output;
    // JSON-quoted strings escape it.
    return parts.join('\u0001');
};

myCatnip._auditBindingCfg = function(cfg, name) {
    if (!myCatnip._debugPrintsOn) return;
    for (var k in cfg) {
        if (!cfg.hasOwnProperty(k) || k.charAt(0) === '_') continue;
        if (myCatnip._BINDING_CFG_FIELDS.indexOf(k) === -1) {
            print('[myCatnip] binding ' + name + ' has cfg key "' + k +
                  '" not in _BINDING_CFG_FIELDS — hash will miss it');
        }
    }
};

// ============================================================
// TOKENS
// ============================================================
// Resolved at bind time in group, inKey, outKey,
// schemeFromState.group, schemeFromState.co, on.group.
myCatnip.TOKENS = (function() {
    function channel(n) { return '[Channel' + n + ']'; }
    function unit(n)    { return '[EffectRack1_EffectUnit' + n + ']'; }
    function bare(n)    { return '' + n; }
    return [
        { token: '$DECK_A$', state: 'selectedDeckA', make: channel },
        { token: '$DECK_B$', state: 'selectedDeckB', make: channel },
        { token: '$DECK_ACTIVE$', state: 'selectedDeckCurrent', make: channel },
        { token: '$DECK_ACTIVE_N$', state: 'selectedDeckCurrent', make: bare },
        { token: '$DECK_ALT$', state: 'selectedDeckAlt', make: channel },
        { token: '$DECK_ALT_N$', state: 'selectedDeckAlt', make: bare },
        { token: '$DECK_A_N$', state: 'selectedDeckA', make: bare },
        { token: '$DECK_B_N$', state: 'selectedDeckB', make: bare },
        { token: '$FX_A$', state: 'selectedFxA', make: unit },
        { token: '$FX_B$', state: 'selectedFxB', make: unit },
        { token: '$FX_ACTIVE$', state: 'selectedFxCurrent', make: unit },
        { token: '$FX_ACTIVE_N$', state: 'selectedFxCurrent', make: bare },
        { token: '$FX_ALT$', state: 'selectedFxAlt', make: unit },
        { token: '$FX_ALT_N$', state: 'selectedFxAlt', make: bare },
        { token: '$FX_A_N$', state: 'selectedFxA', make: bare },
        { token: '$FX_B_N$', state: 'selectedFxB', make: bare }
    ];
})();

// Token membership, built once. TOKENS is immutable after the
// assignment above. _findUnknownTokens is called per-binding
// from _validateBindings, so O(1) lookup beats scanning.
var _KNOWN_TOKEN_SET = {};
for (var _ti = 0; _ti < myCatnip.TOKENS.length; _ti++) {
    _KNOWN_TOKEN_SET[myCatnip.TOKENS[_ti].token] = true;
}

myCatnip.resolve = function(str, ctrl) {
    if (typeof str !== 'string') return str;
    if (str.indexOf('$') === -1) return str;
    for (var i = 0; i < myCatnip.TOKENS.length; i++) {
        var t = myCatnip.TOKENS[i], v = ctrl[t.state];
        if (v === undefined) continue;
        if (str.indexOf(t.token) === -1) continue;
        str = str.split(t.token).join(t.make(v, ctrl));
    }
    return str;
};

var _TOKEN_RE = /\$[A-Z0-9_]+\$/g;
myCatnip._findUnknownTokens = function(str) {
    if (typeof str !== 'string' || str.indexOf('$') === -1) return [];
    var out = [], seen = {};
    _TOKEN_RE.lastIndex = 0;
    var m;
    while ((m = _TOKEN_RE.exec(str)) !== null) {
        var tok = m[0];
        if (_KNOWN_TOKEN_SET[tok]) continue;
        if (seen[tok]) continue;
        seen[tok] = true;
        out.push(tok);
    }
    return out;
};

// ============================================================
// BEAT MATH
// ============================================================
myCatnip.BEAT_HOLD = {};

// Cascade chain per level: most-specific entry first, falling
// through to the next field until a colour / brightness is
// found. `null` means "the base beat block".
var _BEAT_CHAIN = {
    prePhrase: ['prePhrase', 'phrase', 'bar', null],
    phrase:    ['phrase', 'bar', null],
    bar:       ['bar', null],
    beat:      [null]
};

// Resolve (barBeats, phraseBars) from shared.timeSig[ch] if set,
// else from the beat block's own fields, else from the engine
// defaults.
//
// ch undefined → fall back to channel 1. setTimeSig(bb, pb)
// 2-arg form sets all four channels, so this preserves v2.0.0's
// session-global semantic for callers that don't pass a channel.
function _resolveSig(beat, ch) {
    var sig = (ch !== undefined) ? shared.timeSig[ch] : shared.timeSig[1];
    if (sig) {
        var bb = sig.barBeats, pb = sig.phraseBars;
        if (bb >= 1 && bb === Math.floor(bb) && pb >= 1 && pb === Math.floor(pb)) {
            return { barBeats: bb, phraseBars: pb };
        }
        // Direct assignment bypasses setTimeSig's coercion;
        // warn-once and fall through to scheme defaults.
        myCatnip._warnOnce('timeSigInvalid',
            'shared.timeSig[' + ch + '] invalid — using scheme defaults');
    }
    return {
        barBeats: (typeof beat.barBeats === 'number' && beat.barBeats > 0)
            ? beat.barBeats : myCatnip.DEFAULT_BAR_BEATS,
        phraseBars: (typeof beat.phraseBars === 'number' && beat.phraseBars > 0)
            ? beat.phraseBars : myCatnip.DEFAULT_PHRASE_BARS
    };
}

myCatnip.beatLevel = function(beat, count, ch) {
    var sig = _resolveSig(beat, ch);
    var barBeats = sig.barBeats, phraseBars = sig.phraseBars;
    var phraseLen = barBeats * phraseBars;

    // `prePhraseBeats` marks the beat where the pre-phrase colour
    // starts, not a duration. With prePhraseBeats: 4 (and phraseLen
    // 16), only position 12 gets the prePhrase colour; 13–15 fall
    // through to bar/beat. If you want a zone, extend _BEAT_CHAIN
    // and this condition together.
    var preBeats = (typeof beat.prePhraseBeats === 'number')
        ? beat.prePhraseBeats : barBeats;
    if (preBeats < 0) preBeats = 0;
    if (preBeats >= phraseLen) preBeats = phraseLen - 1;
    var prePhraseStart = phraseLen - preBeats;

    // Modular position within the phrase, 0-based. Negative
    // counts (pre-marker playback) are handled by the double-mod.
    var phrasePos = ((count - 1) % phraseLen + phraseLen) % phraseLen;
    var level;
    if (preBeats > 0 && phrasePos === prePhraseStart) level = 'prePhrase';
    else if (phrasePos === 0) level = 'phrase';
    else if (phrasePos % barBeats === 0) level = 'bar';
    else level = 'beat';

    if (beat.half && level === 'beat' && (((count % 2) + 2) % 2 === 1)) {
        return { skip: true };
    }

    var chain = _BEAT_CHAIN[level] || [null];
    var out = { level: level, color: null, brightness: null };
    for (var i = 0; i < chain.length; i++) {
        var key = chain[i];
        var e = (key === null) ? beat : beat[key];
        if (!e) continue;
        if (out.color === null && e.color !== undefined) out.color = e.color;
        if (out.brightness === null && e.brightness !== undefined) out.brightness = e.brightness;
    }
    return out;
};

function _colorHasBrightness(spec) {
    if (typeof spec === 'string') return spec.split(',').length >= 2;
    if (Array.isArray(spec)) return spec.length >= 4;
    return false;
}

myCatnip.applyBeat = function(entry, beat, count, ch) {
    // Count 0 and negative counts are valid — the phrase origin
    // can sit anywhere in the track.
    if (!beat || typeof count !== 'number' || !isFinite(count)) return entry;
    var lc = myCatnip.beatLevel(beat, count, ch);
    if (!lc) return entry;
    if (lc.skip) return myCatnip.BEAT_HOLD;
    if (lc.color === null && lc.brightness === null) return entry;

    // Reuse entry.rgb unless the cascade supplies a new colour.
    // Downstream _sendColor reads indices without mutating, so
    // borrowing the array avoids one allocation per beat LED
    // render for the common brightness-only case.
    var out = {
        rgb: entry.rgb,
        brightness: entry.brightness,
        brightnessOff: entry.brightnessOff,
        type: entry.type
    };
    if (lc.color !== null) {
        var ce = myCatnip.resolveColorEntry(lc.color);
        if (ce && ce.rgb) {
            out.rgb = ce.rgb.slice();
            if (lc.brightness === null && _colorHasBrightness(lc.color)) {
                out.brightness = ce.brightness;
            }
        }
    }
    if (typeof lc.brightness === 'number') out.brightness = lc.brightness;
    return out;
};