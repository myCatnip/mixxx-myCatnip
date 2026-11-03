# Customising

Change any of it. JavaScript assumed.

**Reload after every edit:** untick / re-tick the preset checkbox
in Preferences → Controllers. Nothing takes effect until you do.

Concepts (binding, patch, stack, token, scheme, timeline) live in
`CONCEPTS.md`. Four playback presets (Cat, Kitten, oneK3, oneK3
miniFX) share one layer tree — editing any `config/k3-cat-*.js`
file changes all four. colorLab is a separate tree — see `LAB.md`.

---

## What do you want to do?

| I want to… | See |
|---|---|
| Change an LED's colour | §1.1 |
| Change deck / FX theme colours | §1.2 |
| Rebind a control to a different CO | §1.3 |
| Change a control's LED on/off rule | §1.4 |
| Make an LED follow a knob | §1.5 |
| Add a beat pulse | §1.6 |
| Add a new scheme | §1.7 |
| Anchor the phrase at a hotcue | §1.8 |
| Change what an FX knob controls | §1.9 |
| Add a shift override | §1.10 |
| Add an overlay | §1.11 |
| Add a custom behaviour | §1.12 |
| Tune perception (curves, modes, brightness) | `PERCEPTION.md` |
| Change boot config | §2.6 |
| Change runtime tunables | §2.9 |
| Look up a func's arguments | §2.11 |

---

# 1. Recipes

## 1.1 Change a colour

Find the binding. Change `colorScheme.scheme`.

```js
grid3_1: {
    group: '$DECK_ACTIVE$', inKey: 'play', outKey: 'play_indicator',
    colorScheme: { scheme: 'green' }    // ← this
}
```

Colour spec accepts:

```js
'green'                 palette name
'green, 80'             name + on-brightness
'green, 80, 16'         + off-brightness
[127, 0, 0]             RGB 0..127
[127, 0, 0, 80]         + brightness
[127, 0, 0, 80, 16]     + off-brightness
'mixxx'                 reads the hotcue colour of the pad
                        (static LEDs only — see §1.5)
```

Brightness goes **after** the colour. `'red, 80'` ✔. `'80, red'` ✘.

For a whole ramp, edit `myCatnip.SCHEMES` in `config/k3-cat-schemes.js`.

## 1.2 Change a theme colour

Deck and FX number colours live in `config/k3-cat-schemes.js`:

```js
myCatnip.THEME = {
    deck: {
        1: 'green, 127',
        2: 'red, 93',
        3: [24, 24, 127, 127],
        4: [127, 127, 32, 110]
    },
    fx: {
        1: 'magenta, 115',
        2: 'yellow, 115',
        3: 'cyan, 110',
        4: 'orange, 127'
    }
};
```

Every shipped emitter reads THEME live. Mutating at runtime
propagates on the next repaint — no reload.

## 1.3 Rebind a control

Before — `press0` sets the active deck to slot A:

```js
press0: { func: F.setActiveDeckTo, args: ['A'],
          colorScheme: { scheme: 'green, 60, 0' } }
```

After — `press0` toggles keylock:

```js
press0: {
    group: '$DECK_ACTIVE$', inKey: 'keylock', outKey: 'keylock',
    colorScheme: { scheme: 'white, 64, 0' }
}
```

If the new binding belongs in a different patch, move it there.
Bindings are per-patch.

## 1.4 Change a control's LED on/off rule

The LED's on-state comes from one of three sources, checked in
order:

```
   1. colorScheme.on           declarative
   2. group + outKey           read a Mixxx CO
   3. neither                  LED stays off
```

`on:` overrides `outKey` when both are present.

```js
on: true
on: { state: 'modifiers.shift' }
on: { state: 'selectedDeckCurrent', equals: 1 }
on: { patchActive: 'selectAB' }
```

Full list of shapes and fields: §2.3.

**A func cannot influence its own LED's on/off state.** Store
the state on the controller and point `on:` at it:

```js
press0: {
    func: function() { this._ctrl._myFlag = !this._ctrl._myFlag; },
    colorScheme: { scheme: 'green, 60, 0', on: { state: '_myFlag' } }
}
```

See CONCEPTS §10 for other model limits.

## 1.5 Make an LED follow a knob (or just show state)

**Deviation** — add `knob: '<name>'`. The LED samples the ramp
at that knob's position. Until the referenced knob sends its
first MIDI event, the LED shows white (see `_renderDeviation`).

```js
button0_0: {
    group: '$DECK_ACTIVE$', inKey: 'pfl', outKey: 'pfl',
    colorScheme: { knob: 'knob0_0', scheme: 'myCatnip' }
}
```

The referenced binding **must be `type: 'knob'` or `'fader'`** —
only those carry `_normalized`. A button or encoder reference
fails at bind with a `csKnobType:` warn-once and the LED goes
dark, because there's no position to sample.

