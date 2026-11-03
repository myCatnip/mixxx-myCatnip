# Hardware — writing a descriptor

Everything the framework doesn't own. What a hardware is, what it provides, what the framework guarantees, and how the two meet.

Two parts:

- **Part 1 — Overview.** One page. Diagrams, mental model, no code.
- **Part 2 — Reference.** Every method, every data block, worked example, porting checklist, limitations.

Parts are cross-linked by §.

## §0 — Version compatibility

This document describes the **v2.1.0** HAL.

- v2.0.0 descriptors (using `writeLED` and the old `calibration` DEFAULTS fields) will not run against a v2.1.0 framework. See §Migration.
- No backward-compatibility guarantees across minor versions. The HAL is a contract, not an API. Renames ship as documented migrations.
- Future versions document their own HAL version at the top of this file.

---

# Part 1 — Overview

## 1.1 The boundary

The framework is a schematic compiler, input router, and colour renderer. It produces canonical LED values and consumes canonical input events. Everything between "canonical" and "the wire" is the hardware.

```
      ┌─────────────────────────────────────────────┐
      │           CONFIGURATION (preset)            │
      │  schemes · bindings · patches · boot opts   │
      └──────────────────────┬──────────────────────┘
                             │
                             ▼
      ┌─────────────────────────────────────────────┐
      │                FRAMEWORK                    │
      │                                             │
      │  compiles schemes    → (rgb, brightness)    │
      │  applies patches     → binding configs      │
      │  renders colour      → LED frames           │
      │  routes input        → CO writes, patches   │
      └──────────────────────┬──────────────────────┘
                             │
                    ctrl.sendLED(idx, r, g, b, hw)
                             │
                             ▼
      ┌─────────────────────────────────────────────┐
      │                  HARDWARE                   │
      │                                             │
      │  owns idx space       (what's a "grid0_0")  │
      │  owns wire format     (sysex / midi / ...)  │
      │  owns perception      (mix + brightness)    │
      │  owns palette         (what "red" is)       │
      │  owns input wiring    (which MIDI handler)  │
      └──────────────────────┬──────────────────────┘
                             │
                             ▼
                   M I X X X   /   M I D I   W I R E
```

The framework **never** knows:

- what a note number is
- what a sysex frame is
- whether RGB is delivered as 3 channels, 2, or 1
- whether the hardware is colour or monochrome
- what "red" actually looks like on this panel
- how this hardware's wire bytes map to perceived brightness

The hardware **never** knows:

- what a patch is
- what a scheme is
- what focus means
- how a binding gets resolved

The line is `ctrl.sendLED`. Above it: config semantics. Below it: physical reality.

## 1.2 What the framework provides

- **Scheme compilation** — colour ramps, tmaps, marker bands, beat cascades, off-ramps, co-steering.
- **Binding resolution** — `$DECK_ACTIVE$` / `$FX_ACTIVE$` tokens, hash-diffed rebinds, transaction capture for push buttons.
- **Input dispatch** — bounce guards, orphaned-release handling, func dispatch, default input, CO writes.
- **Colour rendering** — sample the ramp, resolve the named stop, apply on/off, apply perception, hand `(idx, rgb, hw)` to the hardware.
- **Perception** — derive curves and LUTs from hardware-supplied data; apply mix and brightness solve per the hardware's declared modes.
- **State scopes** — session, per-channel, per-controller (see §1.5).
- **Lazy activation** — beat clocks, pacer queues, CO connections only exist while something needs them.

## 1.3 What a hardware provides

A **descriptor**: one plain JS object. Six methods, six optional data blocks.

| | Method | What it does |
|---|---|---|
| **1** | `buildBindings(ctrl)` | Enumerate physical controls → `{name: Binding}` |
| **2** | `wireInputs(ctrl)` | Register Mixxx MIDI handlers |
| **3** | `send(ctrl, idx, rgb, hw)` | Send one LED frame (post-perception) |
| **4** | `blank(ctrl)` | Clear every LED |
| **5** | `anyPendingWrites(ctrl)` | Shutdown drain poll |
| **6** | `decodeLedCache(val)` | Diagnostic reverse of the cache key |

| | Data | What it says |
|---|---|---|
| **D** | `DEFAULTS` | Boot defaults: `midiChannel`, `sysex`, K3-specific model inputs |
| **P** | `pacing` | Timing overrides (may be `{}`) |
| **T** | `LED_TRANSFERS` | Raw [hw, luminance] curves (named blocks) |
| **Pc** | `PERCEPTION` | Perception model: curves \| samples, wbGain?, mode, custom? |
| **Pa** | `PALETTE` | Named colour RGB values |
| **M** | `MIXXX_COLORS` | Mixxx hex → RGB |
| **B** | `DEFAULT_RGB_BRIGHTNESS` / `_OFF` | On/off brightness levels |

Everything except the six methods is optional. Omit `PERCEPTION` → raw output (no correction). Omit `PALETTE` → framework warns once per unresolved name, LED goes dark. Omit `MIXXX_COLORS` → `mixxx`-typed stops fall back to halving. Omit `DEFAULT_RGB_BRIGHTNESS` → framework defaults (110/12).

## 1.4 The three seams

Where framework and hardware actually interact:

```
  SEAM 1 — LEDs                SEAM 2 — Input              SEAM 3 — State

  framework renders            hardware sees               hardware can
  (idx, r, g, b, hw)           MIDI events, forwards       read session,
        │                      (ch, cc, v, s) to           per-channel,
        ▼                      Binding.input()             per-controller
  framework applies perception                         │
  then hw.send(idx, rgb, hw)                           │
        │                                              │
        ▼                                              │
  hardware → wire                                      │
                                                       ▼
                                            myCatnip.shared.controllers
                                            (owner-write, everyone-read)
```

Seam 1 is `hw.send` (called by `ctrl.sendLED` after perception). Seam 2 is `wireInputs`. Seam 3 is `myCatnip.shared` (§4).

Seams 1 and 2 are fully hardware-owned. Seam 3 is framework-owned with hardware read access.

## 1.5 Where state lives

Three scopes. Every value sits in exactly one.

