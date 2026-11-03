// lib/schemes.mjs — scheme engine: palette lookup, Mixxx colour
// dispatch, colour-spec parsing, compile / sample pipeline.
//
// Loaded after lib/core.mjs. Per-HW palette: resolveColorEntry and
// friends thread ctrl through for palette lookup. Compile cache is
// per-HW (WeakMap keyed on hw object).
//
// No perception math here — perception lives in lib/perception.mjs.
// Scheme compile carries a `perception` field through to render.


// ============================================================
// COLOUR RESOLVER
// ============================================================
// A colour spec is normalised to a `parts` array (the same shape
// a comma-separated string produces), then dispatched by the
// shape of parts[0]:
//   'mixxx'            type:'mixxx', rgb deferred to render time
//   numeric, len >= 3  explicit R,G,B [brightness [off]]
//   anything else      named-palette lookup (per-HW)

function _normalizeColorParts(entry) {
    if (typeof entry === 'string') {
        return entry.split(',').map(function(s) { return s.trim(); });
    }
    if (Array.isArray(entry)) {
        return entry.map(function(v) {
            return (typeof v === 'string') ? v.trim() : v;
        });
    }
    return null;
}

function _clampBr(v) { return Math.max(0, Math.min(127, v)); }

function _pickBr(parts, i, fb) {
    if (parts.length <= i) return fb;
    var v = parseInt(parts[i], 10);
    return isNaN(v) ? fb : _clampBr(v);
}

function _pickBrOrNull(parts, i) {
    if (parts.length <= i) return null;
    var v = parseInt(parts[i], 10);
    return isNaN(v) ? null : _clampBr(v);
}

function _parseMixxxEntry(parts, DEF) {
    return {
        rgb: null,
        brightness:    _pickBr(parts, 1, DEF),
        brightnessOff: _pickBrOrNull(parts, 2),
        type: 'mixxx'
    };
}

function _parseRgbEntry(parts, DEF) {
    var r = parseInt(parts[0], 10);
    var g = parseInt(parts[1], 10);
    var b = parseInt(parts[2], 10);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return {
        rgb: [_clampBr(r), _clampBr(g), _clampBr(b)],
        brightness:    _pickBr(parts, 3, DEF),
        brightnessOff: _pickBrOrNull(parts, 4)
    };
}

function _parseNamedEntry(parts, DEF, ctrl) {
    var first = (typeof parts[0] === 'string') ? parts[0].toLowerCase() : parts[0];
    var rgbNamed = myCatnip.resolveNamedColour(first, ctrl);
    if (!rgbNamed) return null;
    return {
        rgb: rgbNamed.slice(),
        brightness:    _pickBr(parts, 1, DEF),
        brightnessOff: _pickBrOrNull(parts, 2)
    };
}

myCatnip.resolveColorEntry = function(entry, defaultBr, ctrl) {
    if (entry === undefined || entry === null) return null;
    var DEF;
    if (typeof defaultBr === 'number') {
        DEF = Math.max(0, Math.min(127, defaultBr));
    } else if (ctrl && ctrl.hw && typeof ctrl.hw.DEFAULT_RGB_BRIGHTNESS === 'number') {
        DEF = ctrl.hw.DEFAULT_RGB_BRIGHTNESS;
    } else {
        DEF = myCatnip.DEFAULT_RGB_BRIGHTNESS;
    }

    var parts = _normalizeColorParts(entry);
    if (!parts || parts.length === 0 || parts[0] === '') return null;

    if (parts[0] === 'mixxx') return _parseMixxxEntry(parts, DEF);

    var n0 = parseInt(parts[0], 10);
    if (!isNaN(n0) && parts.length >= 3) return _parseRgbEntry(parts, DEF);

    return _parseNamedEntry(parts, DEF, ctrl);
};

// ============================================================
// SCHEME REGISTRY
// ============================================================
myCatnip.SCHEMES = {};
myCatnip._schemeCache = {};           // global (raw scheme objects)
myCatnip._compiledCache = {};         // fallback when no ctrl
myCatnip._compiledCacheByHw = new WeakMap();   // per-HW compiled cache

// SCHEME_DEFAULTS — the shape a scheme is normalised to.
// `perception` is a per-scheme override: undefined/null = use HW
// default; false = bypass; object = { mix, brightness } partial.
myCatnip.SCHEME_DEFAULTS = {
    colors: null,
    ratio: null,
    curve: 0,
    schemePosition: 63.5,
    interp: true,
    calibration: true,
    brightness: 127,
    brightnessScale: 1,
    markerColor: null,
    markerPosition: 63.5,
    markerWidth: 0,
    offScheme: null,
    coScheme: 'coMatch',
    reverse: false,
    beat: null,
    perception: null
};

