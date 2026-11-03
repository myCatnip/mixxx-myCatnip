# Perception — modelling how the wire looks to the eye

The `PERCEPTION` data block and the framework's perception
pipeline. This is the reference half of a pair: `HARDWARE.md`
describes the descriptor-side contract (six methods, data blocks,
boundary); this file describes what happens between the scheme
compiling a colour and `hw.send` receiving wire values.

Read this when: authoring `PERCEPTION` for a new hardware,
debugging why an LED looks wrong on the wire, or writing a
scheme that overrides the hardware's modes.

---

## §0 — Version compatibility

Describes the **v2.1.x** perception model.

- v2.0.0's `calibration` / `calibrationMode` / `wbGain` /
  `channelPerceptual` / `hkBoost` / `lumGamma` DEFAULTS fields
  are gone. They moved to `PERCEPTION`. Migration table:
  `HARDWARE.md` §Migration.
- `hw.writeLED(ctrl, idx, r, g, b, hw)` → `hw.send(ctrl, idx,
  rgb, hw)`. `send` receives post-perception values; it must
  not re-apply perception.
- No backward compatibility across minor versions. The HAL is a
  contract, not an API.

---

## §1 — What perception is

Two independent corrections the framework applies on the way to
the wire:

- **`mix`** — colour-mix correction. Makes the wire rgb produce
  the intended hue. Applied once, to the pre-mix rgb, before
  `hw.send`.
- **`brightness`** — wire-byte solve. Picks the `hw` value that
  produces a target perceived brightness at the current rgb.

Both are derived from one data source: the hardware's curves (or
samples that become curves). Neither runs unless declared.

```
   scheme compiles  ──►  (pre-mix rgb, hw)
                              │
                              ▼
                    ┌────────────────────┐
                    │  mix correction    │  applyMix (if mode.mix
                    │                    │  === 'correct')
                    └─────────┬──────────┘
                              │ (post-mix rgb, hw)
                              ▼
                    ┌────────────────────┐
                    │ brightness solve   │  solveBrightness (if
                    │                    │  mode.brightness !== 'off')
                    └─────────┬──────────┘
                              │ (post-mix rgb, solved hw)
                              ▼
                        hw.send(ctrl, idx, rgb, hw)
```

**Absent `PERCEPTION` block = raw output.** `hw.send` receives
exactly what the scheme compiled. A hardware with no interest in
perception omits the block.

Two emission models sit under the modes:

- **Model B (curves only)** — per-channel sum, simple.
- **Model A (any model parameter present)** — mix, then weighted
  sum, gamma, saturation boost. K3 uses Model A.

The dispatch between them is internal; a hardware author declares
data and does not choose a model. §5 has the formulas.

---

## §2 — Data formats

The hardware supplies its model in one of three forms. All three
ultimately become per-channel `[hw, luminance]` curves, except
`custom` which bypasses the pipeline.

### 2.1 Form A — `curves`

Per-channel `[hw, perceived]` pairs. `hw` is 0–127.
`perceived` is normalised to `[0, 1]` against each channel's own
peak at compile time; author in raw measurement units, not
normalised.

```js
PERCEPTION: {
    curves: {
        r: [[0, 0], [2, 45], [5, 138], [11, 350], ..., [127, 8200]],
        g: [[0, 0], [2, 68], [5, 195], [11, 520], ..., [127, 12700]],
        b: [[0, 0], [2, 377], [5, 1140], [11, 3430], ..., [127, 49500]]
    },
    mode: { mix: 'correct', brightness: 'flat' }
}
```

Or naming a block in `LED_TRANSFERS`:

```js
PERCEPTION: {
    curves: 'measuredRGB',      // → LED_TRANSFERS.measuredRGB
    mode: { mix: 'correct', brightness: 'flat' }
}
```

Named blocks are the normal form — `LED_TRANSFERS` exists so the
raw data can sit in one place per hardware while multiple named
blocks or multiple presets reference it. Inline `curves` is
equivalent but rarer.

**Non-monotonic entries** (a lower `perceived` at a higher `hw`)
are flattened to the previous value, with a warn-once
(`perceptionNonMono:<channel>:<hw>`). LED response should be
monotonic; if yours isn't, that's a measurement artifact and
flattening is the safe recovery.

**Missing block** — `curves: 'name'` pointing at an absent
`LED_TRANSFERS.name` warns once
(`perceptionCurveMissing:<name>`) and treats the whole
`PERCEPTION` block as absent (raw output).

### 2.2 Form B — `samples`

