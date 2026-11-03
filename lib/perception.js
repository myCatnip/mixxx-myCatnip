// lib/perception.js — perception model: curves, LUTs, emit,
// mix correction, brightness solve.
//
// Imports the shared myCatnip namespace from core.js.
//
// The hardware supplies its model via PERCEPTION:
//   curves: {r,g,b} | 'name' | samples: [{step,rgb}] | custom: fn
//   wbGain, weights, gamma, hkBoost   (optional model params)
//   mode: { mix: 'correct'|'off', brightness: 'own'|'flat'|'off' }
//
// Model A (all params present, e.g. K3): pre-mix rgb is mix-
// corrected internally to produce wire values, then emit is:
//   Σ (postMix[ch]/127) × curve_ch(hw) × weights[ch]
//   ^ gamma × (1 + hkBoost × saturation(postMix))
//
// Model B (curves only): per-channel sum at effective input.
//
// One rendering path: sendLED calls applyMix (mix→post-mix rgb),
// hw.send transports. _emitAt uses the same mix internally so
// prediction matches what sendLED actually sends.


(function() {
    var _rampIdCounter = 0;

    // Per-HW caches. HW descriptors are objects — WeakMap keys.
    var _deriveCache = new WeakMap();   // HW → { curves, luts }
    var _flatCache   = new WeakMap();   // HW → Map<rampId, {key, value}>
    var _hwCache     = new WeakMap();   // HW → Map<string, hw>

    // ============================================================
    // CURVE NORMALISATION
    // ============================================================
    function _normalizeChannel(list, keyName) {
        var sorted = list.slice().sort(function(a, b) { return a[0] - b[0]; });
        var maxLum = 0;
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i][1] > maxLum) maxLum = sorted[i][1];
        }
        if (maxLum <= 0) return null;
        var cur = [], prev = -Infinity;
        for (var j = 0; j < sorted.length; j++) {
            var hw = Math.max(0, Math.min(127, sorted[j][0]));
            var lum = sorted[j][1] / maxLum;
            if (lum < prev) {
                myCatnip._warnOnce('perceptionNonMono:' + keyName + ':' + hw,
                    'perception curve channel "' + keyName +
                    '" not monotonic at hw=' + hw + ' — flattening');
                lum = prev;
            }
            if (lum > 1) lum = 1;
            cur.push([hw, lum]);
            prev = lum;
        }
        return cur;
    }

    function _buildTransfer(raw) {
        if (!raw || !raw.r || !raw.g || !raw.b) return null;
        var out = {}, keys = ['r', 'g', 'b'];
        for (var k = 0; k < 3; k++) {
            var n = _normalizeChannel(raw[keys[k]], keys[k]);
            if (!n) return null;
            out[keys[k]] = n;
        }
        return out;
    }

    function _sampleTransfer(table, hw) {
        if (!table || table.length === 0) return hw / 127;
        if (hw <= table[0][0]) return table[0][1];
        var last = table.length - 1;
        if (hw >= table[last][0]) return table[last][1];
        var lo = 1, hi = last;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (table[mid][0] >= hw) hi = mid;
            else lo = mid + 1;
        }
        var j = lo, i = j - 1;
        var span = table[j][0] - table[i][0];
        if (span <= 0) return table[i][1];
        var t = (hw - table[i][0]) / span;
        return table[i][1] * (1 - t) + table[j][1] * t;
    }

    // ============================================================
    // SAMPLE DERIVATION
    // ============================================================
    function _deriveFromSamples(samples) {
        if (!Array.isArray(samples) || samples.length < 2) {
            myCatnip._warnOnce('perceptionSamplesFew',
                'perception: samples array has fewer than 2 entries — ignoring');
            return null;
        }
        var channels = ['r', 'g', 'b'];
        var sorted = samples.slice().sort(function(a, b) { return b.step - a.step; });
        var raw = { r: [], g: [], b: [] };
        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            if (!s || !Array.isArray(s.rgb) || s.rgb.length < 3) continue;
            if (typeof s.step !== 'number' || !isFinite(s.step)) continue;
            for (var c = 0; c < 3; c++) raw[channels[c]].push([s.rgb[c], s.step / 3]);
        }
        var out = {};
        for (var c2 = 0; c2 < 3; c2++) {
            var ch = channels[c2];
            var list = raw[ch].sort(function(a, b) { return a[0] - b[0]; });
            var seen = {}, deduped = [];
            for (var j = 0; j < list.length; j++) {
                if (seen[list[j][0]] !== undefined) {
                    myCatnip._warnOnce('perceptionSampleDup:' + ch + ':' + list[j][0],
                        'perception: duplicate wire value ' + list[j][0] +
                        ' for channel "' + ch + '" — keeping first');
                    continue;
                }
                seen[list[j][0]] = true;
                deduped.push(list[j]);
            }
            var peak = 0;
            for (var k = 0; k < deduped.length; k++) {
                if (deduped[k][1] > peak) peak = deduped[k][1];
            }
            if (peak <= 0) {
                myCatnip._warnOnce('perceptionSamplePeak:' + ch,
                    'perception: samples channel "' + ch +
                    '" all zero — ignoring');
                return null;
            }
            var normalised = [];
            for (var m = 0; m < deduped.length; m++) {
                normalised.push([deduped[m][0], deduped[m][1] / peak]);
            }
            out[ch] = normalised;
        }
        return out;
    }

    // ============================================================
    // DERIVATION (cached per HW)
    // ============================================================
    function _deriveCurves(hw) {
        if (_deriveCache.has(hw)) return _deriveCache.get(hw).curves;

        var P = hw.PERCEPTION;
        if (!P || P.custom) {
            _deriveCache.set(hw, { curves: null, luts: null });
            return null;
        }

        var curves = null;
        if (typeof P.curves === 'string') {
            var raw = hw.LED_TRANSFERS && hw.LED_TRANSFERS[P.curves];
            if (raw) curves = _buildTransfer(raw);
            else {
                myCatnip._warnOnce('perceptionCurveMissing:' + P.curves,
                    'perception: LED_TRANSFERS["' + P.curves + '"] not found');
            }
        } else if (P.curves && typeof P.curves === 'object') {
            curves = _buildTransfer(P.curves);
        } else if (Array.isArray(P.samples)) {
            curves = _deriveFromSamples(P.samples);
        }

        var luts = curves ? _deriveLuts(curves) : null;
        _deriveCache.set(hw, { curves: curves, luts: luts });
        return curves;
    }

    function _deriveLuts(curves) {
        var luts = {}, channels = ['r', 'g', 'b'];
        for (var c = 0; c < 3; c++) {
            var ch = channels[c];
            var curve = curves[ch];
            var lut = new Uint8Array(128);
            for (var i = 0; i < 128; i++) lut[i] = _invertCurve(curve, i / 127);
            luts[ch] = lut;
        }
        return luts;
    }

    function _invertCurve(curve, target) {
        var lo = 0, hi = 127;
        for (var i = 0; i < 8; i++) {
            var mid = (lo + hi) / 2;
            if (_sampleTransfer(curve, mid) < target) lo = mid;
            else hi = mid;
        }
        return Math.round((lo + hi) / 2);
    }

    // ============================================================
    // MIX CORRECTION
    // ============================================================
    // WB multiply if wbGain present (K3). Else inverse LUT (LUT-
    // based hardware). Applied once per render path — sendLED calls
    // this to get post-mix rgb for hw.send; _emitAt calls this to
    // predict wire response at that post-mix rgb.
    function applyMix(rgb, hw, mode) {
        if (mode !== 'correct') return;
        var P = hw.PERCEPTION;
        if (!P) return;
        if (P.wbGain) {
            var wb = P.wbGain;
            if (!wb || wb.length < 3) return;
            rgb[0] = Math.max(0, Math.min(127, Math.round(rgb[0] * wb[0])));
            rgb[1] = Math.max(0, Math.min(127, Math.round(rgb[1] * wb[1])));
            rgb[2] = Math.max(0, Math.min(127, Math.round(rgb[2] * wb[2])));
            return;
        }
        var entry = _deriveCache.get(hw);
        var luts = entry && entry.luts;
        if (luts) {
            rgb[0] = luts.r[rgb[0]];
            rgb[1] = luts.g[rgb[1]];
            rgb[2] = luts.b[rgb[2]];
        }
    }

    // ============================================================
    // EMIT MODEL
    // ============================================================
    function _saturation(rgb) {
        var mx = Math.max(rgb[0], rgb[1], rgb[2]);
        if (mx <= 0) return 0;
        var mn = Math.min(rgb[0], rgb[1], rgb[2]);
        return (mx - mn) / mx;
    }

    function _hasModelParams(P) {
        return P && (
            P.wbGain || P.weights ||
            typeof P.gamma === 'number' ||
            typeof P.hkBoost === 'number'
        );
    }

    // Scratch for post-mix computation. Read immediately, not held
    // across calls.
    var _POST_MIX_SCRATCH = [0, 0, 0];
    var _SAT_SCRATCH = [0, 0, 0];

    // Predict physical emission. Input is PRE-MIX rgb (the scheme's
    // raw stop colour). Internally applies mix to get post-mix wire
    // values, then predicts the wire response. mixMode is threaded
    // so prediction matches sendLED's actual output.
    function _emitAt(preMixRgb, hwByte, hw, mixMode) {
        var P = hw.PERCEPTION;
        var curves = _deriveCurves(hw);
        if (!curves) return hwByte / 127;

        if (mixMode === undefined) {
            mixMode = (P && P.mode && P.mode.mix) || 'off';
        }

        // Compute post-mix rgb — the actual wire values.
        _POST_MIX_SCRATCH[0] = preMixRgb[0];
        _POST_MIX_SCRATCH[1] = preMixRgb[1];
        _POST_MIX_SCRATCH[2] = preMixRgb[2];
        applyMix(_POST_MIX_SCRATCH, hw, mixMode);
        var postR = _POST_MIX_SCRATCH[0];
        var postG = _POST_MIX_SCRATCH[1];
        var postB = _POST_MIX_SCRATCH[2];

        if (_hasModelParams(P)) {
            // Model A — K3-style. No WB multiplication here;
            // applyMix already produced post-mix rgb.
            var w  = P.weights || [1, 1, 1];
            var g  = (typeof P.gamma === 'number') ? P.gamma : 1;
            var hk = (typeof P.hkBoost === 'number') ? P.hkBoost : 0;
            var cR = (postR / 127) * _sampleTransfer(curves.r, hwByte) * w[0];
            var cG = (postG / 127) * _sampleTransfer(curves.g, hwByte) * w[1];
            var cB = (postB / 127) * _sampleTransfer(curves.b, hwByte) * w[2];
            var Y = cR + cG + cB;
            if (Y <= 0) return 0;
            var P_out = (g === 1) ? Y : Math.pow(Y, g);
            _SAT_SCRATCH[0] = postR;
            _SAT_SCRATCH[1] = postG;
            _SAT_SCRATCH[2] = postB;
            return P_out * (1 + hk * _saturation(_SAT_SCRATCH));
        }

        // Model B — simple per-channel sum at effective input
        return _sampleTransfer(curves.r, postR * hwByte / 127) +
               _sampleTransfer(curves.g, postG * hwByte / 127) +
               _sampleTransfer(curves.b, postB * hwByte / 127);
    }

    // ============================================================
    // BRIGHTNESS SOLVE
    // ============================================================
    function _minSegmentEmit(segs, hw, mixMode) {
        var minEmit = Infinity;
        for (var i = 0; i < segs.length; i++) {
            var c = segs[i].color;
            if (!c || !c.rgb) continue;
            if (c.rgb[0] === 0 && c.rgb[1] === 0 && c.rgb[2] === 0) continue;
            var e = _emitAt(c.rgb, c.brightness, hw, mixMode);
            if (e < minEmit) minEmit = e;
        }
        return isFinite(minEmit) ? minEmit : null;
    }

    function _fingerprint(hw) {
        var P = hw.PERCEPTION;
        if (!P) return 'none';
        var parts = [];
        if (P.curves)   parts.push(typeof P.curves === 'string' ? P.curves : 'curvesObj');
        if (P.samples)  parts.push('samples:' + P.samples.length);
        if (P.custom)   parts.push('custom');
        if (P.wbGain)   parts.push('wb:' + P.wbGain.join(','));
        if (P.weights)  parts.push('w:' + P.weights.join(','));
        if (typeof P.gamma === 'number')   parts.push('g:' + P.gamma);
        if (typeof P.hkBoost === 'number') parts.push('hk:' + P.hkBoost);
        if (P.mode) {
            parts.push('mix:' + (P.mode.mix || 'off'));
            parts.push('br:' + (P.mode.brightness || 'off'));
        }
        return parts.join('|');
    }

    function _flatTarget(ramp, hw, mixMode) {
        if (!ramp || ramp.length === 0) return null;
        var cache = _flatCache.get(hw);
        if (!cache) { cache = new Map(); _flatCache.set(hw, cache); }
        if (ramp._perceptionId === undefined) {
            ramp._perceptionId = ++_rampIdCounter;
        }
        // Fingerprint must include mixMode — flat target depends on
        // the mix-corrected rgb of each stop.
        var fp = _fingerprint(hw) + '|' + (mixMode || 'off');
        var entry = cache.get(ramp._perceptionId);
        if (entry && entry.key === fp) return entry.value;
        var value = _minSegmentEmit(ramp, hw, mixMode);
        if (cache.size >= 1024) {
            for (var k of cache.keys()) { cache.delete(k); break; }
        }
        cache.set(ramp._perceptionId, { key: fp, value: value });
        return value;
    }

    function _bisectHw(rgb, targetLum, hw, mixMode) {
        if (mixMode === undefined) {
            var P = hw.PERCEPTION;
            mixMode = (P && P.mode && P.mode.mix) || 'off';
        }
        var lo = 0, hi = 127;
        for (var i = 0; i < 12; i++) {
            var mid = (lo + hi) / 2;
            if (_emitAt(rgb, mid, hw, mixMode) < targetLum) lo = mid;
            else hi = mid;
        }
        return Math.round((lo + hi) / 2);
    }

    // Public entry. rgb is PRE-MIX (scheme stop colour). Returns
    // the hw byte the framework should pass to hw.send. hw.send
    // will apply mix to get post-mix rgb, but brightness is a
    // scalar — solved against the pre-mix rgb + mixMode, so
    // bisect's prediction matches hw.send's actual wire rgb.
    function solveBrightness(hw, rgb, brightness, mixMode, brightnessMode, ramp) {
        if (brightnessMode === 'off') return brightness;
        if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) return brightness;

        var curves = _deriveCurves(hw);
        if (!curves) return brightness;

        var target;
        if (brightnessMode === 'flat') {
            target = _flatTarget(ramp, hw, mixMode);
            if (target === null) return brightness;
        } else if (brightnessMode === 'own') {
            target = (brightness / 127) * _emitAt(rgb, 127, hw, mixMode);
        } else {
            return brightness;
        }

        var cache = _hwCache.get(hw);
        if (!cache) { cache = new Map(); _hwCache.set(hw, cache); }
        var key = rgb[0] + ':' + rgb[1] + ':' + rgb[2] + ':' +
                  (mixMode || 'off') + ':' + target.toFixed(6);
        if (cache.has(key)) return cache.get(key);

        var value = _bisectHw(rgb, target, hw, mixMode);
        if (cache.size >= 1024) {
            for (var k of cache.keys()) { cache.delete(k); break; }
        }
        cache.set(key, value);
        return value;
    }

    // ============================================================
    // INVALIDATION (for tests + runtime PERCEPTION swap)
    // ============================================================
    function _invalidate(hw) {
        _deriveCache.delete(hw);
        _flatCache.delete(hw);
        _hwCache.delete(hw);
    }

    // ============================================================
    // EXPORTS
    // ============================================================
    myCatnip.perception = {
        deriveCurves:      _deriveCurves,
        deriveFromSamples: _deriveFromSamples,
        deriveLuts:        _deriveLuts,
        applyMix:          applyMix,
        solveBrightness:   solveBrightness,

        _emitAt:           _emitAt,
        _buildTransfer:    _buildTransfer,
        _sampleTransfer:   _sampleTransfer,
        _flatTarget:       _flatTarget,
        _minSegmentEmit:   _minSegmentEmit,
        _bisectHw:         _bisectHw,
        _fingerprint:      _fingerprint,
        _invalidate:       _invalidate
    };
})();