myCatnip.resolveScheme = function(ref) {
    if (typeof ref === 'string' && myCatnip._schemeCache[ref]) {
        return myCatnip._schemeCache[ref];
    }

    var raw;
    if (typeof ref === 'string') {
        raw = myCatnip.SCHEMES[ref];
        if (!raw) return null;
    } else if (ref && typeof ref === 'object' && !Array.isArray(ref)) {
        var refKey = JSON.stringify(ref).slice(0, 60);
        if (ref.patch) {
            myCatnip._warnOnce('schemePatch:' + refKey,
                'scheme patch syntax removed — pass a plain scheme ' +
                'object, or build one via composeScheme in config. Got: ' +
                JSON.stringify(ref).slice(0, 120));
            return null;
        }
        if (!ref.colors && Object.keys(ref).length > 0) {
            myCatnip._warnOnce('schemeNoColors:' + refKey,
                'scheme object has no colors — partials are no longer ' +
                'supported. Got: ' + JSON.stringify(ref).slice(0, 120));
            return null;
        }
        raw = ref;
    } else {
        return null;
    }

    var out = Object.assign({}, myCatnip.SCHEME_DEFAULTS, raw);
    if (typeof ref === 'string') myCatnip._schemeCache[ref] = out;
    return out;
};

// ============================================================
// SEGMENTS — colour stops to weighted ranges
// ============================================================
myCatnip._buildSegments = function(colors, ratio, brightness, ctrl) {
    if (!Array.isArray(colors) || colors.length === 0) return null;
    var resolved = [];
    for (var i = 0; i < colors.length; i++) {
        var e = colors[i], colorSpec = e, ratioSpec = null;
        if (e && typeof e === 'object' && !Array.isArray(e) && e.color !== undefined) {
            colorSpec = e.color;
            if (e.ratio !== undefined) ratioSpec = e.ratio;
        }
        var c = myCatnip.resolveColorEntry(colorSpec, brightness, ctrl);
        if (!c) {
            myCatnip._warnOnce('segUnresolved:' + String(colorSpec),
                '_buildSegments: could not resolve colour spec ' +
                JSON.stringify(colorSpec).slice(0, 60) +
                ' — segment skipped. Check spelling or palette name.');
            continue;
        }
        var w;
        if (ratioSpec !== null) w = ratioSpec;
        else if (Array.isArray(ratio) && i < ratio.length && ratio[i] !== undefined) w = ratio[i];
        else w = 1;
        if (w <= 0) w = 0;
        resolved.push({ color: c, weight: w });
    }
    if (resolved.length === 0) return null;
    var total = 0;
    for (var j = 0; j < resolved.length; j++) total += resolved[j].weight;
    if (total <= 0) total = resolved.length;
    var cum = 0, segs = [];
    for (var k = 0; k < resolved.length; k++) {
        var w2 = resolved[k].weight / total;
        segs.push({ start: cum, end: cum + w2, color: resolved[k].color });
        cum += w2;
    }
    return segs;
};

// Symmetric warp around the 0.5 pivot. `k > 0` squishes
// boundaries toward the pivot, `k < 0` expands them away.
// Unity at k=0, t=0, and t=1.
function _warp(t, k) {
    if (k === 0 || t <= 0 || t >= 1) return t;
    var e = Math.pow(2, -k * myCatnip.CURVE_GAIN);
    if (t < 0.5) {
        return 0.5 * Math.pow(t / 0.5, e);
    }
    var u = (t - 0.5) / 0.5;
    return 0.5 + 0.5 * (1 - Math.pow(1 - u, e));
}
myCatnip._warp = _warp;

myCatnip.sampleT = function(compiled, t) {
    var m = compiled.tmap;
    if (!m) return t;
    // Shift input axis first, clamp, then warp.
    t = t - m.position;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    if (m.curve !== 0) t = _warp(t, m.curve);
    return t;
};

myCatnip._computeTmap = function(raw) {
    return {
        position: (raw.schemePosition - 63.5) / 127,
        curve: raw.curve || 0
    };
};

// Off-ramp derived from an on-ramp. Off-brightness per-HW.
myCatnip._generateOff = function(segs, ctrl) {
    var offBr = (ctrl && ctrl.hw && typeof ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF === 'number')
        ? ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF
        : myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF;
    var out = [];
    for (var i = 0; i < segs.length; i++) {
        var c = segs[i].color;
        out.push({ start: segs[i].start, end: segs[i].end,
                   color: { rgb: c.rgb, brightness: offBr, type: c.type } });
    }
    return out;
};