An array of `{ step, rgb }` samples. `step` is the **total**
perceived brightness across all three channels at that sample
(0–1, 1 = brightest). `rgb` is the wire triplet that produces
that total with equal per-channel contribution at that step.

Internally each channel is assigned `step / 3` as its own
contribution, then normalised against that channel's own peak.
This recovers per-channel curves from equal-luminance samples,
which is what an eye-based measurement tends to produce.

```js
PERCEPTION: {
    samples: [
        { step: 1.00, rgb: [127, 127, 127] },
        { step: 0.75, rgb: [ 90,  90,  90] },
        { step: 0.50, rgb: [ 60,  60,  60] },
        { step: 0.25, rgb: [ 30,  30,  30] },
        { step: 0.00, rgb: [  0,   0,   0] }
    ],
    mode: { mix: 'correct', brightness: 'own' }
}
```

**Minimum 2 samples.** One sample is "all equal brightness" —
no curve information, warn-once
(`perceptionSamplesFew`), treated as absent. Two samples
(brightest + darkest) give a linear interpolation; more samples
interpolate piecewise between adjacent `hw` values.

**Duplicate wire values** within one channel warn once
(`perceptionSampleDup:<channel>:<hw>`) and keep the first. A
channel whose samples are all-zero returns null
(`perceptionSamplePeak:<channel>`) — treated as absent.

Samples assume the three channels are wire-equal after mix. If
they aren't, use `curves` instead (§10, L1).

### 2.3 Form C — `custom`

A function for a hardware whose model is too complex for
curves/samples. `PERCEPTION.custom(rgb, brightness, ramp, ctrl)`
returns `{ rgb, hw }`. The framework calls it instead of the
standard pipeline.

`curves` / `samples` / `mode` are ignored when `custom` is
present. This is the escape hatch; most hardware never needs it.

### 2.4 Derivation order

```
   PERCEPTION block present?
        │ no  → raw output (no curves, no modes)
        │ yes
        ▼
   custom present?
        │ yes → bypass everything (§2.3)
        │ no
        ▼
   curves set?
        │ 'name' → LED_TRANSFERS['name']
        │ object → use directly
        │ no
        ▼
   samples set?
        │ yes → derive per-channel curves
        │ no  → raw output
        ▼
   normalise per channel
   derive LUTs (for mix)
```

Derived once per HW per boot, cached in a WeakMap. Runtime
mutation of `PERCEPTION` requires `perception._invalidate(hw)`.

---

## §3 — Model parameters

Four optional parameters refine how curves are combined into a
predicted emission value. All optional; absent = Model B (curves
only).

| Field | Default | Meaning |
|---|---|---|
| `wbGain` | none | Per-channel gain applied by `applyMix` (mix step) |
| `weights` | `[1,1,1]` | Per-channel luminance weighting (emit model) |
| `gamma` | `1` | Post-sum luminance gamma (emit model) |
| `hkBoost` | `0` | Post-sum saturation boost (emit model) |

**Presence of any one switches to Model A.** A hardware whose
wire response is a simple per-channel curve omits all four. A
hardware that measured them supplies them. K3 supplies all four.

**`wbGain` versus inverse LUT.** `applyMix` uses `wbGain` if
present and **does not fall back to the LUT**. If `wbGain` is
absent, `applyMix` uses the inverse LUT derived from the curves.
A hardware can provide both (K3 does — WB was measured
independently and is cheaper than a LUT); `wbGain` wins for the
mix step, LUTs stay available for anyone who needs the
per-channel response.

**Defaults are not identity multipliers.** The table's "default"
column is the value used by the emit formula when the field is
absent. `wbGain` absent is *not* `[1,1,1]` — it means "no WB,
use LUT". See §9.3.

---

## §4 — Modes

`mode` declares which of the two corrections to apply.

```js
mode: { mix: 'correct', brightness: 'flat' }
```

**Both keys are optional.** A `mode` with only `mix` leaves
`brightness` at `'off'` and vice versa. Both keys are `'off'`
when absent.

**Absent `mode` = both `'off'` = raw output.** There is no
injected default. If you want correction, declare it.

> Earlier drafts of this file claimed `{ mix: 'correct',
> brightness: 'own' }` was the fallback when `mode` was omitted.
> It is not. Both `ctrl._solveHw` and `ctrl.sendLED` resolve
> `'off'` when the mode key is missing (`lib/controller-render.js`),
> and `applyMix` / `solveBrightness` behave identically with an
> `'off'` mode.

### 4.1 `mix`

| Value | Effect |
|---|---|
| `'off'` | No mix correction. `send` receives the raw scheme rgb. |
| `'correct'` | Apply mix correction. `wbGain` multiply if present; else inverse LUT from curves. |