```
┌────────────────────────────────────────────────────────────────┐
│ SESSION  (myCatnip.shared.*)                                    │
│                                                                 │
│  TIMING · SCHEMES · warned · DEFAULT_RGB_BRIGHTNESS             │
│  timeSig[1..4]           ← per-channel                          │
│  lastLoopTouchMs[1..4]   ← per-channel                          │
│  controllers             ← one block per running controller     │
│  rw                      ← reserved (empty)                     │
└────────────────────────────────────────────────────────────────┘
                          ▲
                          │ read by every controller
                          │ written only by owner
                          ▼
┌───────────────────────────┐    ┌───────────────────────────┐
│ CONTROLLER Cat            │    │ CONTROLLER Kitten         │
│                           │    │                           │
│  bindings · _applied      │    │  bindings · _applied      │
│  activeDeck · activeFx    │    │  activeDeck · activeFx    │
│  activePatches            │    │  activePatches            │
│  modifiers · _ledCache    │    │  modifiers · _ledCache    │
│  _pacers                  │    │  _pacers                  │
└───────────────────────────┘    └───────────────────────────┘
        │                                  │
        │ writes its block                 │ writes its block
        ▼                                  ▼
  shared.controllers.Cat            shared.controllers.Kitten
  { label, hw, midiChannel,         { label, hw, midiChannel,
    activeDeck, activeFx,             activeDeck, activeFx,
    selectedDeckA/B,                  selectedDeckA/B,
    selectedFxA/B,                    selectedFxA/B,
    selectedDeckCurrent,              selectedDeckCurrent,
    selectedFxCurrent,                selectedFxCurrent,
    activePatches,                    activePatches,
    topMode, modifiers }              topMode, modifiers }
```

Two controllers on the same channel share `shared.lastLoopTouchMs[ch]` and `shared.timeSig[ch]` — both are properties of the music, not the controller.

Two controllers never share `bindings`, `_ledCache`, `_pacers` — those are per physical surface.

Two controllers **can** read each other's `shared.controllers[label]` block — that's what enables cross-controller state (e.g. Cat's `activeDeck` driving Kitten's status LED).

---

# Part 2 — Reference

## 2.0 Conformance

A descriptor is conformant iff all of these hold:

1. **Six methods present and callable.** `buildBindings`, `wireInputs`, `send`, `blank`, `anyPendingWrites`, `decodeLedCache`. All callable without throwing on first invocation.
2. **`buildBindings` returns an object.** `{ name: Binding }` with at least one binding, or an empty object for a hardware with no controls.
3. **Every binding has `idx` set.** `-1` for "no LED", `0..N` for "this LED index". `send` is guaranteed not to receive an `idx` your `buildBindings` didn't declare.
4. **`send` handles every `(idx, rgb, hw)`.** Every `idx` in the range your bindings declare. Every `rgb` in `[0, 127]³`. Every `hw` in `[0, 127]`. Post-perception values.
5. **`blank` sweeps every `idx`.** Including any that a previous session might have left lit — `blank` is the reset path, and it must reset.
6. **`anyPendingWrites` returns `false` when drained.** Synchronous hardware returns `false` immediately. Queued hardware returns `false` only after every queued frame has been sent.
7. **`PERCEPTION` (if present) is well-formed.** Either `curves` or `samples` (not both, not neither, unless `custom` is set). `mode` if present must have valid keys.
8. **No method throws.** The framework catches (warn-once), but a throwing method degrades gracefully only by being skipped. Correct hardware returns without throwing.

A hardware failing (8) still boots; the framework drops its frames for the affected call. A hardware failing (1) or (2) does not boot.

---

## 2.1 Descriptor shape

```js
myCatnip.HW_EXAMPLE = {
    name: 'Xone K3',                    // used in logs

    DEFAULTS:   { ... },                // boot defaults
    pacing:     { ... },                // timing overrides (may be {})
    LED_TRANSFERS: { ... },             // optional named curve blocks
    PERCEPTION: { ... },                // optional perception model
    PALETTE:    { ... },                // optional named colours
    MIXXX_COLORS: { ... },              // optional Mixxx hex → RGB
    DEFAULT_RGB_BRIGHTNESS: 110,        // optional (default 110)
    DEFAULT_RGB_BRIGHTNESS_OFF: 12,     // optional (default 12)

    buildBindings:   function(ctrl) { ... },
    wireInputs:      function(ctrl) { ... },
    send:            function(ctrl, idx, rgb, hw) { ... },
    blank:           function(ctrl) { ... },
    anyPendingWrites:function(ctrl) { ... },
    decodeLedCache:  function(val) { ... }
};
```

Loaded after `myCatnip-lib-binding.js` (constructs `Binding` instances), after `myCatnip-lib-perception.js` (uses `myCatnip.perception.*`), before `myCatnip-lib-controller.js` (default descriptor reference). See §3.2.

---

## 2.2 LEDs — the output side

### The contract

Framework calls `ctrl.sendLED(idx, r, g, b, hw)`, which:

1. Applies perception (mix + brightness solve) per the scheme's `perception` override or the hardware's `PERCEPTION.mode`.
2. Calls `ctrl.hw.send(ctrl, idx, [r', g', b'], hw')` with **post-perception** values.

It also calls `blank(ctrl)` on shutdown / init and `anyPendingWrites(ctrl)` when waiting for output to drain.

**The framework guarantees:**

