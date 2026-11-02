# Concepts

Read this before editing anything. Every other doc assumes you've
read it.

The K3 has more controls than most people need at once, so the
surface reconfigures itself based on context — deck focus, FX
focus, bottom layer, shift, chord.

Three primitives: **bindings**, **patches**, the **stack**.
Everything else — tokens, schemes, timelines, modes — builds on
them.

Terms are defined on first use. `GLOSSARY.md` has the one-liners.

---

## 1. A binding

A **binding** describes one physical control — one knob, button,
fader, or encoder.

```js
button0_0: {
    group: '$DECK_ACTIVE$',       // Mixxx group
    inKey: 'pfl',                 // input control
    outKey: 'pfl',                // LED on/off source
    colorScheme: {                // LED appearance
        knob: 'knob0_0',
        scheme: 'myCatnip'
    }
}
```

| Field | Purpose |
|---|---|
| `group` + `inKey` | What Mixxx control it writes to |
| `outKey` | What Mixxx control its LED reads for on/off |
| `colorScheme` | What the LED looks like |
| `func` + `args` | Optional custom behaviour, replacing the default write |

Any can be omitted. `group` + `inKey` alone is a plain control.
`colorScheme` alone is an LED-only indicator. `func` alone is a
script action.

---

## 2. A patch

A **patch** is a named bag of bindings.

```js
var CUE = {
    layer: { ... },
    grid0_0: { ... },
    // ...
};
```

Patches inherit:

```js
var fxLayout2 = {
    patch: ['topShared'],
    knob1_0: { ... }
};
```

**Sibling patches do not inherit.** CUE and LOOP are siblings — a
cell defined in CUE is not visible when only LOOP is active. If a
cell must work in both, both must declare it.

---

## 3. The stack

The controller holds an ordered list of patch names, called
`activePatches`. The runtime flattens that list into one binding
map — later patches override earlier ones, cell by cell.

```
   activePatches:  [topShared] [fxLayout1] [cue]
                         │          │          │
                         └──────────┴──────────┘
                                    │
                       shift companions appended (if shift held)
                                    │
                            chord appended (last)
                                    │
                                    ▼
                            merged binding map
                                    │
                                    ▼
                       every binding rebound + LED repainted
```

Modes, overlays, shift behaviour — all just different
combinations of patches.

The stack is rebuilt on config changes (patches added / removed,
shift pressed / released, focus moved). Not on physical input.

**Chord sits on top of everything, including shift.**

---

## 4. Shift and overlay patches

**Shift companions.** A patch can declare a companion that
applies while shift is held:

```js
CUE._shift = 'cueShift';
var CUE_SHIFT = { grid0_0: { ... } };
```

Undeclared cells fall through to CUE. Companions inherit up the
parent chain — the shift override of a patch: parent lands
before the child's own.

The shift companion applies while `modifiers.shift` is true — a
modifier state derived from the shift binding's transaction. See
INTERNALS §2.5 for held-state tracking.

**Overlays.** A patch can declare `_host`. It only applies while
one of its hosts is active:

```js
var SELECT_AB = {
    _host: ['twoDeck', 'twoDeckMini', 'topShared'],
    layer: { func: F.layerExitOverlay, args: ['selectAB'] },
    grid0_0: { ... }
};
```

An overlay can null a cell from the layer below with `{}`.

---

## 4.5 Held state

A physical button press is a **transaction**: the binding's
action is captured at press and fired at release. A rebind
between press and release does not fire the release early — that
is what makes rebinds, patch changes, and layer shifts safe to
perform while a button is down. The captured release dispatches
against the press-time config, not the current one.

**Modifier states** are named held-states (`shift`, `chord`,
`loadArm`) declared in config. A modifier is active while every
binding in its `heldBy` list has an active transaction.
Bindings, patches, and funcs read a modifier via
`ctrl.modifiers.<name>` or, in a colour scheme,
`on: { state: 'modifiers.<name>' }`. Modifiers drive patch
activation (the chord patch appears while shift + layer are
both held), stack composition (shift companions), and custom
func branching (load-arm behaviour).

---

## 5. Tokens

A binding that follows the current focus writes a **token** in
its group:

```js
group: '$DECK_ACTIVE$'
```

Tokens resolve at bind time. When focus changes, every binding
using the token is re-applied automatically.

`$DECK_A$` / `$DECK_B$` / `$DECK_ACTIVE$` / `$DECK_ALT$` and the
FX equivalents. Full list: CUSTOMISE §2.4.