If neither `wbGain` nor curves are derivable, `'correct'`
behaves as `'off'` — there is nothing to correct against.

### 4.2 `brightness`

| Value | Effect |
|---|---|
| `'off'` | No brightness solve. `send` receives the scheme's `hw` byte unchanged. |
| `'own'` | Solve `hw` for this stop's target: `(brightness / 127) × emit(rgb, 127)`. |
| `'flat'` | Solve `hw` for the ramp's flat target: the minimum perceived luminance across all non-black stops in the ramp. |

`'flat'` on a single-colour scheme behaves as `'own'`. `'flat'`
on a ramp with all-black stops produces a null target; `hw`
passes through.

**Brightness solve runs only on sampled render paths.**
Deviation LEDs (`colorScheme.knob` present) and co-match sample
a ramp, call `_solveHw`, and pass the solved byte to `_send`.
**Static** render paths — fixed-colour LEDs, marker bands — skip
the solve and pass the scheme's `hw` byte straight through. This
is the same behaviour as v2.0.0: a static LED's brightness is
whatever the scheme said, not bisected against a target. Mix
correction (`applyMix`) is not affected — it runs on both paths.

### 4.3 The four combinations

| mix | brightness | Result |
|---|---|---|
| `'off'` | `'off'` | Raw pass-through (same as no `PERCEPTION`) |
| `'correct'` | `'off'` | Colour mix corrected, brightness passes through |
| `'correct'` | `'own'` | Both applied, per-stop brightness respected |
| `'correct'` | `'flat'` | Both applied, brightness flattened (K3) |

### 4.4 Recommended defaults

- **New hardware with curves**: `{ mix: 'correct', brightness: 'own' }`.
- **Hardware with no curves**: omit `PERCEPTION` entirely.
- **Stylistic flat-brightness hardware**: `{ mix: 'correct', brightness: 'flat' }` (K3).

---

## §5 — Model A versus Model B

Dispatch is on `_hasModelParams(P)` — true if any of `wbGain`,
`weights`, `gamma`, `hkBoost` is present.

Both models take **pre-mix** rgb. Mix is applied **once** inside
`_emitAt` (via `applyMix`) so the post-mix values used in the
formula are identical to the values `sendLED` sends to the wire.
Mixing is never re-applied.

### 5.1 Model B (curves only)

```
postR = mix(rgb[0])
postG = mix(rgb[1])
postB = mix(rgb[2])

emit = curve_r(postR × hw / 127)
     + curve_g(postG × hw / 127)
     + curve_b(postB × hw / 127)
```

A hardware with only `samples` gets Model B. In practice, mix is
usually `'off'` for a Model B hardware (no `wbGain`), so
`postRgb === rgb` and the formula reduces to sampling the curve
directly at `rgb[ch] × hw / 127`.

### 5.2 Model A (any model parameter present)

```
postR = mix(rgb[0])
postG = mix(rgb[1])
postB = mix(rgb[2])

Y = (postR / 127) × curve_r(hw) × weights[0]
  + (postG / 127) × curve_g(hw) × weights[1]
  + (postB / 127) × curve_b(hw) × weights[2]

emit = Y^gamma × (1 + hkBoost × saturation(postRgb))
```

Note the difference from Model B: **the curve is sampled at `hw`
directly**, and the rgb channel provides linear weighting.
Model B samples the curve at `rgb × hw / 127` and sums without
weighting. Model A is the correct model when the wire's
per-channel response is described by `curve_ch(hw)` rather than
by a full rgb→hw coupling.

### 5.3 Which model a hardware gets

- No `wbGain`, no `weights`, no `gamma`, no `hkBoost` → Model B.
- Any one of the above present → Model A.
- Only `samples` provided, no model params → Model B.
- `custom` present → neither (function bypass).

K3 supplies all four parameters, so K3 uses Model A.

---

## §6 — Runtime mix toggle

`ctrl._perceptionMixActive` (boolean) is the runtime kill-switch
for the mix step. Default is `(ctrl.sysex !== false)` — set at
boot from the transport.

- `sysex: true` → `true` — mix runs normally.
- `sysex: false` (K2 mode) → `false` — mix is skipped for the
  whole transport.

`labToggleMix` (colorLab) flips this at runtime. When toggling,
clear `ctrl._ledCache` so cached wire values don't dedupe
incorrectly against the new mix behaviour.

### 6.1 What K2 changes and what it doesn't

