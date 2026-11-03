# Hardware — writing a descriptor

Everything the framework doesn't own. What a hardware is, what it
provides, what the framework guarantees, and how the two meet.

Two parts:

- **Part 1 — Overview.** One page. Diagrams, mental model, no
  code.
- **Part 2 — Reference.** Every method, every data block,
  worked example, porting checklist, limitations.

Parts are cross-linked by §.

---

## §0 — Version compatibility

This document describes the **v2.1.x** HAL.

**Perception is split out.** The `PERCEPTION` block, the two
emission models, the public `myCatnip.perception.*` API, and the
perception-specific limitations live in `PERCEPTION.md`. This
file covers the descriptor-side contract — the six methods, the
other data blocks, and the boundary between framework and
hardware. §2.4 and §2.9 here are pointers.

- v2.0.0 descriptors (using `writeLED` and the old `calibration`
  DEFAULTS fields) will not run against a v2.1.x framework.
  See §Migration.
- No backward-compatibility guarantees across minor versions.
  The HAL is a contract, not an API. Renames ship as documented
  migrations.
- Future versions document their own HAL version at the top of
  this file.

---

# Part 1 — Overview

## 1.1 The boundary

The framework is a schematic compiler, input router, colour
renderer, and perception-modeller. It produces canonical LED
values and consumes canonical input events. Everything between
"canonical" and "the wire" is the hardware.

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
      │  models perception   → post-mix (rgb, hw)   │
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
      │  declares perception  (curves, mode)        │
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

The hardware **never** knows:

- what a patch is
- what a scheme is
- what focus means
- how a binding gets resolved

The line is `ctrl.sendLED`. Above it: config semantics. Below it:
physical reality.

## 1.2 What the framework provides

- **Scheme compilation** — colour ramps, tmaps, marker bands,
  beat cascades, off-ramps, co-steering.
- **Binding resolution** — `$DECK_ACTIVE$` / `$FX_ACTIVE$` tokens,
  hash-diffed rebinds, transaction capture for push buttons.
- **Input dispatch** — bounce guards, orphaned-release handling,
  func dispatch, default input, CO writes.
- **Colour rendering** — sample the ramp, resolve the named
  stop, apply on/off, apply perception, hand `(idx, rgb, hw)`
  to the hardware.
- **Perception** — derive curves and LUTs from
  hardware-supplied data; apply mix correction and brightness
  solve per the hardware's declared modes. Detail:
  `PERCEPTION.md`.
- **State scopes** — session, per-channel, per-controller
  (§1.5).
- **Lazy activation** — beat clocks, pacer queues, CO
  connections only exist while something needs them.

## 1.3 What a hardware provides

A **descriptor**: one plain JS object. Six methods, six optional
data blocks.

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
| **D** | `DEFAULTS` | Boot defaults: `midiChannel`, `sysex` |
| **P** | `pacing` | Timing overrides (may be `{}`) |
| **T** | `LED_TRANSFERS` | Raw [hw, luminance] curves (named blocks) |
| **Pc** | `PERCEPTION` | Perception model (`PERCEPTION.md`) |
| **Pa** | `PALETTE` | Named colour RGB values |
| **M** | `MIXXX_COLORS` | Mixxx hex → RGB |
| **B** | `DEFAULT_RGB_BRIGHTNESS` / `_OFF` | On/off brightness levels |

Everything except the six methods is optional. Omit
`PERCEPTION` → raw output (no correction). Omit `PALETTE` →
framework warns once per unresolved name, LED goes dark. Omit
`MIXXX_COLORS` → `mixxx`-typed stops fall back to halving. Omit
`DEFAULT_RGB_BRIGHTNESS` → framework defaults (110/12).

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

Seam 1 is `hw.send` (called by `ctrl.sendLED` after perception).
Seam 2 is `wireInputs`. Seam 3 is `myCatnip.shared` (§4).

Seams 1 and 2 are fully hardware-owned. Seam 3 is
framework-owned with hardware read access.

## 1.5 Where state lives

Three scopes. Every value sits in exactly one.