A `mixxx` colour spec can't be used in a deviation ramp — the
hotcue colour is resolved at render time, and the sampling
path has no rgb to sample. A `mixxx` stop in a sampled ramp
is skipped with a `sampleSegsMixxx` warn-once.

The knob and the button are separate bindings. `knob:` references
the knob by name.

The ramp can carry a marker band:

```js
myCatnip: {
    colors: [...],
    markerColor: [127, 0, 0, 100],
    markerWidth: 2,                  // band width in markerPosition units, 0..127
    markerPosition: 63.5             // 0 = left, 127 = right
}
```

**LED-only** — a binding with `group` + `outKey` (or just
`colorScheme`) drives the LED without an input action:

```js
// Always lit, deviation ramp on fader3
grid3_0: { colorScheme: {
               knob: 'fader3',
               scheme: B.composeScheme({ scheme: 'myCatnipEq', markerWidth: 0 }),
               on: true
           } },

// Tracks loop_enabled for on/off, still reads fader3 for colour
grid3_0: { group: '$DECK_ACTIVE$', outKey: 'loop_enabled',
           colorScheme: { knob: 'fader3', scheme: '...' } },
```

The second form opens a CO listener so the LED repaints when
`loop_enabled` changes. The first has no CO and repaints only
when the knob moves.

**Output-only hardware LEDs** work the same way — a binding with
no physical button on the descriptor side is just a `colorScheme`
with no `midi` field on the hardware. Useful for status LEDs
driven by cross-controller state (`shared.controllers[label]`).
See `HARDWARE.md` §2.2.

## 1.6 Add a beat pulse

A scheme can pulse on the playing deck's beat.

```js
myCatnip.SCHEMES.myAlert = {
    colors: [[127, 0, 0]],
    beat: {
        color: 'red, 60',
        barBeats: 4,
        phraseBars: 4,
        prePhraseBeats: 4,
        bar:       { color: 'green, 60' },
        phrase:    { color: 'white, 127' },
        prePhrase: { color: 'amber, 100' },
        half: false
    }
};
```

Cascade resolves most-specific-first: `prePhrase > phrase > bar >
beat`. Field list and matrix: §2.5.

## 1.7 Add a scheme

Register on `myCatnip.SCHEMES` in `config/k3-cat-schemes.js`:

```js
Object.assign(myCatnip.SCHEMES, {
    myRamp: {
        colors: [
            [0, 0, 127],     // stop 0 — blue
            [0, 127, 0]      // stop 1 — green
        ],
        brightness: 100
    }
});
```

Use by name:

```js
colorScheme: { scheme: 'myRamp' }
```

Minimal scheme: `{ colors: [[127, 0, 0]] }`. Full field list: §2.5.

A bare partial without `colors` is rejected with a console
warning. Derive from an existing scheme with
`B.composeScheme({ scheme: 'catFX', markerPosition: 127 })`.

**Naming trap:** don't name a scheme after a palette colour
(e.g. `red`). `colorScheme.scheme: 'red'` will use your scheme,
but `colors: ['red']` will always use the palette.

**Cycle trap:** `offScheme` and `coScheme` can name other
schemes, including the same scheme. A scheme that names itself
— directly or through a chain — would recurse infinitely without
protection. The runtime detects cycles and warns once
(`schemeCycle:<name>`); the referencing field renders as null.
Break the cycle by pointing at a different scheme or setting the
field to null.

## 1.8 Anchor the phrase at a hotcue

Set `PHRASE_MARKER_COLORS` in `config/k3-cat-schemes.js` to the
Mixxx hotcue colour hexes you want to treat as phrase markers:

```js
myCatnip.PHRASE_MARKER_COLORS = [0xC50A08, 0x0044FF];
```

Shipped default: `[0xF2F2FF]`. Empty list = feature off.

By default, only hotcues 9, 10, 11, and 12 are scanned — the top
row of the `hotcue2` chord overlay. Change the range with:

```js
myCatnip.PHRASE_HOTCUE_SLOTS = [9, 10, 11, 12];
```

Set *before* boot — the range is fixed for the session. Any
1..32 slots are accepted (Mixxx's real hotcue limit — the
pre-instantiated CO range includes intro/outro markers, so 32 is
the usable count). Duplicates and out-of-range entries are
dropped with a warn-once at boot. The hotcues stored in those
slots (colour, position) update live via observers — only the
slot *range* is fixed. Non-integer entries (e.g. `9.5`) are
dropped for the same reason as out-of-range ones: no CO exists
at that index, so nothing to read.

Put a hotcue at the phrase-start beat in one of those slots, set
its colour to red (`0xC50A08`). The origin derives on the next
playposition tick. Same hotcue doubles as a jump.

Before the first marker, origin derives from the *next* marker
ahead, so playing before beat 1 shows a negative count that
reaches zero at the marker. This is why the cascade cycles
backward through the phrase under a pre-start scrub rather
than freezing.

## 1.9 Change FX cell mapping

Three layout tables, one per mode, in `config/k3-cat-fx.js`.