---

## 6. Focus and modes

Two axes: deck focus (A/B) and FX focus (A/B). Each slot holds a
channel or unit assignment; focus picks which slot is live.

**Top-half modes** are three complete layouts for the top half:

| Mode | Base patch | Layouts |
|---|---|---|
| focus | `topShared` | `fxLayout1..4` |
| twoDeck | `twoDeck` | `fxLayoutA<n>`, `fxLayoutB<n>` |
| twoDeckMini | `twoDeckMini` | `fxMini1..4` |

Mode is inferred from `activePatches`. Only the top half swaps —
bottom half, chord, overlays are identical in all three.

---

## 7. Colour schemes

An LED's appearance comes from a **scheme** — a named ramp or
single colour.

Two render paths:

- **Static** — no `knob:` reference. On/off. Picks `ramp[0]`.
- **Deviation** — has `knob: '<name>'`. Samples the ramp at that
  knob's position.

A ramp fed to a static LED shows `ramp[0]`.

A ramp can carry a marker band (colour shown when the knob is
within a range) or a beat cascade (per-beat colour overrides —
`prePhrase > phrase > bar > beat`). Co-match shows a steering
gradient when the physical knob disagrees with its bound CO.

The `on:` block decides when the LED is logically on, independent
of the scheme itself.

Details: CUSTOMISE §1.1–1.6, §2.2–2.3, §2.5.

---

## 8. Timelines

Every channel tracks two timelines. They describe *where the
phrase colouring reads from*; they don't move the playhead.

```
   TRACK              playposition. Beat 0 = file start.
                      Origin sets where "count 1" sits. Default.

   LOOP CLOCK         engages on loop-on, seeded from
                      playposition. Accumulates musical
                      progress through wraps. Runs only
                      while the deck plays — pause = exit,
                      resume = entry.
```

`displaySource` (`'track'` or `'loop'`) picks which feeds the
count. Loop while the loop clock is running, track otherwise.
Manual cycle via LOOP `grid2_0`; sticks until the next loop
start/stop or play/pause transition.

Both timelines rate-scale, which is what keeps two synced decks
in phase when one of them loops.

**The pulse is not the count.** Bright/dim phase always comes
from track position's fractional beat, in both modes.

**Origin** is the beat where "count 1" sits. Position-derived
from marker hotcues (colour in `PHRASE_MARKER_COLORS`): the last
marker at or before the playhead, or — before the first marker —
the next marker ahead (pre-phrase playback shows a negative
count). No manual setter — move the playhead, or place a marker.

**Beatjump gate.** A beatjump is blocked when its target channel
has an active loop and less than `BEATJUMP_GAP_MS` (130 ms) has
elapsed since the last loop-touching event on that channel.
Outside a loop every beatjump fires.

Details: INTERNALS §6 (mechanics), §21 (beatjump gate).

---

## 9. colorLab

Separate preset, same runtime, own layer tree. LED ramp editor.
Load it, build a ramp, dump it, paste into
`xone-k3-cat-schemes.js`, switch back to Cat.

Full guide: `LAB.md`.

---

## 10. What the model can't do

Design boundaries. Each was a "can I..." that couldn't be served
within the framework.

- **Timed sequences / animation along the strip.** Bindings render
  from current state only.
- **LEDs that read other LEDs.** Each binding renders in isolation.
- **Fades.** Beat pulses are on/off; nothing interpolates over time.
- **Fixed-rate blinks.** Only beat-synced pulses.
- **Per-binding beat timing.** Beat timing is per-scheme.
- **Custom off-ramp for the beat pulse.** Off phase uses the
  scheme's off-ramp.
- **Beat accents on co-match.** Marker bands cascade; co-match
  doesn't.
- **A func driving its own LED on/off.** Store the state on the
  controller and read it via `on:`.
- **Debounce.** Wrap the func with your own state.
- **`mixxx` in a sampled ramp.** `mixxx` reads the pad's
  hotcue colour at render time — only the static path has that
  access. In a ramp (deviation LED, multi-stop scheme,
  calibration solve), the stop is skipped with a warning.

---

## Where to go next

- **README.md** — physical layout, per-mode behaviour, FX cell tables
- **CUSTOMISE.md** — how to change anything (recipes + reference)
- **INTERNALS.md** — engine internals and debugging
- **PERFORMANCE.md** — what's cheap/expensive, what to tune
- **GLOSSARY.md** — one-line definitions