- `idx` is an opaque integer. `-1` means "no LED mapped". No other convention.
- `rgb` is `[r, g, b]`, each 0–127. Named colours have been resolved. `mixxx`-typed stops have been resolved. Off-ramps have been selected. Beat cascades have been applied. **Perception mix has been applied** (if the hardware's mode says `mix: 'correct'`).
- `hw` is 0–127. **Perception brightness solve has been applied** (if the hardware's mode says `brightness: 'own' | 'flat'`).
- Calls arrive at scheme framerate, not audio rate. The framework dedupes on `(idx, packed rgb + hw)` before calling you.
- The framework may be configured with per-scheme `perception: false` — in that case the framework skips perception for that scheme, and `send` receives the raw `(rgb, hw)` the scheme produced.

**The hardware decides:**

- What `idx` means physically (which note, which pixel, which sysex index).
- Whether to compress RGB further (to a palette, to a single channel, to a velocity). If you do, it's your own compression, after the framework's mix correction — the framework has no view.
- What wire format to emit (sysex, MIDI, DMX, whatever).

**The hardware must:**

- Return quickly. LED writes are synchronous in `send`. Queue + timer inside `send` if the wire is slower than the framework's call rate (`ctrl.pacer('led', {sendFn, throttleMs})` is available for that).
- Not retain `rgb`, `hw`, or `idx` past return. They may be reused scratch values.
- Honour `blank()` — sweep every LED it can. Returning without sending is legal for a hardware with no LEDs, but not for one that has them.
- Return `false` from `anyPendingWrites` when no output remains queued. A synchronous hardware returns `false` immediately.
- **Not re-apply perception.** By the time `send` is called, mix correction and brightness solve are done. Your `PERCEPTION.mode` told the framework what to do; `send` just transports.

### The idx space

`idx` is whatever the hardware's `buildBindings` assigns. Two conventions worth naming:

- **`-1`** — binding exists but has no LED (encoder, fader, input-only button). Framework skips sends.
- **Contiguous indices** — HW_FAKE uses 0..21. K3 uses 0x00..0x21. There's no requirement to be contiguous, but leaving gaps wastes `_ledCache` slots if the hardware ever inspects them.

`decodeLedCache(val)` is the diagnostic reverse — used by `inspect('why', name)` to print "last written to idx N was r:g:b:hw" (post-perception wire values). Hardware-specific packing → human-readable string. Pre-perception values are shown separately by `inspect('why')` alongside post-perception — the cache only holds the wire bytes.

### Output-only LEDs

A binding with no `midi` field is an LED with no button. The framework skips it in `wireInputs`. It can carry a `colorScheme.schemeFromState` that reads `myCatnip.shared.controllers[label]` or any CO — useful for status LEDs driven by cross-controller state.

```js
bindings.ledActivity = new myCatnip.Binding('ledActivity', {
    idx: 21                            // no midi field
}, ctrl);
```

---

## 2.3 Input — `buildBindings` and `wireInputs`

### buildBindings

Returns `{name: Binding}`. Names are the vocabulary that config files use — `encoder0`, `grid2_1`, `layer`, `pressR`. Whatever you call them is what config files reference.

```js
bindings.grid2_1 = new myCatnip.Binding('grid2_1', {
    midi: [0x90 + ch, 0x22],           // note-on, note 0x22
    type: 'button',                    // 'button' | 'knob' | 'fader' | 'encoder'
    idx: 18                            // 0..N; -1 for no LED
}, ctrl);
```

Binding fields the framework reads:

- `midi` — `[status, data1]`. Absent = output-only. The framework passes it to `wireInputs`.
- `type` — `'button'` / `'knob'` / `'fader'` / `'encoder'`. `button` gets bounce guard + transaction capture + `_isPress(v, s)` semantics. Others get `_normalized` tracking and valueCurve.
- `idx` — LED index. See §2.2.

Everything else on the Binding is config-driven (group, inKey, buttonMode, colorScheme, func). Hardware doesn't touch it.

### wireInputs

Registers Mixxx input handlers. For each binding with a `midi` field, call `midi.makeInputHandler(status, data1, cb)`. For button bindings (`type: 'button'`), also wire the note-off half:

```js
wireInputs: function(ctrl) {
    var noteOff = 0x80 + ctrl.midiChannel;
    for (var name in ctrl.bindings) {
        var b = ctrl.bindings[name];
        if (!b.midi) continue;         // output-only
        (function(b) {
            function cb(_ch, _cc, v, s) {
                if (b.input) b.input(_ch, _cc, v, s);
            }
            midi.makeInputHandler(b.midi[0], b.midi[1], cb);
            if ((b.midi[0] & 0xF0) === 0x90) {
                midi.makeInputHandler(noteOff, b.midi[1], cb);
            }
        })(b);
    }
}
```

The framework parses `(ch, cc, v, s)` in `Binding.input`. Hardware doesn't need to understand status bytes past the note-on/note-off split.

---

## 2.4 Perception

Perception is the model of how the hardware's wire bytes appear to the eye. It has two independent modes:

- **`mix`** — how colours combine. Corrects per-channel gain (white balance) or applies an inverse LUT derived from per-channel curves. Makes the mix look like the intended RGB.
- **`brightness`** — how brightness maps to wire bytes. Solves the wire byte that produces a target perceived brightness at the current rgb.

Both modes are derived from one data source: the hardware's **curves** (or **samples** that become curves). Neither mode is applied unless declared.

**Absent `PERCEPTION` block = raw output.** This is the default. A hardware with no interest in perception just omits it. `send` receives the exact `(rgb, hw)` the scheme produced.

### 2.4.1 Data formats

The hardware supplies its model in one of two forms:

**Form A — `curves` (direct):**

Per-channel `[hw, perceived]` pairs. `perceived` is normalised internally to `[0, 1]` against the channel's peak. `hw` is 0–127.

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

Or, naming a block in `LED_TRANSFERS`:

```js
PERCEPTION: {
    curves: 'measuredRGB',      // → LED_TRANSFERS.measuredRGB
    mode: { mix: 'correct', brightness: 'flat' }
}
```

**Form B — `samples` (equal-brightness triplets):**

An array of `{ step, rgb }` samples. Each `step` is the perceived brightness at that sample (0–1, with 1 = brightest), and `rgb` is the wire triplet that produces *equal perceived brightness* across all three channels at that step. The framework derives per-channel curves from these samples.

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

**Minimum 2 samples.** One sample is "all equal brightness" — no curve information, warn-once and treat as absent. Two samples (brightest + darkest) give a linear interpolation; more samples interpolate piecewise.

Non-monotonic `step` values are sorted ascending and deduped, warn-once. Best-effort curve is derived.

**How derivation works:**

For each channel `c`, `samples[i].rgb[c]` becomes the wire byte, `samples[i].step` becomes the perceived brightness. Sort by wire byte, normalise against channel peak. Result is a curve in the same shape as Form A.

From curves, the framework derives **inverse LUTs** (perceived → wire byte per channel, 128 entries each), used for mix correction.

### 2.4.2 Modes

`mode` declares which modes to apply. Both keys are optional; omitted means `'off'` for that aspect, unless the `PERCEPTION` block is present with no `mode` at all, in which case the default is `{ mix: 'correct', brightness: 'own' }` — full correction, respecting per-stop brightness values (see §2.4.2.1).

**`mix`:**

| Value | Effect |
|---|---|
| `'off'` | No mix correction. `send` receives the raw scheme rgb. |
| `'correct'` | Apply mix correction. If `wbGain` is present, `rgb[c] ×= wbGain[c]` (clamped). Else, `rgb[c] = lut[c][rgb[c]]` (inverse LUT from curves). |

**`brightness`:**

| Value | Effect |
|---|---|
| `'off'` | No brightness solve. `send` receives the scheme's `hw` byte unchanged. |
| `'own'` | Solve `hw` for this stop's target. Target = `(brightness / 127) × emit(rgb, 127)` — "this fraction of the full-brightness this rgb can achieve on this hardware". |
| `'flat'` | Solve `hw` for the ramp's flat target. Target = minimum perceived luminance across all non-black stops in the ramp. All stops land at the same perceived brightness. |

The four combinations:

| mix | brightness | Result |
|---|---|---|
| `'off'` | `'off'` | Raw pass-through (equivalent to no `PERCEPTION` block) |
| `'correct'` | `'off'` | Colour mix corrected, brightness passes through |
| `'correct'` | `'own'` | Both applied, per-stop brightness respected |
| `'correct'` | `'flat'` | Both applied, brightness flattened (K3 current) |

**Recommended defaults:**

- New hardware: `{ mix: 'correct', brightness: 'own' }` (or omitted `mode` — same effect).
- Hardware with no curves: no `PERCEPTION` block.
- Stylistic flat-brightness hardware (K3): `{ mix: 'correct', brightness: 'flat' }`.

**Edge cases:**

- `brightness: 'flat'` on a single-colour scheme behaves as `'own'` — the flat target of a one-stop ramp is that stop's own brightness.
- `brightness: 'flat'` on a ramp with all-black stops produces a null target; `hw` passes through.
- `mix: 'correct'` with neither `wbGain` nor `curves` — nothing to correct against; behaves as `'off'`.
- Missing curves entirely (no `curves`, no `samples`, no `custom`) — all modes behave as `'off'`.

**Per-scheme override:**

A scheme can declare `perception` to override the hardware's mode for its own LEDs:

```js
myCatnip.SCHEMES.myScheme = {
    colors: [...],
    perception: { brightness: 'own' }   // mix from HW default, brightness overridden
};
```

`perception: false` bypasses the whole pipeline for that scheme — `send` receives the raw `(rgb, hw)`. This is useful for a scheme whose stops have been pre-tuned for the wire, or for diagnostic single-shot LEDs.

### 2.4.3 K3's expression

The K3's model is more complex than curve-LUT: it uses a measured transfer curve × white balance × channel perceptual weights × luminance gamma × saturation boost. This model is **K3-specific** and lives entirely in `hw-k3.js`. The framework never sees the internals.

At boot, K3 derives per-channel perceived-response curves from its own model, then feeds them to the framework via `PERCEPTION.curves`:

```js
// In hw-k3.js
PERCEPTION: {
    curves: 'measuredRGB',        // or {r,g,b}, or samples, or custom
    wbGain: [0.6, 1.0, 0.93],     // optional, default [1,1,1]
    weights: [1.35, 0.69, 0.19],  // optional, default [1,1,1]
    gamma: 0.32,                   // optional, default 1
    hkBoost: 0.29,                 // optional, default 0
    mode: { mix: 'correct', brightness: 'flat' }
}
```

The `curves: 'measuredRGB'` form names K3's measured block. The framework normalises it with `_buildTransfer` and derives LUTs from it. `wbGain` is applied separately by the mix step (WB takes precedence over inverse LUT — a hardware typically provides one or the other, not both; K3 provides both because WB was measured independently and is cheaper to apply than a LUT).

Result: K3 output is byte-identical to v2.0.0.

**K3-specific model inputs stay in `DEFAULTS`.** `wbGain`, `channelPerceptual`, `hkBoost`, `lumGamma` — these are K3's model parameters, used by `deriveK3Curves` at boot. They aren't general-purpose; other hardware won't use them. A hardware that wants the K3 model wholesale can copy `HW_K3`'s declaration.

### 2.4.4 Capturing N-sample curves manually

For any RGB+br hardware, a rough perception model can be captured in N samples:

1. Pick N levels — say 5. (More is better but harder to capture accurately; 5 gives two segments between each adjacent pair, which is enough for typical RGB LEDs.)
2. Set all three channels to full (`[255, 255, 255]` for 8-bit, or `[127, 127, 127]` for 7-bit). Note the perceived brightness. That's `step = 1.00`.
3. Reduce all three channels equally in wire steps until the perceived brightness is half (or some evenly-spaced value). Record the wire triplet. That's `step = 0.50`.
4. Continue for each level, down to `[0, 0, 0]` (`step = 0.00`).
5. The final data — paired `(step, [r, g, b])` — goes into `PERCEPTION.samples`.

If your hardware's channels *don't* produce equal perceived brightness at identical wire values (e.g. red at `[127, 0, 0]` looks brighter than blue at `[0, 0, 127]`), use the `wbGain` field to correct channel gain before sampling, or capture per-channel and supply `curves` directly.

The samples form assumes all three channels are wire-equal after `wbGain`. If they aren't, use `curves`.

**Sample shape:**

```js
{ step: 0.75, rgb: [r, g, b] }
```

`step` is 0–1 (higher = brighter). `rgb` is 0–127 per channel.

### 2.4.5 Custom escape

A hardware with a model too complex for curves/samples can supply a function:

```js
PERCEPTION: {
    custom: function(rgb, brightness, ramp, ctrl) {
        // Returns { rgb: [r, g, b], hw: byte }
        // Called per LED frame instead of the standard pipeline.
        // Framework still handles dispatch, deduping, and cache.
    }
}
```

When `custom` is present, `curves` / `samples` / `mode` are ignored. The framework calls `custom` and uses its return value.

This is the escape hatch — for a hardware that reads its own COs, or that needs to sample the ramp at a level the framework doesn't expose. Most hardware won't need it.

---

## 2.5 Palette

Named colours are per-hardware. `hw.PALETTE[name]` returns the RGB triplet for `name`.

```js
PALETTE: {
    off:     [0, 0, 0],
    red:     [127, 0, 0],
    green:   [0, 127, 0],
    blue:    [0, 0, 127],
    // ...
}
```

`resolveNamedColour(name, ctrl)` resolves:

1. `ctrl.hw.PALETTE[name]` — hardware's value if present.
2. Framework canonical — used as fallback if hardware doesn't override.
3. Warn-once + black — if neither has the name.

**The framework has no per-hardware canonical set.** It defines no default palette; the fallback is black + warn. A hardware with no `PALETTE` renders every named colour as dark (with a diagnostic warning). This is by design — colour is hardware-specific.

Omit `PALETTE` for a hardware with no LEDs or no colour. Every named colour goes dark; no silent colour guessing.

**Scheme compile cache is per-hardware.** Two hardware descriptors with different `PALETTE` tables compile schemes separately — no cross-contamination.

### MIXXX_COLORS

Same shape, keyed by Mixxx hotcue hex (8-bit RGB):

```js
MIXXX_COLORS: {
    0xC50A08: [0x6F, 0x05, 0x00],   // Mixxx red → wire values
    0xFF8000: [0x7F, 0x20, 0x00],
    // ...
}
```

Unknown hexes fall back to a plain halving of the 8-bit values. A hardware with a tuned `MIXXX_COLORS` table gets accurate hotcue colours; one without gets "close enough".

---

## 2.6 LED_TRANSFERS

Raw `[hw, luminance]` curve data, one block per named curve. Referenced by `PERCEPTION.curves: 'name'`.

```js
LED_TRANSFERS: {
    measuredRGB: {
        r: [[0, 0], [2, 45], [5, 138], ..., [127, 8200]],
        g: [[0, 0], [2, 68], [5, 195], ..., [127, 12700]],
        b: [[0, 0], [2, 377], [5, 1140], ..., [127, 49500]]
    }
}
```

`_buildTransfer` normalises each channel to `[0, 1]` against its own peak. Non-monotonic entries are flattened to the previous value with a warn-once.

A hardware that has one curve set uses one block. A hardware that has per-effect curves (e.g. separate red and green measurement sessions) can define multiple named blocks.

**`LED_TRANSFERS` is only read if named by `PERCEPTION.curves`.** Without a `PERCEPTION` block referencing it, the data sits inert.

---

## 2.7 DEFAULTS — boot-time fields

Merged into `cfg` before per-preset overrides in `bootCat` / `bootLab`. Fields the framework reads:

| Field | Meaning |
|---|---|
| `midiChannel` | default MIDI channel for buildBindings |
| `sysex` | whole-controller transport preference (`true` = sysex path, `false` = K2/plain-MIDI path for K3) |
| `wbGain` | `[r,g,b]` white-balance multipliers, 0–1 (K3-specific, used by `deriveK3Curves`) |
| `channelPerceptual` | `[r,g,b]` perceptual-channel weights (K3-specific) |
| `hkBoost` | saturation boost scalar (K3-specific) |
| `lumGamma` | luminance gamma (K3-specific) |

**`wbGain` / `channelPerceptual` / `hkBoost` / `lumGamma` are K3 model inputs**, not generic framework fields. K3 uses them to derive its `PERCEPTION.curves` at boot. A hardware that doesn't need them can omit them; a hardware that adopts the K3 model wholesale can copy the declaration.

Preset overrides win. A preset can force K2 mode on a K3 by passing `sysex: false` in its boot config.

**No `calibration` field.** Curve naming has moved to `PERCEPTION.curves`.

**No `calibrationMode` field.** Mode selection has moved to `PERCEPTION.mode`.

---

## 2.8 `pacing` — timing overrides

Applied to `myCatnip.TIMING` via `applyPacing(hw.pacing)` on boot. Per-pacer `throttleMs` overrides (`ctrl.pacer('led', {throttleMs: 0})`) supersede the global for that pacer.

For a synchronous hardware with no queue, `pacing` is `{}`.

---

## 2.9 Perception modules

Reference for `myCatnip.perception.*`. Pure functions plus per-hardware caches. Usable standalone (e.g. from a Lab bake, or from a hardware that wants to inspect its own derived curves).

```js
myCatnip.perception = {
    // Derivations (called once per HW per boot, cached)
    deriveCurves(hw),                 // hw → { r, g, b } curves
    deriveFromSamples(samples),       // [ {step, rgb} ] → { r, g, b } curves
    deriveLuts(curves),               // curves → { r: Uint8Array(128), g: ..., b: ... }
    _buildTransfer(rawObj),           // { r, g, b: [[hw, lum]...] } → normalised curves

    // Runtime per-frame functions
    applyMix(rgb, luts, wbGain),      // mutate rgb in place
    solveBrightness(hw, rgb, brightness, mode, ramp),  // → hw byte

    // Diagnostics
    _perceptionFingerprint(hw),       // → string (identity of current model)
    _flatTarget(ramp, hw, mode),      // → number | null
};
```

**Caches** — internal `WeakMap`s keyed on the HW object. `deriveCurves` computes once per HW per boot; `solveBrightness` caches bisect results per HW per (rgb, target) pair.

**Fingerprint** — `_perceptionFingerprint(hw)` returns a stable string identifying the current model (`mode + curves-identity`). Used internally by `_flatTarget` and `_hwCache` to invalidate when a hardware swaps its PERCEPTION block at runtime.

**Runtime mix toggle** — `ctrl._perceptionMixActive` (default `true`) can be toggled at runtime (Lab uses this for A/B testing during tuning). When `false`, `ctrl.sendLED` skips the mix step for every scheme, regardless of `mode.mix`. Toggling clears `_ledCache` so stale wire values don't dedupe incorrectly.

**`solveBrightness(hw, rgb, brightness, mode, ramp)`** — the framework-facing entry point. Called by `ctrl.sendLED` before `hw.send`. Returns the wire byte.

- `mode === 'off'` → return `brightness` unchanged.
- `mode === 'own'` → `target = (brightness / 127) × emit(rgb, 127)`, bisect.
- `mode === 'flat'` → `target = _flatTarget(ramp, hw, mode)`, bisect.
- No curves → return `brightness`.

**`applyMix(rgb, luts, wbGain)`** — mutates `rgb` in place.

- If `wbGain` present: `rgb[0] *= wbGain[0]`, clamped 0–127.
- Else if `luts` present: `rgb[0] = luts.r[rgb[0]]`, etc.

**Do not reimplement.** The framework is the only consumer in the shipped code, but a custom HW's `send` can call these if it wants to inspect the model. Always call through `ctrl.sendLED`'s perception pipeline rather than reproducing it, to keep caching coherent.

---

## 3. Porting a new hardware

### 3.1 Checklist

1. **Decide the transport.** Sysex, MIDI, both? If both, pick per-controller via `ctrl.sysex` or a dedicated field.
2. **Enumerate physical controls.** For each: what MIDI message does it send? What note/CC? What channel? Is there an LED under it? Which `idx`?
3. **Pick your `idx` space.** Any integer works. `-1` means no LED. Hardware only needs uniqueness within its own bindings.
4. **Author `buildBindings`.** Return one `Binding` per physical control. Include output-only bindings for pure LEDs.
5. **Author `wireInputs`.** Loop `ctrl.bindings`, skip `!b.midi`, wire the rest. Copy from §2.3 verbatim unless the transport isn't MIDI.
6. **Author `send`.** Receives `(ctrl, idx, rgb, hw)` — post-perception. Decide per-LED: compress to palette? emit note? emit sysex? send DMX? Return quickly.
7. **Author `blank`.** Sweep every LED — including any that a previous session's `send` might have left lit.
8. **Author `anyPendingWrites` and `decodeLedCache`.** `anyPendingWrites` returns `false` for synchronous hardware; `_pacers.led.length() > 0` for paced.
9. **Decide `PERCEPTION` (optional).** If your hardware's wire is nonlinear or has channel imbalance, capture curves (or samples) and declare modes. If your hardware's wire is linear, omit `PERCEPTION` — raw output is correct.
10. **Decide `DEFAULTS`.** At minimum `midiChannel`. Add `sysex: false` if plain MIDI.
11. **Decide `PALETTE`, `MIXXX_COLORS`, `LED_TRANSFERS`, `DEFAULT_RGB_BRIGHTNESS`.** Optional. Omit → framework warn-once fallbacks.
12. **Add to `.midi.xml` after `lib-perception.js` and `lib-binding.js`, before `lib-controller.js`.**
13. **Boot a preset with `hw: myCatnip.HW_<NAME>`.** If it doesn't work, `inspect('why', 'grid0_0')` walks the pipeline.

### 3.2 Load order

```
myCatnip-lib-core.js           ← leaf, defines _requireLoad, shared
myCatnip-lib-timing.js         ← TIMING, Pacing
myCatnip-lib-schemes.js        ← scheme engine
myCatnip-lib-perception.js     ← perception modules + caches
myCatnip-lib-binding.js        ← Binding primitive
myCatnip-hw-<name>.js          ← YOUR HARDWARE
myCatnip-lib-controller.js     ← constructs Controller
myCatnip-lib-controller-*.js   ← extend Controller
myCatnip-lib-funcs.js
myCatnip-lib-inspect.js
<preset files>
```

Hardware loads after `lib-binding.js` (it constructs `Binding` instances), after `lib-perception.js` (its `PERCEPTION` block is derived via `myCatnip.perception.*`), before `lib-controller.js` (which references `myCatnip.HW_K3` as the default descriptor in the constructor).

If your hardware is the default (`myCatnip.HW_K3` is the shipped one), load it before `lib-controller.js` in every `.midi.xml` that uses it.

### 3.3 Worked example — HW_FAKE

Brightness-only, plain MIDI, synchronous, no palette, no perception, no pacer. Lives at `test/hw-fake.js`. Booted via `bootCat({hw: myCatnip.HW_FAKE})`.

```js
// test/hw-fake.js — a test hardware. Not a shipping preset.
// Proves the HAL contract from outside K3.

'use strict';

(function() {
    myCatnip._requireLoad('myCatnip-hw-fake.js',
        ['Binding', 'TIMING']);

    var CH = 0x00;                     // fake MIDI channel

    myCatnip.HW_FAKE = {
        name: 'HW_FAKE',

        DEFAULTS: {
            midiChannel: CH,
            sysex: false
        },

        pacing: {},
        // No PERCEPTION, no LED_TRANSFERS, no PALETTE, no MIXXX_COLORS.

        buildBindings: function(ctrl) {
            var bindings = {};

            // Encoders — no LED
            for (var i = 0; i < 4; i++) {
                bindings['encoder' + i] = new myCatnip.Binding(
                    'encoder' + i,
                    { midi: [0xB0 + CH, 0x00 + i],
                      type: 'encoder', idx: -1 },
                    ctrl);
            }

            // Press buttons — LED idx 0..3
            for (var p = 0; p < 4; p++) {
                bindings['press' + p] = new myCatnip.Binding(
                    'press' + p,
                    { midi: [0x90 + CH, 0x40 + p],
                      type: 'button', idx: p },
                    ctrl);
            }

            // 4x4 grid — LED idx 4..19
            for (var r = 0; r < 4; r++) {
                for (var c = 0; c < 4; c++) {
                    bindings['grid' + c + '_' + r] =
                        new myCatnip.Binding(
                            'grid' + c + '_' + r,
                            { midi: [0x90 + CH, 0x50 + r * 4 + c],
                              type: 'button',
                              idx: 4 + r * 4 + c },
                            ctrl);
                }
            }

            // Output-only status LEDs — idx 20, 21
            bindings.ledPower = new myCatnip.Binding(
                'ledPower', { idx: 20 }, ctrl);
            bindings.ledActivity = new myCatnip.Binding(
                'ledActivity', { idx: 21 }, ctrl);

            return bindings;
        },

        wireInputs: function(ctrl) {
            var noteOff = 0x80 + CH;
            for (var name in ctrl.bindings) {
                var b = ctrl.bindings[name];
                if (!b.midi) continue;
                (function(b) {
                    function cb(_ch, _cc, v, s) {
                        if (b.input) b.input(_ch, _cc, v, s);
                    }
                    midi.makeInputHandler(b.midi[0], b.midi[1], cb);
                    if ((b.midi[0] & 0xF0) === 0x90) {
                        midi.makeInputHandler(noteOff, b.midi[1], cb);
                    }
                })(b);
            }
        },

        send: function(ctrl, idx, rgb, hw) {
            // Brightness-only: collapse RGB to max, scale by hw.
            var lum = Math.max(rgb[0], rgb[1], rgb[2]);
            var vel = Math.round(hw * lum / 127);
            midi.sendShortMsg(0x90 + CH, this._noteFor(idx), vel);
        },

        _noteFor: function(idx) {
            // 0..3 → press buttons 0x40..0x43
            // 4..19 → grid 0x50..0x5F
            // 20, 21 → status LEDs 0x60, 0x61
            if (idx < 4)  return 0x40 + idx;
            if (idx < 20) return 0x50 + (idx - 4);
            return 0x60 + (idx - 20);
        },

        blank: function(ctrl) {
            for (var idx = 0; idx <= 21; idx++) {
                midi.sendShortMsg(0x90 + CH, this._noteFor(idx), 0);
            }
        },

        anyPendingWrites: function(ctrl) {
            return false;              // synchronous
        },

        decodeLedCache: function(val) {
            if (typeof val !== 'number') return String(val);
            return ((val >>> 21) & 0x7F) + ':' +
                   ((val >>> 14) & 0x7F) + ':' +
                   ((val >>> 7)  & 0x7F) + ':' +
                   ( val         & 0x7F);
        }
    };
})();
```

**What this proves:**

- The six-method contract is sufficient for a non-K3 hardware.
- `(idx, rgb, hw)` is the whole output contract — no sysex, no notes leak upward.
- Output-only LEDs work (no `midi` field, driven by `colorScheme.schemeFromState`).
- Absent `PERCEPTION` = raw output. `send` receives the scheme's exact values.
- Absent `PALETTE` / `MIXXX_COLORS` fall back with warn-once.
- Synchronous `send` — no pacer allocated.

**What it doesn't prove:**

- Perception modes (no `PERCEPTION` block declared — see HW_CUSTOM).
- Multi-HW pacing.
- Per-HW palette isolation.

### 3.4 Worked example — HW_CUSTOM

Same surface as HW_FAKE, plus N-sample perception. Lives at `test/hw-custom.js`. Booted via `bootCat({hw: myCatnip.HW_CUSTOM})`.

```js
// test/hw-custom.js — a test hardware with perception.
// Proves the N-sample PERCEPTION path end-to-end.

'use strict';

(function() {
    myCatnip._requireLoad('myCatnip-hw-custom.js',
        ['Binding', 'TIMING']);

    var CH = 0x00;

    // Equal-brightness samples: at full all-channels, perceived
    // brightness = 1.0. At wire value 90, perceived brightness is
    // 75% of full. At 60, 50%. At 30, 25%. At 0, 0%.
    //
    // This shape (non-linear roll-off, brighter at low wire values)
    // is common for RGB LEDs. The exact numbers matter for the test
    // fixture; a real hardware would capture its own.
    myCatnip.HW_CUSTOM = {
        name: 'HW_CUSTOM',

        DEFAULTS: { midiChannel: CH, sysex: false },
        pacing: {},

        PERCEPTION: {
            samples: [
                { step: 1.00, rgb: [127, 127, 127] },
                { step: 0.75, rgb: [ 90,  90,  90] },
                { step: 0.50, rgb: [ 60,  60,  60] },
                { step: 0.25, rgb: [ 30,  30,  30] },
                { step: 0.00, rgb: [  0,   0,   0] }
            ],
            mode: { mix: 'correct', brightness: 'own' }
        },

        PALETTE: {
            off:    [0, 0, 0],
            red:    [127, 0, 0],
            green:  [0, 127, 0],
            blue:   [0, 0, 127],
            white:  [127, 127, 127]
        },

        buildBindings: function(ctrl) {
            // Same as HW_FAKE.
            var bindings = {};
            for (var i = 0; i < 4; i++) {
                bindings['encoder' + i] = new myCatnip.Binding(
                    'encoder' + i,
                    { midi: [0xB0 + CH, 0x00 + i],
                      type: 'encoder', idx: -1 }, ctrl);
            }
            for (var p = 0; p < 4; p++) {
                bindings['press' + p] = new myCatnip.Binding(
                    'press' + p,
                    { midi: [0x90 + CH, 0x40 + p],
                      type: 'button', idx: p }, ctrl);
            }
            for (var r = 0; r < 4; r++) {
                for (var c = 0; c < 4; c++) {
                    bindings['grid' + c + '_' + r] = new myCatnip.Binding(
                        'grid' + c + '_' + r,
                        { midi: [0x90 + CH, 0x50 + r * 4 + c],
                          type: 'button', idx: 4 + r * 4 + c }, ctrl);
                }
            }
            bindings.ledPower = new myCatnip.Binding(
                'ledPower', { idx: 20 }, ctrl);
            return bindings;
        },

        wireInputs: function(ctrl) {
            var noteOff = 0x80 + CH;
            for (var name in ctrl.bindings) {
                var b = ctrl.bindings[name];
                if (!b.midi) continue;
                (function(b) {
                    function cb(_ch, _cc, v, s) {
                        if (b.input) b.input(_ch, _cc, v, s);
                    }
                    midi.makeInputHandler(b.midi[0], b.midi[1], cb);
                    if ((b.midi[0] & 0xF0) === 0x90) {
                        midi.makeInputHandler(noteOff, b.midi[1], cb);
                    }
                })(b);
            }
        },

        send: function(ctrl, idx, rgb, hw) {
            // Same collapse-to-brightness transport as HW_FAKE.
            // Perception has already run, so rgb and hw are wire-
            // ready.
            var lum = Math.max(rgb[0], rgb[1], rgb[2]);
            var vel = Math.round(hw * lum / 127);
            midi.sendShortMsg(0x90 + CH, this._noteFor(idx), vel);
        },

        _noteFor: function(idx) {
            if (idx < 4)  return 0x40 + idx;
            if (idx < 20) return 0x50 + (idx - 4);
            return 0x60 + (idx - 20);
        },

        blank: function(ctrl) {
            for (var idx = 0; idx <= 20; idx++) {
                midi.sendShortMsg(0x90 + CH, this._noteFor(idx), 0);
            }
        },

        anyPendingWrites: function(ctrl) { return false; },

        decodeLedCache: function(val) {
            if (typeof val !== 'number') return String(val);
            return ((val >>> 21) & 0x7F) + ':' +
                   ((val >>> 14) & 0x7F) + ':' +
                   ((val >>> 7)  & 0x7F) + ':' +
                   ( val         & 0x7F);
        }
    };
})();
```

**What this proves (beyond HW_FAKE):**

- N-sample `PERCEPTION` derivation produces correct curves.
- `mode.mix: 'correct'` applies the derived inverse LUT to rgb.
- `mode.brightness: 'own'` solves the wire byte for the stop's target.
- With no `wbGain`, mix comes from the LUT; the samples are self-consistent.
- Per-HW `PALETTE` — HW_CUSTOM's palette is used for this controller's schemes, isolated from HW_K3's if both run in one session.

**Test fixture, not a shipping preset.** No `.midi.xml` loads `HW_CUSTOM`. It exists for `test/hw-custom.test.js` to boot and assert against.

---

## 4. Cross-controller state

### 4.1 The shared namespace

`myCatnip.shared` holds state visible to every controller. Owner-write, everyone-read.

```js
myCatnip.shared = {
    timeSig:         { 1: null, 2: null, 3: null, 4: null },
    lastLoopTouchMs: { 1: 0, 2: 0, 3: 0, 4: 0 },
    warned:          Object.create(null),
    controllers:     {},
    rw:              {}
};
```

**`timeSig`** — per-channel time signature. `myCatnip.setTimeSig(bb, pb)` sets all channels; `setTimeSig(bb, pb, ch)` sets one channel. Read by the beat cascade and countdown schemes. `null` means "use scheme defaults".

**`lastLoopTouchMs`** — per-channel beatjump throttle timestamps. Two controllers on the same channel share the gate. This is deliberate: Mixxx misbehaves on rapid `beatjump_*` fires in an active loop, and a second controller's rapid fires bypass the first controller's throttle if the timestamp is per-controller.

**`warned`** — warn-once dedupe map. One warning per key per boot, regardless of how many controllers trigger it.

**`controllers`** — one block per running controller. See §4.2.

**`rw`** — reserved. Bar to add a field: a concrete case an owner-block can't model. No case exists today.

### 4.2 Controller blocks

Each controller publishes a block at boot and keeps it in sync. Block shape:

```js
myCatnip.shared.controllers.Cat = {
    label: 'Cat',
    hw: 'Xone K3',
    midiChannel: 0x0E,

    activeDeck: 'A',
    activeFx: 'A',
    selectedDeckA: 1, selectedDeckB: 3,
    selectedFxA: 2,   selectedFxB: 4,
    selectedDeckCurrent: 1,
    selectedFxCurrent: 2,

    activePatches: ['topShared', 'fxLayout1', 'cue'],
    topMode: 'focus',
    modifiers: { shift: false, chord: false, loadArm: false }
};
```

Rules:

- **Owner writes.** Only the owning controller writes its own block. Every other controller reads.
- **No aggregate fields.** Cross-controller views are computed by scanning `shared.controllers` at read time.
- **No change notification.** Read fresh in a func, or the writer explicitly `_refreshAllLeds` on peers if a render needs the new value.
- **Blocks are removed on shutdown.** `shutdown()` deletes its own block.

**Both slots and channels are exposed.** `activeDeck: 'A'` is the slot letter; `selectedDeckCurrent: 1` is the resolved channel. Slot letters are per-controller (Cat's A might be ch1, Kitten's A might be ch2), so cross-controller logic uses the channel. The slot letter is useful for reacting to "Cat switched from A to B".

### 4.3 Reading another controller

```js
// What deck is Cat focused on?
var cat = myCatnip.shared.controllers.Cat;
if (cat) {
    var ch = cat.selectedDeckCurrent;   // 1..4
    // ...
}
```

For a status LED that follows another controller's focus:

```js
bindings.ledActivity = new myCatnip.Binding('ledActivity', { idx: 21 }, ctrl);
// colorScheme:
{
    schemeFromState: {
        state: 'shared.controllers.Cat.activeDeck',
        map: { A: 'green, 80', B: 'amber, 80' }
    }
}
```

`readPath` resolves dot-paths through `myCatnip.shared.*` and any object on it.

---

## 5. Known limitations

| # | Limitation |
|---|---|
| L1 | `PERCEPTION.samples` assumes all three channels are wire-equal after `wbGain`. If they aren't, use `curves` instead. |
| L2 | Per-binding `colorScheme.perception` override not supported. Per-scheme override (via `scheme.perception`) is the granularity. |
| L3 | Multi-HW pacing relies on per-pacer `throttleMs`, not global `TIMING`. |
| L4 | `PERCEPTION` is derived once per HW per boot. Swapping a hardware's PERCEPTION at runtime is not supported — the descriptor is expected to be static. |
| L5 | `mixxx`-typed stops are static-only — they can't be sampled in a scheme ramp. |
| L6 | `PERCEPTION.custom` disables the framework's own caching coherence for the mix step. A custom function is expected to be cheap or cache its own results. |

---

## Migration from v2.0.0

A v2.0.0 hardware descriptor will not run against a v2.1.0 framework. Migration points:

| v2.0.0 | v2.1.0 |
|---|---|
| `hw.writeLED(ctrl, idx, r, g, b, hw)` | `hw.send(ctrl, idx, rgb, hw)` — `rgb` is `[r, g, b]` |
| `hw.calibrate` (never shipped) | `hw.PERCEPTION = { curves \| samples, mode }` |
| `hw.DEFAULTS.calibration: 'name'` | `hw.PERCEPTION.curves: 'name'` |
| `hw.DEFAULTS.calibrationMode: 'rms' \| 'off'` | `hw.PERCEPTION.mode.brightness: 'own' \| 'flat' \| 'off'` |
| `hw.DEFAULTS.wbGain` | Stays in DEFAULTS for K3 model; or moved into `PERCEPTION.wbGain` for a plain WB-only hardware |
| `resolveNamedColour(name)` (module-load override) | `hw.PALETTE[name]` — framework warn-once if single-arg used |
| `mapMixxxColor(rgb)` (module-load override) | `hw.MIXXX_COLORS[rgb]` — framework warn-once if single-arg used |
| `scheme.calibration: false` | `scheme.perception: false` (alias kept, warn-once) |
| `scheme.calibration: true` | `scheme.perception: null` (use HW default) or `{ mix: 'correct', brightness: 'own' }` |
| `_lastLoopTouchMs` (per-controller) | `shared.lastLoopTouchMs[ch]` (per-channel) |
| `TIME_SIG` (session-global) | `shared.timeSig[ch]` (per-channel); `setTimeSig(bb, pb)` still works globally |

**No automated migration.** Configs port manually. Warn-once on each deprecated form.