```js
var FX_LAYOUTS = {
    1: fxLayoutTable(),
    2: fxLayoutTable({
        knob1_0:   { effect: 3, param: 1 },
        button1_1: { effect: 3, buttonParam: 1, marker: 'low' }
    }),
    3: fxLayoutTable({ ... }),
    4: fxLayoutTable({})
};
```

`fxLayoutTable(overrides)` returns the base table with only those
cells changed. Same pattern for `twoDeckFxTable()` and
`twoDeckMiniFxTable()`.

Cell fields:

| Field | Meaning |
|---|---|
| `effect` | 1..3 — which effect on the unit |
| `param` | 1..N or `'meta'` — which parameter |
| `buttonParam` | 1..N — which button_parameter |
| `enabled` | `true` → effect enable button |
| `unit` | `true` → a unit-level knob (`spec.param` is the CO key) |
| `fxRoute` | `true` → route the focused FX unit into the active deck |
| `displayOnly` | `true` → display-only cell. No input bind. LED samples a knob ramp. Tracks the adjacent knob by default. Pair with `on: true` / `on: false` for bright / dim echo. |
| `ledTracks` | *(displayOnly only)* Override the tracked knob. Literal cell name (`'knob1_0'`), or — in twoDeck — abstract slot (`'knob0'` / `'knob1'`) resolved through the column's slot map. |
| `marker` | `'low'` / `'mid'` / `'high'` or 0..127 |
| `schemePosition` | 0..127 `schemePosition` override |

**Which unit a cell controls.** The layout patch picks its target
through `_resolveFxPatchName`:

- **focus / mini**: `press1` / `press2` flip active FX slot
  (which pin is used). To change what a slot points at:
  `selectAB` overlay.
- **twoDeck**: both columns always use `selectedFxA` /
  `selectedFxB` (not the active slot). `press1` / `press2` flip
  `activeFx` but don't affect the columns. Reassign via
  `selectAB` overlay.

The runtime keeps `activePatches` in sync with the current FX
selection via `_syncFxLayout` — you don't rebind by hand.

## 1.10 Add a shift override

A shift companion is its own patch with `_shift` on the base:

```js
var CUE = { ..., _shift: 'cueShift' };

var CUE_SHIFT = {
    grid0_0: { ... },
    grid1_0: { ... }
};
```

Undeclared cells fall through to `CUE`. Bindings in `CUE_SHIFT`
apply only while shift is held.

**To make a binding apply only in one mode:** move it out of
`topShared` and into the base patch for that mode (`twoDeck`,
`twoDeckMini`). `twoDeckMini` inherits from `twoDeck`, so anything
in `twoDeck` reaches both twoDeck-family modes.

## 1.11 Add an overlay

An overlay is a patch with `_host`. It only applies while one of
its hosts is in `activePatches`.

```js
var MY_OVERLAY = {
    _host: ['topShared', 'twoDeck', 'twoDeckMini'],
    layer: { func: F.layerExitOverlay, args: ['myOverlay'] },
    grid0_0: { ... },
    grid0_1: { ... }
};
```

Toggle from a func:

```js
myCatnip.FUNCS.myToggle = function() {
    if (this._ctrl._patchActive('myOverlay')) {
        this._ctrl.removePatch('myOverlay');
    } else {
        this._ctrl.addPatch('myOverlay');
    }
};
```

Or use `toggleOverlay`, which takes an optional sibling list:

```js
press0: { func: F.toggleOverlay,
          args: ['fxRouting', ['selectAB']] }
```

The sibling list clears those patches before adding the target.

**An overlay can null a binding from the layer below with `{}`:**

```js
var MY_OVERLAY = {
    _host: 'topShared',
    grid1_1: { },   // kills whatever was here
    grid0_1: { func: F.myFunc }
};
```

When the overlay exits, the original comes back.

**The overlay must declare a `layer` binding** if you want the
layer button to exit it. Otherwise the host's `layer` wins.

`_noModifiers: true` on a patch disables the modifier system
while that patch is active and `_host`-satisfied — shift
companions, chord, and modifier `patchActivate` enforcement are
all suppressed. Use it when an overlay needs the whole surface
(a game, a modal editor). Only snake ships this today. See
INTERNALS §8.

## 1.12 Custom funcs

```js
myCatnip.FUNCS.myFunc = function(args, ch, c, v, s) {
    // this    = the Binding
    // args    = cfg.args array, passed unchanged
    // v       = MIDI value (0..127)
    // s       = MIDI status
    // this.group, this.inKey  = resolved CO
    // this._normalized        = 0..1 for knobs / faders
    // this._ctrl              = the controller
};
```

Bind it:

```js
press0: { func: myCatnip.FUNCS.myFunc, args: ['arg1'] }
```

