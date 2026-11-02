// myCatnip-lib-schemes.js — scheme engine: palette lookup, Mixxx
// colour dispatch, colour-spec parsing, compile / sample pipeline.
//
// Loaded by every preset, before any preset's binding config.
// Preset-specific schemes, THEME, and QFX_CHAIN_LIST live in
// the preset files — see myCatnip-cat.js.
//
// Palette and Mixxx-colour tables live on the hardware descriptor
// (myCatnip.HW_K3.PALETTE, myCatnip.HW_K3.MIXXX_COLORS). The
// framework hooks resolveNamedColour / mapMixxxColor are
// overridden by the descriptor at module load; this file only
// declares consumers.
//
// Transfer-curve data (measured [hw, luminance] pairs per
// hardware) lives on myCatnip.HW_K3.LED_TRANSFERS; the normaliser
// _buildTransferRGB lives in myCatnip-lib-core.js. Neither is
// duplicated here.

'use strict';

(function() {
    if (typeof myCatnip === 'undefined') {
        throw new Error('Xone K3: <filename> — myCatnip-lib-core.js must load first');
    }

    if (typeof myCatnip._requireLoad !== 'function') {
        throw new Error('Xone K3: myCatnip-lib-schemes.js — myCatnip-lib-core.js must load first');
    }
    myCatnip._requireLoad('myCatnip-lib-schemes.js',
        ['CURVE_GAIN', 'DEFAULT_RGB_BRIGHTNESS',
         'DEFAULT_RGB_BRIGHTNESS_OFF', 'DEFAULT_CO_SCHEME',
         'CO_MATCH_EPSILON', 'RATIO_GAIN',
         'resolveNamedColour', 'mapMixxxColor']);

    // ============================================================
    // PALETTE + MIXXX COLOURS — live on the hardware descriptor
    // ============================================================
    // These were framework-global until v1.2.0 but are
    // hardware-specific: the RGB values are K3's perceived
    // colours, tuned against measured transfer curves. A different
    // hardware tunes different values (or omits one/both entirely
    // and renders those LEDs dark).
    //
    // Framework hook defaults (return null + warn once) live in
    // lib-core.js. HW_K3.PALETTE and HW_K3.MIXXX_COLORS live in
    // myCatnip-hw-k3.js, which overrides resolveNamedColour /
    // mapMixxxColor at module load.

    // ============================================================
    // COLOUR RESOLVER
    // ============================================================
    // Palette lookups dispatch through myCatnip.resolveNamedColour.
    // No copy registry — a copy was only ever a boot-time snapshot,
    // and _parseNamedEntry runs at compile time anyway.

    // ---------- Colour-entry parsing ----------
    // A colour spec is normalised to a `parts` array (the same
    // shape a comma-separated string produces), then dispatched
    // by the shape of parts[0]:
    //   'mixxx'            type:'mixxx', rgb deferred to the pad
    //   numeric, len >= 3  explicit R,G,B [brightness [off]]
    //   anything else      named-palette lookup

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

    function _parseNamedEntry(parts, DEF) {
        var first = (typeof parts[0] === 'string') ? parts[0].toLowerCase() : parts[0];
        var rgbNamed = myCatnip.resolveNamedColour(first);
        if (!rgbNamed) return null;
        return {
            rgb: rgbNamed.slice(),
            brightness:    _pickBr(parts, 1, DEF),
            brightnessOff: _pickBrOrNull(parts, 2)
        };
    }

    myCatnip.resolveColorEntry = function(entry, defaultBr) {
        if (entry === undefined || entry === null) return null;
        var DEF = (typeof defaultBr === 'number')
            ? Math.max(0, Math.min(127, defaultBr))
            : myCatnip.DEFAULT_RGB_BRIGHTNESS;

        var parts = _normalizeColorParts(entry);
        if (!parts || parts.length === 0 || parts[0] === '') return null;

        if (parts[0] === 'mixxx') return _parseMixxxEntry(parts, DEF);

        var n0 = parseInt(parts[0], 10);
        if (!isNaN(n0) && parts.length >= 3) return _parseRgbEntry(parts, DEF);

        return _parseNamedEntry(parts, DEF);
    };

    // ============================================================
    // SCHEME REGISTRY
    // ============================================================
    // Presets extend this. Only coMatch ships here — it's the
    // engine's default co-steering ramp, referenced by
    // SCHEME_DEFAULTS.coScheme and used by any deviation LED
    // whose knob and CO disagree.
    myCatnip.SCHEMES = {};
    myCatnip._schemeCache = {};
    myCatnip._compiledCache = {};

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
        beat: null
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
    myCatnip._buildSegments = function(colors, ratio, brightness) {
        if (!Array.isArray(colors) || colors.length === 0) return null;
        var resolved = [];
        for (var i = 0; i < colors.length; i++) {
            var e = colors[i], colorSpec = e, ratioSpec = null;
            if (e && typeof e === 'object' && !Array.isArray(e) && e.color !== undefined) {
                colorSpec = e.color;
                if (e.ratio !== undefined) ratioSpec = e.ratio;
            }
            var c = myCatnip.resolveColorEntry(colorSpec, brightness);
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
        // Shift the input axis first, clamp, then warp. This makes
        // schemePosition slide the whole curve — including its
        // pivot — through knob space, instead of sliding a
        // pre-warped signal. Out-of-range inputs clamp to 0 or 1
        // and hold the boundary segment colour. Reordering from
        // the old (warp → shift → clamp) also preserves the
        // curve's shape at every position: previously the steep
        // pivot at 0.5 was eaten by clamp before the shift could
        // move it.
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

    // Off-ramp derived from an on-ramp: keep each segment's bounds
    // and colour, drop brightness to the default off level. Used
    // when a scheme has no explicit offScheme. Boundaries matter
    // — a scheme that re-shapes its off-ramp would break
    // sample-position alignment with the on-ramp otherwise.
    myCatnip._generateOff = function(segs) {
        var offBr = myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF, out = [];
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
    // Two shapes:
    //   full   — raw has `colors`, gets tmap / off / co / marker
    //            / beat
    //   single — bare colour spec ('red, 80' / [127,0,0]),
    //            hard-coded 1-segment ramp with no dynamics
    //
    // The dispatcher handles cache lookup. A bare colour spec is
    // cached by name when ref is a string and no overrides were
    // passed. Cached values are never null (both helpers early-
    // return null before the cache write), matching the previous
    // behaviour.

    myCatnip._compileFullScheme = function(raw, overrides, seen) {
        if (overrides) raw = Object.assign({}, raw, overrides);

        var onSegs = myCatnip._buildSegments(raw.colors, raw.ratio, raw.brightness);
        if (!onSegs) return null;

        var offSegs = null;
        if (raw.offScheme) {
            var offC = myCatnip.compileScheme(raw.offScheme, undefined, seen);
            if (offC) offSegs = offC.on;
        }
        if (!offSegs) offSegs = myCatnip._generateOff(onSegs);

        var coCompiled = null;
        if (raw.coScheme !== null && raw.coScheme !== false) {
            var coName = raw.coScheme || myCatnip.DEFAULT_CO_SCHEME;
            if (coName) coCompiled = myCatnip.compileScheme(coName, undefined, seen);
        }

        var marker = raw.markerColor
            ? myCatnip.resolveColorEntry(raw.markerColor, raw.brightness)
            : null;
        if (marker &&
            (marker.brightnessOff === undefined || marker.brightnessOff === null)) {
            marker.brightnessOff = myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF;
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
            beat: (raw.beat && raw.beat.enabled !== false) ? raw.beat : null
        };
    };

    myCatnip._compileSingleColor = function(ref) {
        var entry = myCatnip.resolveColorEntry(ref);
        if (!entry) return null;
        var offBr = (typeof entry.brightnessOff === 'number')
            ? entry.brightnessOff : myCatnip.DEFAULT_RGB_BRIGHTNESS_OFF;
        return {
            on:  [{ start: 0, end: 1, color: entry }],
            off: [{ start: 0, end: 1,
                    color: { rgb: entry.rgb, brightness: offBr, type: entry.type } }],
            co: null, marker: null,
            tmap: { position: 0, curve: 0 },
            markerPosition: 63.5, markerWidth: 0,
            interp: false, calibration: false, brightnessScale: 1,
            reverse: false, beat: null
        };
    };

    myCatnip.compileScheme = function(ref, overrides, seen) {
        var cacheable = (typeof ref === 'string') && !overrides;
        if (cacheable && myCatnip._compiledCache[ref]) return myCatnip._compiledCache[ref];

        // Cycle detection. A scheme that names itself (directly or
        // through a chain) in offScheme / coScheme would otherwise
        // recurse until the JS stack overflows on first render.
        // Strings match by value, objects by reference. The cycle
        // is broken at the innermost back-reference: that
        // referencing field compiles to null, the outer call
        // finishes normally.
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
            compiled = myCatnip._compileFullScheme(raw, overrides, seen);
        } else {
            compiled = myCatnip._compileSingleColor(ref);
        }

        seen.delete(ref);
        if (cacheable && compiled) myCatnip._compiledCache[ref] = compiled;
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

    // Snap sample: pick the segment whose span contains t (end-
    // inclusive, last-segment fallback).
    //
    // `mixxx`-typed stops have null rgb — they only work on the
    // static single-colour path (`_renderStatic` → `_sendColor`,
    // which resolves rgb from the pad's hotcue colour CO at
    // render time). Sampling can't use them, so they're skipped;
    // the previous valid stop's colour is used instead (or null /
    // black LED when there is none). Warn once so the user can
    // see why a stop is being ignored.
    function _sampleSnap(segs, t) {
        // Index-tracked instead of wrapper-object-tracked to
        // avoid allocating a fresh { rgb, brightness, type } on
        // every iteration before the match.
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

    // Blend sample: linear-interp between the two segment centres
    // surrounding t. Centre-based means the colour of segment i
    // sits at (start+end)/2, so the blend region between two
    // segments straddles the boundary between them. Previous
    // behaviour preserved exactly — including the "before falls
    // through to after" and "return before if after is null" edge
    // cases at t<firstCentre and t>lastCentre.
    //
    // Null-rgb (mixxx) stops are skipped — see _sampleSnap.
    function _sampleBlend(segs, t) {
        // Index-tracked before/after — avoids the intermediate
        // { t, color } wrapper allocation per candidate segment.
        // Behaviour is identical: `before` is the last centre <= t,
        // `after` is the first centre >= t.
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

    // Shared by Binding._renderCoMatch and LabController._renderCoMatch.
    // When a deviation LED's physical knob position disagrees with
    // its bound CO by more than CO_MATCH_EPSILON, the LED shows the
    // matching gradient so the user can nudge until they line up.
    // Returns the ramp to sample plus the t-point along it, or
    // null when the knob and CO already agree (or when the scheme
    // has no co-ramp, or the group / key are missing).
    //
    //   compiled  the outer compiled scheme (needs .co)
    //   group     CO group to read the target position from
    //   key       CO name to read
    //   physical  knob position, 0..1
    //   isOn      current LED on-state; picks on-ramp or off-ramp
    //
    // Caller feeds the return through _sampleRamp / _sendSampled
    // with skipBeat=true — co-match bypasses the beat cascade.
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
    // Default co-steering ramp — shown when a deviation LED's
    // knob disagrees with its bound CO. Referenced by
    // SCHEME_DEFAULTS.coScheme. Override per-scheme with
    // coScheme: 'name' or coScheme: null to disable.
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
})();