// ============================================================
// COMPILE
// ============================================================
myCatnip._compileFullScheme = function(raw, overrides, seen, ctrl) {
    if (overrides) raw = Object.assign({}, raw, overrides);

    var onSegs = myCatnip._buildSegments(raw.colors, raw.ratio, raw.brightness, ctrl);
    if (!onSegs) return null;

    var offSegs = null;
    if (raw.offScheme) {
        var offC = myCatnip.compileScheme(raw.offScheme, undefined, seen, ctrl);
        if (offC) offSegs = offC.on;
    }
    if (!offSegs) offSegs = myCatnip._generateOff(onSegs, ctrl);

    var coCompiled = null;
    if (raw.coScheme !== null && raw.coScheme !== false) {
        var coName = raw.coScheme || myCatnip.DEFAULT_CO_SCHEME;
        if (coName) coCompiled = myCatnip.compileScheme(coName, undefined, seen, ctrl);
    }

    var marker = raw.markerColor
        ? myCatnip.resolveColorEntry(raw.markerColor, raw.brightness, ctrl)
        : null;
    if (marker &&
        (marker.brightnessOff === undefined || marker.brightnessOff === null)) {
        marker.brightnessOff = (ctrl && ctrl.hw && typeof ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF === 'number')
            ? ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF
            : myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF;
    }

    // Legacy: `calibration: false` → skip brightness solve (but
    // keep mix). Preserves v2.0.0 filter-scheme behaviour. If the
    // scheme explicitly sets perception, that wins.
    var perceptionOverride = raw.perception;
    if (perceptionOverride === undefined && raw.calibration === false) {
        perceptionOverride = { brightness: 'off' };
    }

    return {
        on: onSegs, off: offSegs, co: coCompiled, marker: marker,
        tmap: myCatnip._computeTmap(raw),
        markerPosition: (typeof raw.markerPosition === 'number') ? raw.markerPosition : 63.5,
        markerWidth:    (typeof raw.markerWidth    === 'number') ? raw.markerWidth    : 0,
        interp:         raw.interp !== false,
        calibration:    raw.calibration !== false,
        brightnessScale:(typeof raw.brightnessScale === 'number') ? raw.brightnessScale : 1,
        reverse:        raw.reverse === true,
        beat: (raw.beat && raw.beat.enabled !== false) ? raw.beat : null,
        perception:     perceptionOverride !== undefined ? perceptionOverride : null
    };
};

myCatnip._compileSingleColor = function(ref, ctrl) {
    var entry = myCatnip.resolveColorEntry(ref, undefined, ctrl);
    if (!entry) return null;
    var offBr = (typeof entry.brightnessOff === 'number')
        ? entry.brightnessOff
        : ((ctrl && ctrl.hw && typeof ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF === 'number')
            ? ctrl.hw.DEFAULT_RGB_BRIGHTNESS_OFF
            : myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF);
    return {
        on:  [{ start: 0, end: 1, color: entry }],
        off: [{ start: 0, end: 1,
                color: { rgb: entry.rgb, brightness: offBr, type: entry.type } }],
        co: null, marker: null,
        tmap: { position: 0, curve: 0 },
        markerPosition: 63.5, markerWidth: 0,
        interp: false, calibration: false, brightnessScale: 1,
        reverse: false, beat: null,
        perception: null
    };
};

// Per-HW compile cache. Falls back to global when no ctrl (tests,
// direct callers without context).
function _getCompileCache(ctrl) {
    if (!ctrl || !ctrl.hw) return myCatnip._compiledCache;
    var c = myCatnip._compiledCacheByHw.get(ctrl.hw);
    if (!c) {
        c = {};
        myCatnip._compiledCacheByHw.set(ctrl.hw, c);
    }
    return c;
}

myCatnip.compileScheme = function(ref, overrides, seen, ctrl) {
    var cacheable = (typeof ref === 'string') && !overrides;
    var cache = cacheable ? _getCompileCache(ctrl) : null;
    if (cacheable && cache[ref]) return cache[ref];

    seen = seen || new Set();
    if (seen.has(ref)) {
        if (typeof ref === 'string') {
            myCatnip._warnOnce('schemeCycle:' + ref,
                'scheme "' + ref + '" references itself in its ' +
                'offScheme / coScheme chain — cycle broken, the ' +
                'referencing field renders as null');
        }
        return null;
    }
    seen.add(ref);

    var raw = myCatnip.resolveScheme(ref);
    var compiled;
    if (raw && raw.colors && raw.colors.length > 0) {
        compiled = myCatnip._compileFullScheme(raw, overrides, seen, ctrl);
    } else {
        compiled = myCatnip._compileSingleColor(ref, ctrl);
    }

    seen.delete(ref);
    if (cacheable && compiled) cache[ref] = compiled;
    return compiled;
};