**On a rebind-during-hold, a func's release fires against the
press-time config (captured fields), not the current binding.**
Read `this._transaction.orphaned` inside the func to branch when
the press was orphaned by a rebind. Funcs must not mutate
`this._transaction` — it's owned by the runtime. Session-scoped
fields (`this._normalized`, `this._ctrl`) are live. To read a
modifier state from a func: `this._ctrl.modifiers.<name>`. See
INTERNALS §8 for the full transaction model.

**If your func touches a loop** (moves a boundary, engages a
loop, changes loop size), call `this._ctrl._touchLoop(this.group)`
after the write. A subsequent beatjump gates against that event.

**If your func is a beatjump** (moves the playhead by a beat
multiple), call `this._ctrl._beatjumpAllowed(this.group)` first
and bail if it returns `false`.

## 1.13 Definition helpers

Config-side pattern. Build a small function that returns binding
objects, reuse it across a group of controls.

```js
function eqCell(deck, param, killParam, knobName, scheme) {
    return {
        knob: { group: '[EqualizerRack1_' + deck + '_Effect1]', inKey: param },
        button: {
            group: '[EqualizerRack1_' + deck + '_Effect1]',
            inKey: killParam, outKey: killParam,
            colorScheme: { knob: knobName, scheme: scheme }
        }
    };
}

var h = eqCell('$DECK_ACTIVE$', 'parameter3', 'button_parameter3',
               'knob0_0', 'myCatnip');
```

Shipped examples: `fxLayoutTable()` + `fxCells(n)`,
`twoDeckFxTable()` + `twoDeckFxColumn(side, n)`,
`twoDeckMiniFxTable()` + `twoDeckMiniFxCells(n)`.

Builders in `lib/funcs.js`: `eqKnob`, `fxKnob`, `fxEnabled`,
`fxButton`, `fxHeadphone`, `fxGroupEnable`, `fxMix`, `qfxKnob`,
`ledTrackButton`, `composeScheme`, `marker`. Call them as
`B.eqKnob(...)` where `B = myCatnip.builders`.

**`composeScheme`** derives a variant of a named scheme:

```js
B.composeScheme({ scheme: 'catFX', markerPosition: 127 })
B.composeScheme({ scheme: 'catFX', marker: 'high' })
B.composeScheme({ scheme: [127, 0, 0], markerWidth: 2 })
```

Overrides: `markerColor`, `markerPosition`, `markerWidth`,
`schemePosition`, `reverse`, `curve`, `brightness`, `beat`.
Resolves the base at config-eval time and returns a plain object.
Array colour specs (`[127, 0, 0]`) are supported — wrapped as a
single-stop scheme with `interp` / `perception` / `coScheme`
disabled, matching the behaviour of `colorScheme.scheme: [127,0,0]`
directly. Overrides apply on top of the same baseline.

---

# 2. Reference

## 2.1 Binding fields

| Field | Purpose |
|---|---|
| `group` | Mixxx group. Tokens resolve. |
| `inKey` | Input CO. |
| `outKey` | Output CO. Read for LED on/off, unless `colorScheme.on` overrides. |
| `type` | `'push'` for momentary. Omit for toggle. |
| `softTakeover` | `true` / `false`. Knobs and faders default true. |
| `func` | A function reference from `myCatnip.FUNCS`. |
| `args` | Array passed to the func. |
| `valueCurve` | Exponent on knobs / faders. `output = input^c`. |
| `colorScheme` | See §2.2. |
| `noLED` | `true` disables LED writes. |

`valueCurve` applies at write time, after scaling;
`_normalized` stays uncurved.

**Removed fields.** `k2: true` on a binding was a v2.0.x
per-binding K2 route. In v2.1.x K2 is transport-level only —
set `sysex: false` in `DEFAULTS` (or the boot config) to put the
whole controller on the K2 path. See §2.8.

## 2.2 colorScheme

```js
// Static — one colour, on/off
colorScheme: { scheme: 'green, 80, 0' }

// Deviation — LED tracks a knob
colorScheme: { knob: 'knob2_0', scheme: 'catFX' }

// Static + swap based on a controller field
colorScheme: {
    schemeFromState: { state: 'selectedFxCurrent', map: FX_COLOR_MAP }
}
```

| Field | Meaning |
|---|---|
| `knob` | Name of the pot this LED follows. Presence flips the LED to the deviation render path. |
| `scheme` | Name, inline object, or colour spec. Required unless `schemeFromState` is present. |
| `schemeFromState` | Per-render override. Accepts `state` (dot-path) or `co` (Mixxx control), plus `map` (keyed by value) or `list` (0-based index). |
| `on` | Where the LED's on/off state comes from. |

**`scheme` is required** unless `schemeFromState` supplies one.
A binding without either fails the colour-scheme setup and
darkens the LED with a console warning.

**`schemeFromState` with both `state` and `co`**: `state` wins,
`co` is ignored with a warning.

**Do not combine a scheme function with `schemeFromState`.**
`scheme: FX_COLOR_MAP[n]` is a function scheme — pairing it with
`schemeFromState` triggers a `csDoubleDynamic` warn-once and the
function is ignored.