The K3's K2 fallback (`sysex: false`) is a **coarse
discrete-colour transport**, not a perception-model wire.
`hw/k3.js`'s `sendK2Note` picks one of three note buckets
(red / amber / green) from the r-g difference and sends that
note with velocity `hw × peak / 127`. The **note** carries the
colour; the **velocity** is a coarse dim factor within that
bucket, not a perception-model brightness. The physical K2 uses
the velocity as "how bright this colour pad glows" on a much
coarser axis than 0–127.

`_perceptionMixActive === false` (K2) suppresses **mix only**.
Brightness solve still runs — `ctrl._solveHw` resolves
`brightnessMode` from `P.mode.brightness` regardless of
transport, and `ctrl.sendLED` sends the solved byte to
`hw.send`. But on the K2 wire, that byte is collapsed to a dim
scalar alongside a discrete colour choice, and the perception
model's fine-grained solve is discarded. **Do not describe K2
output as "the brightness solve being honoured"** — it's
mechanically true that the byte arrives, but the wire ignores
what the model computed.

**Why mix is disabled on K2.** v2.0.0's K2 path applied WB to
the brightness *prediction* but sent raw rgb to the *wire* —
the prediction assumed post-WB rgb, the wire saw pre-WB rgb.
v2.1.x fixes the inconsistency by disabling mix for the whole
transport: prediction and wire both see pre-mix rgb. That is
the entire K2 change in v2.1.x. Brightness solve behaviour is
unchanged.

**For hardware that uses velocity as genuine brightness.** A
hardware whose wire treats velocity as a real 0–127 luminance
scalar — and wants the perception solve's output faithfully
delivered — should implement `hw.send` directly. Do not copy
the K3's K2 code path; that path is a fallback for one
specific hardware's discrete-palette transport.

⚠ **Code-comment bug.** `hw/k3.js`'s file header still says
*"In K2 mode, brightness solve is skipped"*. It isn't — only
mix is. Flagged for the code pass.

---

## §7 — K3's expression

The K3's model uses all four parameters. It lives entirely in
`hw/k3.js` as data:

```js
PERCEPTION: {
    curves: 'measuredRGB',
    wbGain:  [0.6, 1.0, 0.93],
    weights: [1.35, 0.69, 0.19],
    gamma:   0.32,
    hkBoost: 0.29,
    mode: { mix: 'correct', brightness: 'flat' }
}
```

`curves: 'measuredRGB'` names `LED_TRANSFERS.measuredRGB`. K3
supplies `wbGain` even though `curves` are also present — WB was
measured independently and is cheaper to apply than a LUT, so
the mix step uses WB. The LUTs are still derived (curves are
present) and used by anyone who needs them, but not by the mix
step on this hardware.

Result: byte-identical output to v2.0.0 for both transports.

---

## §8 — Per-scheme override

A scheme can override the hardware's modes for its own LEDs:

```js
myCatnip.SCHEMES.myScheme = {
    colors: [...],
    perception: { brightness: 'own' }    // mix from HW default, brightness overridden
};
```

Resolution is per-key. `perception: { mix: 'off' }` skips mix
only, keeping the hardware's brightness mode. `perception: {
brightness: 'flat' }` forces flat brightness, keeping the
hardware's mix mode.

`perception: false` bypasses the whole pipeline for that scheme
— both modes become `'off'` regardless of hardware defaults.

### 8.1 Legacy `calibration` alias

`scheme.calibration: false` is translated at compile time to
`scheme.perception: { brightness: 'off' }`. Filter schemes that
opted out of the v2.0.0 brightness solve continue to skip it.
The `calibration` field is deprecated; new schemes use
`perception:` directly.

---

## §9 — Public API

`myCatnip.perception.*`. Pure functions plus per-HW caches.
Usable standalone (e.g. from a Lab bake).

```js
myCatnip.perception = {
    // Derivations (called once per HW per boot, cached)
    deriveCurves(hw),                 // hw → { r, g, b } curves | null
    deriveFromSamples(samples),       // [ {step, rgb} ] → { r, g, b } curves | null
    deriveLuts(curves),               // curves → { r: Uint8Array(128), g: ..., b: ... }

    // Runtime
    applyMix(rgb, hw, mode),          // mutate rgb in place
    solveBrightness(hw, rgb, brightness, mixMode, brightnessMode, ramp),
                                      // → hw byte

    // Diagnostics / test helpers
    _emitAt(preMixRgb, hwByte, hw, mixMode),  // → perceived emission value
    _buildTransfer(rawObj),           // raw curves → normalised curves
    _sampleTransfer(table, hw),       // binary-search curve lookup
    _flatTarget(ramp, hw, mixMode),   // → flat target luminance | null
    _minSegmentEmit(segs, hw, mixMode),       // → min non-black emit
    _bisectHw(rgb, targetLum, hw, mixMode),   // → hw byte
    _fingerprint(hw),                 // → string (identity of current model)
    _invalidate(hw)                   // clear all per-HW caches
};
```

### 9.1 Caches

Three `WeakMap`s keyed on the HW descriptor object:

- `deriveCache` — `{ curves, luts }`, computed once per HW per boot.
- `flatCache` — `Map<rampId, { key, value }>`, bounded at 1024.
  Key includes `_fingerprint(hw)` and `mixMode` so a mix toggle
  invalidates entries.
- `hwCache` — `Map<key, hw>`, bounded at 1024, keyed on
  `rgb:rgb:rgb:mixMode:target`.

`_invalidate(hw)` clears all three. Required if a hardware swaps
its `PERCEPTION` at runtime (unusual — tests only).

### 9.2 `solveBrightness` resolution order

`ctrl._solveHw` resolves both modes **before** calling this
function. `solveBrightness` receives them already resolved:

```
brightnessMode =
    scheme.perception === false        → 'off'
  : scheme.perception.brightness       → as declared
  : hw.PERCEPTION.mode.brightness      → as declared
  :                                      'off'