// ============================================================
// SAMPLING
// ============================================================
myCatnip.markerHit = function(compiled, devDir) {
    var at = (compiled.markerPosition / 127) * 2 - 1;
    var half = (compiled.markerWidth || 0) / 127;
    return half > 0 && !!compiled.marker && Math.abs(devDir - at) <= half;
};

myCatnip.scaleTarget = function(target, scale) {
    if (target === null) return null;
    if (typeof scale !== 'number' || scale === 1) return target;
    return target * scale;
};

function _sampleSnap(segs, t) {
    var lastValidIdx = -1;
    for (var i = 0; i < segs.length; i++) {
        var c = segs[i].color;
        if (!c || c.rgb === null) {
            myCatnip._warnOnce('sampleSegsMixxx',
                'sampling a scheme containing a `mixxx` colour stop — ' +
                '`mixxx` is only supported on static single-colour LEDs. ' +
                'The stop is skipped during sampling.');
            if (t <= segs[i].end || i === segs.length - 1) {
                if (lastValidIdx === -1) return null;
                var lv = segs[lastValidIdx].color;
                return {
                    rgb: [lv.rgb[0], lv.rgb[1], lv.rgb[2]],
                    brightness: lv.brightness,
                    type: lv.type
                };
            }
            continue;
        }
        lastValidIdx = i;
        if (t <= segs[i].end || i === segs.length - 1) {
            return {
                rgb: [c.rgb[0], c.rgb[1], c.rgb[2]],
                brightness: c.brightness,
                type: c.type
            };
        }
    }
    return null;
}

function _sampleBlend(segs, t) {
    var beforeIdx = -1, beforeT = 0;
    var afterIdx  = -1, afterT  = 0;
    for (var j = 0; j < segs.length; j++) {
        var c = segs[j].color;
        if (!c || c.rgb === null) {
            myCatnip._warnOnce('sampleSegsMixxx',
                'sampling a scheme containing a `mixxx` colour stop — ' +
                '`mixxx` is only supported on static single-colour LEDs. ' +
                'The stop is skipped during sampling.');
            continue;
        }
        var centre = (segs[j].start + segs[j].end) / 2;
        if (centre <= t) { beforeIdx = j; beforeT = centre; }
        if (centre >= t && afterIdx === -1) { afterIdx = j; afterT = centre; }
    }
    if (beforeIdx === -1 && afterIdx === -1) return null;
    if (beforeIdx === -1) { beforeIdx = afterIdx; beforeT = afterT; }
    if (afterIdx  === -1) { afterIdx  = beforeIdx; afterT  = beforeT; }
    var cA = segs[beforeIdx].color;
    if (beforeIdx === afterIdx || beforeT === afterT) {
        return {
            rgb: [cA.rgb[0], cA.rgb[1], cA.rgb[2]],
            brightness: cA.brightness,
            type: cA.type
        };
    }
    var lt = (t - beforeT) / (afterT - beforeT);
    var cB = segs[afterIdx].color;
    return {
        rgb: [
            Math.round(cA.rgb[0]*(1-lt)+cB.rgb[0]*lt),
            Math.round(cA.rgb[1]*(1-lt)+cB.rgb[1]*lt),
            Math.round(cA.rgb[2]*(1-lt)+cB.rgb[2]*lt)
        ],
        brightness: Math.round(cA.brightness*(1-lt)+cB.brightness*lt),
        type: cA.type || cB.type
    };
}

myCatnip.sampleSegs = function(segs, t, interp) {
    if (!segs || segs.length === 0) return null;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return interp ? _sampleBlend(segs, t) : _sampleSnap(segs, t);
};

myCatnip.coMatchSample = function(compiled, group, key, physical, isOn, cachedCoVal) {
    if (!compiled || !compiled.co) return null;
    if (!group || !key) return null;
    var coVal = (typeof cachedCoVal === 'number')
        ? cachedCoVal
        : engine.getParameter(group, key);
    var dev = physical - coVal;
    if (dev < -1) dev = -1;
    if (dev > 1)  dev = 1;
    if (Math.abs(dev) <= myCatnip.CO_MATCH_EPSILON) return null;
    return {
        ramp: isOn ? compiled.co.on : compiled.co.off,
        t: (dev + 1) / 2
    };
};

// ============================================================
// ENGINE DEFAULT — co-steering ramp
// ============================================================
myCatnip.SCHEMES.coMatch = {
    colors: [
        [100, 55, 55],
        [100, 69, 69],
        [95, 79, 32],
        [57, 41, 12]
    ],
    ratio: [30, 20, 20, 30],
    curve: -0.75,
    markerWidth: 0,
    coScheme: null
};