**Do not use `chain_selector` as a `schemeFromState` source.**
It's a relative ±1 encoder control, not a readable index. Use
`loaded_chain_preset` (0-based).

## 2.3 `on:` shapes

| Shape | Meaning |
|---|---|
| `true` | LED always on. |
| `false` | LED always off (off-ramp). |
| `{ patchActive: 'name' }` | Overlay or patch is active. Accepts an array. |
| `{ state: 'dot.path' }` | Truthy controller field. |
| `{ state: 'path', equals: V }` | Strict equality. |
| `{ state: 'path', contains: V }` | Array / string membership. |
| `{ co: 'name', group: '...' }` | Mixxx CO. `group` defaults to the binding's own. |

Derived fields usable as `on.state`:

```
activeDeckVirtual         active deck showing the loop reading
activeLoopVirtual         loop clock running
activeDisplaySource       'track' | 'loop'
activeDeck                'A' | 'B'
activeFx                  'A' | 'B'
selectedDeckCurrent       1..4
selectedDeckAlt           1..4
selectedFxCurrent         1..4
selectedFxAlt             1..4
```

Without `equals` or `contains`, the LED is on when the resolved
value is truthy. A numeric `on.state` with no comparator warns
once per binding on first render (`_isOn`) — not at bind time,
so a binding whose LED never renders never warns.

**Modifier states are not in the derived fields list.** Read
them via `on: { state: 'modifiers.<name>' }` — the dotted path
resolves through `readPath`, so `modifiers.shift` returns the
boolean. This is the pattern for LED feedback on modifier-holds.
See §2.6.1 for declaring modifier states in boot config.

## 2.4 Tokens

Resolved at bind time in `group`, `inKey`, `outKey`,
`schemeFromState.group`, `schemeFromState.co`, `on.group`.

| Token | Reads |
|---|---|
| `$DECK_A$` | `selectedDeckA` → `[Channel<n>]` |
| `$DECK_B$` | `selectedDeckB` |
| `$DECK_A_N$` | `selectedDeckA` → bare number |
| `$DECK_B_N$` | `selectedDeckB` → bare number |
| `$DECK_ACTIVE$` | `selectedDeckCurrent` → `[Channel<n>]` |
| `$DECK_ACTIVE_N$` | `selectedDeckCurrent` → bare number |
| `$DECK_ALT$` | `selectedDeckAlt` → `[Channel<n>]` |
| `$DECK_ALT_N$` | `selectedDeckAlt` → bare number |
| `$FX_A$` | `selectedFxA` → `[EffectRack1_EffectUnit<n>]` |
| `$FX_B$` | `selectedFxB` |
| `$FX_A_N$` | `selectedFxA` → bare number |
| `$FX_B_N$` | `selectedFxB` → bare number |
| `$FX_ACTIVE$` | `selectedFxCurrent` → `[EffectRack1_EffectUnit<n>]` |
| `$FX_ACTIVE_N$` | `selectedFxCurrent` → bare number |
| `$FX_ALT$` | `selectedFxAlt` → `[EffectRack1_EffectUnit<n>]` |
| `$FX_ALT_N$` | `selectedFxAlt` → bare number |

`activeDeck` and `activeFx` start at `'A'`. Boot config accepts
`initialActiveDeck` and `initialActiveFx` (`'A'` or `'B'`).

## 2.5 Scheme fields

| Field | Default | Meaning |
|---|---|---|
| `colors` | — | Colour stops. Required. |
| `ratio` | `null` | Per-stop weight. Missing = 1. |
| `curve` | `0` | −0.95..0.95 warp on boundaries. |
| `schemePosition` | `63.5` | Slides the ramp, 0..127. |
| `interp` | `true` | `false` = snap, no blend. |
| `perception` | `null` | Per-scheme perception override (`PERCEPTION.md` §8). |
| `brightness` | `127` | Default hw for stops without one. |
| `brightnessScale` | `1` | Multiplier on flat-target. |
| `markerColor` | `null` | Marker band colour. |
| `markerPosition` | `63.5` | Marker centre, 0..127. |
| `markerWidth` | `0` | Band width in `markerPosition` units. `0` = no marker. |
| `offScheme` | `null` | Named off-ramp. `null` = generated at `DEFAULT_RGB_BRIGHTNESS_OFF`. |
| `coScheme` | `'coMatch'` | Steering ramp when knob and CO disagree. |
| `reverse` | `false` | Flip the ramp direction. |
| `beat` | `null` | Beat colour cascade. |

**`perception`** — `false` bypasses perception for this scheme.
An object overrides the hardware's modes per-key:

```js
perception: false                          // raw output, no correction
perception: { mix: 'off' }                 // skip mix only
perception: { brightness: 'flat' }         // force flat brightness only
```

Full resolution rules: `PERCEPTION.md` §8.