```
┌────────────────────────────────────────────────────────────────┐
│ SESSION  (myCatnip.shared.*)                                    │
│                                                                 │
│  timeSig[1..4]           ← per-channel                          │
│  lastLoopTouchMs[1..4]   ← per-channel                          │
│  warned                  ← warn-once dedupe map                 │
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
│  _perceptionMixActive     │    │  _perceptionMixActive     │
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

Two controllers on the same channel share `shared.lastLoopTouchMs[ch]`
and `shared.timeSig[ch]` — both are properties of the music, not
the controller.

Two controllers never share `bindings`, `_ledCache`, `_pacers`,
`_perceptionMixActive` — those are per physical surface.

Two controllers **can** read each other's
`shared.controllers[label]` block — that's what enables
cross-controller state.

---

# Part 2 — Reference

## 2.0 Conformance

A descriptor is conformant iff all of these hold:

1. **Six methods present and callable.** `buildBindings`,
   `wireInputs`, `send`, `blank`, `anyPendingWrites`,
   `decodeLedCache`. All callable without throwing on first
   invocation.
2. **`buildBindings` returns an object.** `{ name: Binding }` with
   at least one binding, or an empty object for a hardware with no
   controls.
3. **Every binding has `idx` set.** `-1` for "no LED", `0..N` for
   "this LED index". `send` is guaranteed not to receive an `idx`
   your `buildBindings` didn't declare.
4. **`send` handles every `(idx, rgb, hw)`.** Every `idx` in the
   range your bindings declare. Every `rgb` in `[0, 127]³`. Every
   `hw` in `[0, 127]`. Post-perception values.
5. **`blank` sweeps every `idx`.** Including any that a previous
   session might have left lit — `blank` is the reset path, and
   it must reset.
6. **`anyPendingWrites` returns `false` when drained.**
   Synchronous hardware returns `false` immediately. Queued
   hardware returns `false` only after every queued frame has
   been sent.
7. **`PERCEPTION` (if present) is well-formed.** Either `curves`
   or `samples` or `custom`. `mode` if present must have valid
   keys. Model params (if present) must be well-typed. Details:
   `PERCEPTION.md` §2, §3.
8. **No method throws.** The framework catches (warn-once), but a
   throwing method degrades gracefully only by being skipped.
   Correct hardware returns without throwing.

A hardware failing (8) still boots; the framework drops its frames
for the affected call. A hardware failing (1) or (2) does not boot.

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

Loaded after `lib/binding.js` (constructs `Binding` instances),
after `lib/perception.js` (uses `myCatnip.perception.*`), before
`lib/controller.js` (default descriptor reference). See §3.2.

## 2.2 LEDs — the output side

### The contract

Framework calls `ctrl.sendLED(idx, r, g, b, hw)`, which:

1. Resolves the mix mode for this frame (`PERCEPTION.md` §9.2 —
   per-scheme override → `ctrl._perceptionMixActive` kill-switch
   → `hw.PERCEPTION.mode.mix`).
2. Applies mix correction (`myCatnip.perception.applyMix`) if
   mode is `'correct'`.
3. Calls `ctrl.hw.send(ctrl, idx, [r', g', b'], hw')` with
   **post-perception** values.

It also calls `blank(ctrl)` on shutdown / init and
`anyPendingWrites(ctrl)` when waiting for output to drain.

**The framework guarantees:**

- `idx` is an opaque integer. `-1` means "no LED mapped". No
  other convention.
- `rgb` is `[r, g, b]`, each 0–127. Named colours have been
  resolved. `mixxx`-typed stops have been resolved. Off-ramps
  have been selected. Beat cascades have been applied.
  **Perception mix has been applied** (if mode is `'correct'`).
- `hw` is 0–127. **On sampled render paths** (deviation LEDs,
  co-match) the perception brightness solve has been applied
  (if `mode.brightness` is `'own'` or `'flat'`). **On static
  render paths** (fixed-colour LEDs, markers) brightness passes
  through unchanged — matching v2.0.0 behaviour. See `PERCEPTION.md`
  §4.2.
- Calls arrive at scheme framerate, not audio rate. The framework
  dedupes on `(idx, packed rgb + hw)` before calling you.
- A scheme may declare `perception: false` — then both mix and
  brightness solve are skipped for that scheme, and `send`
  receives raw `(rgb, hw)`.

**The hardware decides:**

- What `idx` means physically (which note, which pixel, which
  sysex index).
- Whether to compress RGB further (to a palette, to a single
  channel, to a velocity). Post-framework compression is your
  own — the framework has no view.
- What wire format to emit (sysex, MIDI, DMX, whatever).

**The hardware must:**

- Return quickly. LED writes are synchronous in `send`. Queue +
  timer inside `send` if the wire is slower than the framework's
  call rate (`ctrl.pacer('led', {sendFn, throttleMs})` is
  available for that).
- Not retain `rgb`, `hw`, or `idx` past return. They may be
  reused scratch values.
- Honour `blank()` — sweep every LED it can.
- Return `false` from `anyPendingWrites` when no output remains
  queued. A synchronous hardware returns `false` immediately.
- **Not re-apply perception.** By the time `send` is called, mix
  correction and brightness solve are done. Your
  `PERCEPTION.mode` told the framework what to do; `send` just
  transports.

### The idx space

`idx` is whatever the hardware's `buildBindings` assigns. Two
conventions worth naming:

- **`-1`** — binding exists but has no LED (encoder, fader,
  input-only button). Framework skips sends.
- **Contiguous indices** — HW_FAKE uses 0..21. K3 uses 0x00..0x21.
  There's no requirement to be contiguous, but leaving gaps wastes
  `_ledCache` slots.

`decodeLedCache(val)` is the diagnostic reverse — used by
`inspect('why', name)` to print "last written to idx N was
r:g:b:hw" (post-perception wire values). Hardware-specific
packing → human-readable string.

### Output-only LEDs

A binding with no `midi` field is an LED with no button. The
framework skips it in `wireInputs`. It can carry a
`colorScheme.schemeFromState` that reads
`myCatnip.shared.controllers[label]` or any CO — useful for
status LEDs driven by cross-controller state.

```js
bindings.ledActivity = new myCatnip.Binding('ledActivity', {
    idx: 21                            // no midi field
}, ctrl);
```

## 2.3 Input — `buildBindings` and `wireInputs`

### buildBindings

Returns `{name: Binding}`. Names are the vocabulary that config
files use — `encoder0`, `grid2_1`, `layer`, `pressR`. Whatever
you call them is what config files reference.

```js
bindings.grid2_1 = new myCatnip.Binding('grid2_1', {
    midi: [0x90 + ch, 0x22],           // note-on, note 0x22
    type: 'button',                    // 'button' | 'knob' | 'fader' | 'encoder'
    idx: 18                            // 0..N; -1 for no LED
}, ctrl);
```

Binding fields the framework reads:

- `midi` — `[status, data1]`. Absent = output-only. The framework
  passes it to `wireInputs`.
- `type` — `'button'` / `'knob'` / `'fader'` / `'encoder'`. `button`
  gets bounce guard + transaction capture + `_isPress(v, s)`
  semantics. Others get `_normalized` tracking and valueCurve.
- `idx` — LED index. See §2.2.

Everything else on the Binding is config-driven (group, inKey,
buttonMode, colorScheme, func). Hardware doesn't touch it.

### wireInputs

Registers Mixxx input handlers. For each binding with a `midi`
field, call `midi.makeInputHandler(status, data1, cb)`. For
button bindings (`type: 'button'`), also wire the note-off half:

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

The framework parses `(ch, cc, v, s)` in `Binding.input`. Hardware
doesn't need to understand status bytes past the
note-on/note-off split.

## 2.4 Perception — pointer

`hw.PERCEPTION` is the descriptor-side declaration. What the
model *is*, what formats are accepted, what modes exist, how
Model A differs from Model B, and the full
`myCatnip.perception.*` API live in `PERCEPTION.md`.

The HAL contract this file guarantees:

- **Framework applies perception before `hw.send`.** By the time
  `send` runs, mix correction (if `mode.mix === 'correct'`) and
  brightness solve (if `mode.brightness` is `'own'` or `'flat'`,
  on sampled render paths) have happened.
- **Hardware must not re-apply perception.** `send` transports
  post-perception values.
- **Absent `PERCEPTION` = raw output.** No correction, no solve,
  `send` receives the scheme's exact `(rgb, hw)`.
- **`sysex: false` (K2 transport) disables mix end-to-end** but
  leaves brightness solve running. Prediction and wire both see
  pre-mix rgb; the wire may discard the solve's resolution. See
  `PERCEPTION.md` §6.1.

Per-scheme override (`scheme.perception`) is resolved by the
framework before either step; see `PERCEPTION.md` §8.

## 2.5 Palette

Named colours are per-hardware. `hw.PALETTE[name]` returns the
RGB triplet for `name`.

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
2. Framework canonical fallback — for a caller with no `ctrl`.
3. Warn-once + black — if neither has the name.

**Scheme compile cache is per-hardware.** Two descriptors with
different `PALETTE` tables compile schemes independently.

Omit `PALETTE` for a hardware with no LEDs or no colour. Every
named colour goes dark; no silent colour guessing.

### MIXXX_COLORS

Same shape, keyed by Mixxx hotcue hex (8-bit RGB):

```js
MIXXX_COLORS: {
    0xC50A08: [0x6F, 0x05, 0x00],   // Mixxx red → wire values
    0xFF8000: [0x7F, 0x20, 0x00],
    // ...
}
```

Unknown hexes fall back to a plain halving of the 8-bit values.

## 2.6 LED_TRANSFERS

Raw `[hw, luminance]` curve data, one block per named curve.
Referenced by `PERCEPTION.curves: 'name'`.

```js
LED_TRANSFERS: {
    measuredRGB: {
        r: [[0, 0], [2, 45], [5, 138], ..., [127, 8200]],
        g: [[0, 0], [2, 68], [5, 195], ..., [127, 12700]],
        b: [[0, 0], [2, 377], [5, 1140], ..., [127, 49500]]
    }
}
```

`_buildTransfer` (in `lib/perception.js`) normalises each channel
to `[0, 1]` against its own peak. Non-monotonic entries are
flattened to the previous value with a warn-once.

**`LED_TRANSFERS` is only read if named by `PERCEPTION.curves`.**
Without a `PERCEPTION` block referencing it, the data sits inert.

## 2.7 DEFAULTS

Merged into `cfg` before per-preset overrides in `bootCat` /
`bootLab`. Fields the framework reads:

| Field | Meaning |
|---|---|
| `midiChannel` | default MIDI channel for buildBindings |
| `sysex` | whole-controller transport preference (K3: `true` = sysex path, `false` = K2/plain-MIDI path) |

Nothing else. v2.0.0's `calibration` / `calibrationMode` /
`wbGain` / `channelPerceptual` / `hkBoost` / `lumGamma` are gone —
they moved to `PERCEPTION`.

## 2.8 pacing — timing overrides

Applied to `myCatnip.TIMING` via `applyPacing(hw.pacing)` on boot.
Per-pacer `throttleMs` overrides (`ctrl.pacer('led', {throttleMs: 0})`)
supersede the global for that pacer.

For a synchronous hardware with no queue, `pacing` is `{}`.

## 2.9 Perception public API — pointer

`myCatnip.perception.*` — derivations, `applyMix`,
`solveBrightness`, the per-HW caches, and the diagnostics
helpers (`_emitAt`, `_bisectHw`, `_flatTarget`, `_fingerprint`,
`_invalidate`, `_minSegmentEmit`, etc.) — is documented in
`PERCEPTION.md` §9.

---

# Part 3 — Porting a new hardware

## 3.1 Checklist

1. **Decide the transport.** Sysex, MIDI, both? If both, pick
   per-controller via `ctrl.sysex` or a dedicated field.
2. **Enumerate physical controls.** For each: what MIDI message
   does it send? What note/CC? What channel? Is there an LED
   under it? Which `idx`?
3. **Pick your `idx` space.** Any integer works. `-1` means no
   LED. Hardware only needs uniqueness within its own bindings.
4. **Author `buildBindings`.** Return one `Binding` per physical
   control. Include output-only bindings for pure LEDs.
5. **Author `wireInputs`.** Loop `ctrl.bindings`, skip `!b.midi`,
   wire the rest. Copy from §2.3 verbatim unless the transport
   isn't MIDI.
6. **Author `send`.** Receives `(ctrl, idx, rgb, hw)` —
   post-perception. Decide per-LED: compress to palette? emit
   note? emit sysex? Return quickly.
7. **Author `blank`.** Sweep every LED — including any that a
   previous session's `send` might have left lit.
8. **Author `anyPendingWrites` and `decodeLedCache`.**
   `anyPendingWrites` returns `false` for synchronous hardware;
   `_pacers.led.length() > 0` for paced.
9. **Decide `PERCEPTION` (optional).** If your hardware's wire is
   nonlinear or has channel imbalance, capture curves (or
   samples) and declare modes. If your hardware's wire is linear,
   omit `PERCEPTION` — raw output is correct. See `PERCEPTION.md`
   §2–§4.
10. **Decide `DEFAULTS`.** At minimum `midiChannel`. Add
    `sysex: false` if plain MIDI.
11. **Decide `PALETTE`, `MIXXX_COLORS`, `LED_TRANSFERS`,
    `DEFAULT_RGB_BRIGHTNESS`.** Optional. Omit → framework
    warn-once fallbacks.
12. **Add to `.midi.xml` after `lib/perception.js` and
    `lib/binding.js`, before `lib/controller.js`.**
13. **Boot a preset with `hw: myCatnip.HW_<NAME>`.** If it
    doesn't work, `inspect('why', 'grid0_0')` walks the pipeline.

## 3.2 Load order

```
lib/core.js                 ← leaf; defines myCatnip, shared state,
                              tokens, binding field table, beat math
lib/timing.js               ← TIMING, Pacing
lib/schemes.js              ← scheme engine, palette resolution
lib/perception.js           ← perception model + caches
lib/binding.js              ← Binding primitive
hw/<name>.js                ← YOUR HARDWARE
lib/controller.js           ← constructs Controller
lib/controller-colour.js
lib/controller-beat.js
lib/controller-render.js
lib/controller-boot.js
lib/funcs.js
lib/inspect.js
<config files>
<entry module>
```

Hardware loads after `lib/binding.js` (it constructs `Binding`
instances), after `lib/perception.js` (its `PERCEPTION` block is
derived via `myCatnip.perception.*`), before `lib/controller.js`
(which references `myCatnip.HW_K3` as the default descriptor in
the constructor).

If your hardware is the default (`myCatnip.HW_K3` is the shipped
one), load it before `lib/controller.js` in every `.midi.xml`
that uses it.

## 3.3 Worked example — minimal brightness-only hardware

**Template only.** This is not shipped as a preset — it exists to
prove the HAL contract can be satisfied by a non-K3 hardware.
Drop into `test/hw-fake.js` (or a user's own file) if you want to
boot it.

```js
// test/hw-fake.js — minimal brightness-only hardware.
// Proves: send/blank/anyPendingWrites/decodeLedCache suffice;
// no PERCEPTION means raw output; output-only LEDs work.

(function() {
    var CH = 0x00;

    myCatnip.HW_FAKE = {
        name: 'HW_FAKE',
        DEFAULTS: { midiChannel: CH, sysex: false },
        pacing: {},
        // No PERCEPTION, no LED_TRANSFERS, no PALETTE, no MIXXX_COLORS.

        buildBindings: function(ctrl) {
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
            if (idx < 4)  return 0x40 + idx;
            if (idx < 20) return 0x50 + (idx - 4);
            return 0x60 + (idx - 20);
        },

        blank: function(ctrl) {
            for (var idx = 0; idx <= 21; idx++) {
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

**What this proves:**

- Six-method contract is sufficient for a non-K3 hardware.
- `(idx, rgb, hw)` is the whole output contract — no sysex, no
  notes leak upward.
- Output-only LEDs work (no `midi` field, driven by
  `colorScheme.schemeFromState`).
- Absent `PERCEPTION` = raw output — `send` receives the scheme's
  exact values.

## 3.4 Worked example — perception with N-sample curves

**Template only.** Same surface as §3.3 plus a `PERCEPTION` block.
Proves the sample-derivation path end-to-end.

```js
// test/hw-custom.js — brightness-only hardware with perception.
// Proves: N-sample derivation, Mode B emit, LUT mix, mode.mix
// actually transforms rgb.

(function() {
    var CH = 0x00;

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

**What this proves (beyond §3.3):**

- N-sample `PERCEPTION` derivation produces correct curves.
- `mode.mix: 'correct'` applies the derived inverse LUT to rgb.
- `mode.brightness: 'own'` solves the wire byte for the stop's
  target.
- With no `wbGain`, mix comes from the LUT; the samples are
  self-consistent.
- Per-HW `PALETTE` — HW_CUSTOM's palette is used for this
  controller's schemes, isolated from HW_K3's if both run in one
  session.

---

# Part 4 — Cross-controller state

## 4.1 The shared namespace

`myCatnip.shared` holds state visible to every controller.
Owner-write, everyone-read.

```js
myCatnip.shared = {
    timeSig:         { 1: null, 2: null, 3: null, 4: null },
    lastLoopTouchMs: { 1: 0, 2: 0, 3: 0, 4: 0 },
    warned:          Object.create(null),
    controllers:     {},
    rw:              {}
};
```

**`timeSig`** — per-channel time signature. `myCatnip.setTimeSig(bb, pb)`
sets all channels; `setTimeSig(bb, pb, ch)` sets one channel. Read
by the beat cascade and countdown schemes. `null` means "use
scheme defaults".

**`lastLoopTouchMs`** — per-channel beatjump throttle timestamps.
Two controllers on the same channel share the gate. Deliberate:
Mixxx misbehaves on rapid `beatjump_*` fires in an active loop,
and a second controller's rapid fires would bypass the first
controller's throttle if the timestamp were per-controller.

**`warned`** — warn-once dedupe map. One warning per key per boot,
regardless of how many controllers trigger it.

**`controllers`** — one block per running controller. See §4.2.

**`rw`** — reserved. Bar to add a field: a concrete case an
owner-block can't model. No case exists today.

## 4.2 Controller blocks

Each controller publishes a block at boot and keeps it in sync.
Block shape:

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

- **Owner writes.** Only the owning controller writes its own
  block. Every other controller reads.
- **No aggregate fields.** Cross-controller views are computed by
  scanning `shared.controllers` at read time.
- **No change notification.** Read fresh in a func, or the writer
  explicitly `_refreshAllLeds` on peers if a render needs the new
  value.
- **Blocks are removed on shutdown.** `shutdown()` deletes its
  own block.

**Both slots and channels are exposed.** `activeDeck: 'A'` is the
slot letter; `selectedDeckCurrent: 1` is the resolved channel.
Slot letters are per-controller (Cat's A might be ch1, Kitten's
A might be ch2), so cross-controller logic uses the channel. The
slot letter is useful for reacting to "Cat switched from A to B".

## 4.3 Reading another controller

```js
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

`readPath` resolves dot-paths through `myCatnip.shared.*` and any
object on it.

---

# Part 5 — Known limitations

Descriptor-side. Perception-specific limitations (curves-vs-samples
wire equality, runtime `PERCEPTION` swap, `custom` caching
coherence) are in `PERCEPTION.md` §10.

| # | Limitation |
|---|---|
| L2 | Per-binding `colorScheme.perception` override not supported. Per-scheme override (via `scheme.perception`) is the granularity. |
| L3 | Multi-HW pacing relies on per-pacer `throttleMs`, not global `TIMING`. |
| L5 | `mixxx`-typed stops are static-only — they can't be sampled in a scheme ramp. |

---

## Migration from v2.0.0

A v2.0.0 hardware descriptor will not run against a v2.1.x
framework. Migration points:

| v2.0.0 | v2.1.x |
|---|---|
| `hw.writeLED(ctrl, idx, r, g, b, hw)` | `hw.send(ctrl, idx, rgb, hw)` — `rgb` is `[r, g, b]` |
| `hw.calibrate` (never shipped) | `hw.PERCEPTION = { curves \| samples, mode }` |
| `hw.DEFAULTS.calibration: 'name'` | `hw.PERCEPTION.curves: 'name'` |
| `hw.DEFAULTS.calibrationMode: 'rms' \| 'off'` | `hw.PERCEPTION.mode.brightness: 'own' \| 'flat' \| 'off'` |
| `hw.DEFAULTS.wbGain` | `hw.PERCEPTION.wbGain` |
| `hw.DEFAULTS.channelPerceptual` | `hw.PERCEPTION.weights` |
| `hw.DEFAULTS.lumGamma` | `hw.PERCEPTION.gamma` |
| `hw.DEFAULTS.hkBoost` | `hw.PERCEPTION.hkBoost` |
| `resolveNamedColour(name)` (module-load override) | `hw.PALETTE[name]` — framework warn-once if single-arg used |
| `mapMixxxColor(rgb)` (module-load override) | `hw.MIXXX_COLORS[rgb]` — framework warn-once if single-arg used |
| `scheme.calibration: false` | `scheme.perception: false` (alias kept, warn-once) |
| `scheme.calibration: true` | `scheme.perception: null` (use HW default) or `{ mix: 'correct', brightness: 'own' }` |
| `_lastLoopTouchMs` (per-controller) | `shared.lastLoopTouchMs[ch]` (per-channel) |
| `TIME_SIG` (session-global) | `shared.timeSig[ch]` (per-channel); `setTimeSig(bb, pb)` still works globally |

**No automated migration.** Configs port manually. Warn-once on
each deprecated form. `myCatnip.TIME_SIG` and `myCatnip._warned`
are property accessors that proxy to `shared.*` — reading or
writing either works, but new code should use `shared` directly.