mixMode =
    scheme.perception === false        → 'off'
  : scheme.perception.mix              → as declared
  : ctrl._perceptionMixActive === false → 'off'
  : hw.PERCEPTION.mode.mix             → as declared
  :                                      'off'
```

Note `_perceptionMixActive` affects **mix only**; brightness
resolve ignores it (§6.1).

Inside `solveBrightness`:

- `brightnessMode === 'off'` → return `brightness` unchanged.
- `rgb === [0,0,0]` → return `brightness` (no solve for black).
- No derivable curves → return `brightness`.
- `brightnessMode === 'own'` → target = `(brightness / 127) ×
  _emitAt(rgb, 127, hw, mixMode)`, then bisect.
- `brightnessMode === 'flat'` → target = `_flatTarget(ramp, hw,
  mixMode)`, then bisect. Null target → return `brightness`.
- Any other `brightnessMode` value → return `brightness`.

Bisect is 12 iterations of `_emitAt` over `[0, 127]`.

### 9.3 `applyMix` resolution order

`ctrl.sendLED` resolves `mixMode` **before** calling `applyMix`
(same resolution as §9.2). Inside `applyMix`:

- `mode !== 'correct'` → no-op.
- `hw.PERCEPTION.wbGain` present → `rgb[c] = clamp(rgb[c] ×
  wbGain[c])`.
- `wbGain` absent, LUTs derived → `rgb[c] = luts[c][rgb[c]]`.
- Neither → no-op.

---

## §10 — Limitations

Perception-specific. Descriptor-side limitations (per-binding
override, multi-HW pacing, `mixxx` static-only) are in
`HARDWARE.md` §5.

| # | Limitation |
|---|---|
| L1 | `PERCEPTION.samples` assumes all three channels are wire-equal after mix. If they aren't, use `curves` instead. |
| L4 | `PERCEPTION` is derived once per HW per boot. Swapping a hardware's `PERCEPTION` at runtime requires `perception._invalidate(hw)`. |
| L6 | `PERCEPTION.custom` disables the framework's own caching coherence for the mix step. A custom function is expected to be cheap or cache its own results. |

Two more perception-adjacent facts, cross-referenced rather than
restated:

- **`mixxx`-typed stops can't be sampled** in a perception solve
  — they resolve at render time from the pad's hotcue colour.
  See `HARDWARE.md` §5 (L5) and `CONCEPTS.md` §10.
- **Per-binding override is not supported** — `colorScheme.perception`
  has no effect. Per-scheme is the granularity. See
  `HARDWARE.md` §5 (L2).

---

## §11 — What the hardware author does

Three steps, no math:

1. **Declare `PERCEPTION`** on the descriptor, with
   `curves` / `samples` / `custom`, model params if measured,
   and `mode`.
2. **Implement `hw.send(ctrl, idx, rgb, hw)`** — transport only.
   `rgb` is post-mix, `hw` is post-solve. Do not re-apply
   perception.
3. **Omit `PERCEPTION`** if the hardware's wire is linear and
   colour-balanced. Raw output is the correct answer for many
   panels.

The framework derives, caches, and applies. §2.4 of
`HARDWARE.md` has the descriptor-side contract; §3.4 there has a
worked example with an N-sample `PERCEPTION` block.