**`calibration`** (deprecated) — `false` is translated at compile
time to `perception: { brightness: 'off' }`. Kept for
compatibility with v2.0.0 filter schemes. New schemes should use
`perception:` directly.

**Curve** warps the boundaries between stops, not the colours
themselves. Applied before `schemePosition`.

| `curve` | Effect |
|---|---|
| `> 0` | Boundaries squish toward the midpoint |
| `< 0` | Boundaries expand away from the midpoint |
| `0` | No warp |

### `beat:` block

| Field | Default | Meaning |
|---|---|---|
| `color` | — | Base colour, every beat |
| `brightness` | scheme's | Base brightness |
| `bar` | — | Override on `count % barBeats === 0` |
| `phrase` | — | Override on phrase start |
| `prePhrase` | — | Override before phrase |
| `half` | `false` | Skip odd beats at the beat level |
| `barBeats` | `4` | Beats per bar |
| `phraseBars` | `4` | Bars per phrase |
| `prePhraseBeats` | `barBeats` | Beats before phrase to fire prePhrase |
| `deck` | `$DECK_ACTIVE$` | Which deck drives the pulse |
| `enabled` | `true` | `false` mutes the pulse |

Cascade resolves most-specific-first: `prePhrase > phrase > bar >
beat`. Matrix:

| LED state | Between beats | On the beat |
|---|---|---|
| on  | off-ramp (dim) | on-ramp + cascade (bright) |
| off | black | off-ramp (dim) |

## 2.6 Boot config

`config/k3-cat.js` defines `BOOT_DEFAULTS`. Presets override via
`myCatnip.bootCat(overrides)`.

| Field | Default | Meaning |
|---|---|---|
| `label` | `'Cat'` | Console name. |
| `midiChannel` | `0x0E` | 0x00..0x0F. |
| `initialDeckA/B`, `initialFxA/B` | 1 / 2 (range 1–4) | Starting selection per slot. |
| `initialActiveDeck` | `'A'` | Which of A/B boots as the active deck slot. |
| `initialActiveFx` | `'A'` | Which of A/B boots as the active FX slot. |
| `initialPatches` | `['topShared','fxLayout1','cue']` | Ordered active patches at boot. |
| `patches` | `myCatnip.CAT_LAYERS` | The patch tree. |
| `sysex` | `true` | RGB sysex vs K2 MIDI palette (transport-level). |
| `timeSig` | `null` | `{ barBeats, phraseBars }` override. |
| `modifierStates` | (see §2.6.1) | Named held-states derived from transaction activity. |

To boot twoDeck:

```js
initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']
```

To boot mini:

```js
initialPatches: ['twoDeckMini', 'fxMini1', 'cue']
```

### 2.6.1 `modifierStates`

```js
modifierStates: {
    <name>: {
        heldBy: [bindingName, ...],       // required
        recompute: true|false,             // optional
        patchActivate: 'patchName',        // optional
        onActivate: fn(ctrl),              // optional
        onDeactivate: fn(ctrl)             // optional
    }
}
```

A modifier is active while **every** binding in `heldBy` has an
active transaction (is physically held). State changes fire the
hooks and drive patch activation. `patchActivate` idempotently
enforces that the named patch is in `activePatches` on every
press and release — a config func that removes it out of band
gets corrected. `recompute` triggers a standalone recompute when
the state changes. See INTERNALS §8 for mechanics.

Cat's boot config declares `shift`, `chord`, and `loadArm`:

```js
modifierStates: {
    shift:   { heldBy: ['shift'], recompute: true },
    chord:   { heldBy: ['shift', 'layer'], patchActivate: 'chord' },
    loadArm: { heldBy: ['pressR'] }
}
```

- `shift` — active while the `shift` binding is held. `recompute`
  flips shift companions into the stack.
- `chord` — active while both `shift` and `layer` are held.
  `patchActivate: 'chord'` adds the chord patch while active,
  removes it on release. Order-independent: pressing layer-then-
  shift or shift-then-layer both activate chord.
- `loadArm` — active while `pressR` is held. Read by `k3Select`,
  `setActiveDeckTo`, and `slipOrLoad` to change their action to
  "load onto that channel" while held.

`heldBy` bindings must be `type: 'push'` somewhere in the
reachable stack — otherwise their transactions never activate and
the modifier stays false.

colorLab uses the same pattern:

```js
modifierStates: {
    shift: { heldBy: ['shift'], recompute: true },
    chord: { heldBy: ['shift', 'layer'], patchActivate: 'chord' }
}
```

## 2.7 Perception

The hardware's perception model — curves, modes, brightness
solve, Model A vs Model B — lives in `PERCEPTION.md`. This file
does not repeat it. Authoring a `PERCEPTION` block, tuning a
hardware's curves, or overriding a scheme's modes: see
`PERCEPTION.md` §2–§8.

The one config-side field you'll set on a scheme is
`perception: false | { mix?, brightness? }` — see §2.5 above.

v2.0.0's `HARDWARE_CALIB`, `wbGain`, `channelPerceptual`,
`hkBoost`, `lumGamma` boot-config fields are gone. They moved to
the hardware descriptor's `PERCEPTION` block.
`HARDWARE.md` §Migration has the full rename table.

## 2.8 K2-mode LEDs

K2 is a **transport-level** fallback on the K3: when the
descriptor boots with `sysex: false`, `hw.send` collapses each
frame to a MIDI note + velocity on the K2's discrete-colour
palette. All bindings on that controller go through the K2 path;
there is no per-binding opt-in.

```js
myCatnip.bootCat({ sysex: false });
```

Per-binding `k2: true` and boot-level `k2Indices` were removed in
v2.1.x. Neither has any effect on a v2.1.x controller. If you're
porting from v2.0.0, delete those fields.

**What K2 mode does to perception.** Mix correction is disabled
end-to-end (`ctrl._perceptionMixActive = false`) so prediction
and wire see the same pre-mix rgb. Brightness solve still runs
but its byte collapses to a coarse dim scalar — the perception
model's fine-grained solve is effectively discarded on the K2
wire. See `PERCEPTION.md` §6.1.

## 2.9 Runtime tunables

```js
// config/k3-cat-schemes.js
myCatnip.PHRASE_MARKER_COLORS = [0xF2F2FF];        // [] = feature off
myCatnip.PHRASE_HOTCUE_SLOTS = [9, 10, 11, 12];    // 1..32; see §1.8
myCatnip.THEME = { ... };                          // see §1.2
myCatnip.QFX_CHAIN_LIST = [...];                   // see k3-cat-schemes.js

// lib/core.js
myCatnip.BEATJUMP_GAP_MS = 130;
myCatnip.PULSE_CO_MS = 30;
myCatnip.BOOT_SETTLE_MS = 100;
myCatnip.BOOT_MAX_ATTEMPTS = 5;
myCatnip.BEAT_PLAYING_MODE = 'pulse';
myCatnip.BEAT_PAUSED_MODE  = 'solid';
myCatnip.CO_MATCH_EPSILON = 1 / 127;
myCatnip.TAKEOVER_EPSILON = 2 / 127;

myCatnip.setTimeSig(4, 4);              // all channels
myCatnip.setTimeSig(4, 4, 2);           // channel 2 only
myCatnip.clearTimeSig();                // all channels
```

**Time signature is per-channel** (`shared.timeSig[ch]`).
`setTimeSig(bb, pb)` writes all four; `setTimeSig(bb, pb, ch)`
writes one. Both the beat cascade and the layer/shift track-end
countdown read `shared.timeSig[ch]` — a non-4/4 signature applies
per channel, so two decks in different signatures won't drift out
of phase. Arguments are floored to integers; values below 1 or
non-finite are rejected. `myCatnip.TIME_SIG` still works as a
proxy — reads channel 1, writes all four — but new code should
use `shared.timeSig` directly.

**`QFX_CHAIN_LIST` order must match Preferences → Effects → Quick
Effect Chains.** Only the chains listed there light up correctly
on QFX buttons. If a QFX button always shows the first scheme,
check `loaded_chain_preset` — it defaults to 0 when Mixxx has no
chain loaded or the loaded chain isn't in the list.

**`BEATJUMP_GAP_MS`** — gates beatjumps on a channel in an active
loop when less than N ms has elapsed since the last loop-touching
event. The timestamp lives in `shared.lastLoopTouchMs[ch]`, shared
across controllers on the same channel. See INTERNALS §20.2 for
the gate logic and §19.2 for tuning.

**`BEAT_PLAYING_MODE` / `BEAT_PAUSED_MODE`** — what a beat
scheme's LED shows, per deck state. For paused display on a
custom beat LED, its `outKey` (or `on:`) must read 1 while paused
— `track_loaded` works; `play_indicator` doesn't. Behaviour
detail in CONCEPTS §7 / INTERNALS §10.

**`CO_MATCH_EPSILON` < `TAKEOVER_EPSILON`** must hold. `CO_MATCH`
is how far a deviation LED's knob can be from its bound CO before
the LED shows the co-match gradient. `TAKEOVER` is the rearm
tolerance. The relation guarantees LED "matched" implies control
live.

**`BOOT_SETTLE_MS` / `BOOT_MAX_ATTEMPTS`** — the boot settle loop
reschedules `_catchUpChannel` while boot-relevant CO fires are
still landing, capped at `BOOT_MAX_ATTEMPTS`. See INTERNALS §3
for mechanics and rationale.

## 2.10 Diagnostics

```js
myCatnip._debugPrintsOn = true;      // edit prints
myCatnip.MODE_PRINTS = true;         // colorLab mode prints
```

Warnings go through `myCatnip._warnOnce` and fire once per unique
key per boot. Reload to re-arm.

Runtime probes (safe to call any time):

```js
myCatnip.controllers[0].inspect()                  // top-level state
myCatnip.controllers[0].inspect('press0')          // one binding
myCatnip.controllers[0].inspect('patches')         // activePatches, stack
myCatnip.controllers[0].inspect('perception')      // PERCEPTION mode, curves, fingerprint
myCatnip.controllers[0].inspect('shared')          // shared state + all controller blocks
myCatnip.controllers[0].inspect('why', 'layer')    // pipeline walk
```

Full command list and symptom table: INTERNALS §16.

## 2.11 Funcs

Every func lives on `myCatnip.FUNCS`. Called by `Binding.input()`
when a binding declares `func:`. Args are passed unchanged as
`args[0..n]`.

Select / focus:

  k3Select        ['deck', 'A', 3]     pin channel 3 into slot A;
                                       with pressR held on deck, loads
                                       onto channel 3
  k3SelectActive  ['deck', 3]          (unused by shipped presets)
  setActiveFxTo   ['A']
  setActiveDeckTo ['A']                set active deck to A; with
                                       pressR held, loads onto slot
                                       A's pinned channel
  toggleActiveFx
  toggleActiveDeck

Timelines:

  cycleDisplaySource                   toggle track ↔ loop (no-op
                                       when the loop clock is stopped)

Patch / overlay / mode:

  layerButton        ['cue', 'loop']
      No release branch. Early-returns on modifiers.chord — chord
      takes over the layer press when active.
  toggleOverlay      ['name', ['sib']]
  toggleLayerOverlay ['cueName', 'loopName']
      Picks target by _patchActive('cue') / _patchActive('loop').
      Both overlays can sit in activePatches at once; _host gates
      visibility.
  layerExitOverlay   ['name']
      Release is a no-op. Chord exit is handled by the captured
      shift/layer release via the modifier system.
  toggleTopMode
  toggleMiniFx

Encoders:

  encPregainStep       [0.025]
  encQuickFxCycle
  encKeySyncReset
  encKeySync           — any-direction key sync (pulses sync_key)
  encKeyReset          — any-direction key reset (pulses reset_key)
  encKeyShift
  encLoopMove          ['in', 0.010]
      Loop resize. 'in' moves the IN point (OUT anchored);
      'out' moves the OUT point (IN anchored). Ungated.
      Stamps shared.lastLoopTouchMs[ch] after the write.
  encBeatjump
      Beatjump forward/back. Gated by _beatjumpAllowed when in
      loop. Uses _pulseCo.
  encBeatjumpStepScale ['1/32', 16]
  encStepParam         ['[Master]', 'gain', 0.01]
  encPlaylistNav
  encBpmOrHeadMix      [0.1, 0.05]
      BPM step, or headMix step while modifiers.bpmPressHeld
      is active. Sets _bpmHeldTurned when it takes the headMix
      branch, so bpmPress can suppress the shift+release
      headSplit toggle.

Buttons:

  pressSetValue        ['1/4']
      Writes an absolute value on press. Stamps
      shared.lastLoopTouchMs[ch] when inKey is `beatloop_size`.
      Does NOT stamp for `beatjump_size`.
  beatjumpButton       ['beatjump_1_backward']
      Gated by _beatjumpAllowed. Uses _pulseCo.
  reloopToggleResetAnchor
      Resets loop_anchor then pulses reloop_toggle. Stamps
      shared.lastLoopTouchMs[ch].
  beatloopActivateResetAnchor
      Resets loop_anchor then pulses beatloop_activate. Stamps
      shared.lastLoopTouchMs[ch].
  shutdownHold
  bpmPress             pressL release handler for the
                       pressL+encoderL pair. Toggles [Master]
                       headSplit on release when shift is held
                       and the encoder was not turned.
                       Suppressed when the transaction is
                       orphaned.
  hotcueSetPhraseColor ['N']
      Activates hotcue N; if unset, also writes
      PHRASE_MARKER_COLORS[0] as its colour. Release writes 0.
```

---

# 3. Behaviour-driven symptoms

Full symptom table is in INTERNALS §16. Behaviour-level ones
that aren't bugs:

| Symptom | Cause |
|---|---|
| LED shows white until you turn the knob | Deviation LED's referenced knob hasn't sent its first event yet — `_normalized` is undefined. Turn it once. |
| `mixxx` LED is dark in a ramp | `mixxx` is static-only. See §1.5. |
| Beat LED doesn't pulse | Either the deck is paused (`BEAT_PAUSED_MODE` picks the behaviour) or the scheme has no `beat:` block. |
| `scheme: FX_COLOR_MAP[n]` + `schemeFromState` → LED shows nothing | Function scheme + schemeFromState triggers `csDoubleDynamic`. Use one or the other, not both. |
| Phrase colour doesn't change across a loop | The loop clock isn't running (deck paused, or loop not active), so display source is `track`. |
| Beatjump exits the loop | `BEATJUMP_GAP_MS` too low. See §2.9. |

Full behaviour-driven symptoms: INTERNALS §16.