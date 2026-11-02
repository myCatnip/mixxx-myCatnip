# colorLab

Build LED colour ramps on the hardware. Dump them as JavaScript.

colorLab doesn't play music. It's a scheme editor. Load it, build
a ramp, dump it, paste into `xone-k3-cat-schemes.js`, switch back
to Cat.

## Quickstart

1. Load the colorLab preset in Preferences → Controllers.
2. Edit mode is where you start. Turn the preview knob
   (`knob0_0`). If the preview LED (button under it) shows white,
   the knob hasn't reported yet — keep turning.
3. Press a segment button to select it. Turn the RGB encoders
   (`encoder0..2`) or the brightness encoder (`encoder3`) to set
   its colour.
4. Press another segment. Repeat.
5. Shift + `press0` to dump. The scheme prints to the console.
6. Paste into `xone-k3-cat-schemes.js` (format and paste location
   in §Dump), reload Cat.

**Preview doesn't touch the edit buffer.** Shift + `pressR`
loads the preview into edit. `layer` returns to edit unchanged.

## The model

```
       edit                   slots[0..15]           SCHEMES
   working buffer           saved schemes          named schemes
   { colors: [...] }        { colors: [...] }      { ... }
        │                         │                      │
        └─────────┬───────────────┴──────────────────────┘
                  │
            previewSource
        'edit' | 0..15 | registry name
                  │
                  ▼
             previewing
        (bool — strip shows previewSource
         instead of edit buffer)
                  │
                  ▼
        What the LED strip paints
```

- **edit** — the working buffer. Starts as one black stop.
- **slot 0** — pre-populated at boot with `labDefault`, a single
  black stop. Its LED is green because of its index, not its
  contents.
- **slots[0..15]** — saved schemes. 0/1/2/3 are on/off/co/co-off.
  4..11 user saves. 12..15 auto-bake outputs.
- **previewSource** — `'edit'`, a slot index, or a registry
  scheme name.
- **previewing** — true when the strip is showing a previewed
  scheme.

## Modes

The layer button swaps between two modes.

```
                ┌─── colorLab (EDIT) ───┐
                │                        │
   layer button │   previewSource        │  layer button
      ──────────►   'edit' | 0..15 |     ◄──────────
                │   registry name        │
                │                        │
                │   previewing  bool     │
                │   saveArmed   bool     │
                └─────────┬──────────────┘
                          │
                          │ layer button
                          ▼
                ┌─── slots (SLOTS) ─────┐
                │                        │
                │   grid = 16 slot cells │
                │   preview LED tracks   │
                │   previewSource        │
                └─────────┬──────────────┘
                          │
                          │ pressL
                          ▼
                    back to EDIT
```

### EDIT

The bottom half edits the edit buffer. Segment selection, RGB
knobs, faders, marker, ratio, beat.

### SLOTS

The bottom grid becomes 16 slot cells. The top strip keeps
showing the preview scheme; only the bottom cells swap.

```
grid0_0..grid0_3   slots 0,1,2,3       (on / off / co / co-off)
grid1_0..grid1_3   slots 4,5,6,7       (saves)
grid2_0..grid2_3   slots 8,9,10,11     (saves)
grid3_0..grid3_3   slots 12,13,14,15   (auto-bake outputs)
```

Cell colours:

```
0        green      (on)
1        red        (off)
2        white      (co)
3        soft blue  (co-off)
4..11    yellow     (saves)
12       blue       (structural bake)
13       cyan       (baked + interp)
14       magenta    (baked, snapped)
15       orange     (export)

previewed   bright
populated   dim
empty       dark
```

Rebinding `labSlotPress, [5]` to a different cell moves slot 5's
LED there.

### Slots-mode buttons

| | |
|---|---|
| Grid press | Preview that slot. Grid stays visible. |
| `pressR` | Toggle arm. |
| Grid press, armed | Save preview into that slot, load into edit, exit to edit. |
| `pressL` | Exit to edit. Edit unchanged. |
| Shift + `pressR` | Load preview into edit, exit to edit. |
| Shift + `encoderL` | Scroll registry schemes. |
| `layer` | Exit to edit. |

If the preview cannot resolve — bad registry name, unpopulated
slot, anything that makes `_previewScheme()` return null — the
arm is cleared and the press falls through to a normal preview.
The slot is not written.

Overwriting a populated slot dumps the old contents to the
console as a backup. Saving over the current preview skips the
backup.

After a successful save you're in edit mode with the saved
content loaded.

## Preview sources

- **edit** — the working buffer. Only source that permits edits.
- **a slot index** — set by pressing a slot cell.
- **a registry scheme name** — set by scrolling with
  shift + `encoderL`.

Auto-bake runs when the preview lands on `'edit'` or slots 0..11.
Skipped for slots 12..15 (bake outputs) and for registry schemes.

## Editing

**Edits only take effect in edit mode.** With a preview showing,
the first edit attempt is a no-op and prints a warn-once:

```
[k3] preview is preview-only — shift+pressR loads the preview
     into edit before edits take effect
```

### Selecting a stop

Each segment LED is a stop. Press it to select.

Pressing a cell beyond the current array **extends** the array
to that index. New cells are black **gaps** — they exist in the
array but aren't marked as real stops. The cell you pressed
*is* marked real, even if you leave it black.

**Shift + press** deletes the cell:

- **Real stop** → cascade. The stop and every gap cell between
  its real neighbours are removed, so the neighbours become
  adjacent.
- **Gap** → splice just that cell. Subsequent cells shift down.

Cell 0 can't be deleted. Selection jumps to cell 0 after any
delete.

### Real stops vs gaps

Every cell is either a **real stop** (you pressed it, or it's
non-black) or a **gap** (extension cell you haven't pressed).

- Fill anchors on real stops. Gaps are what fill paints.
- Editing a gap with non-black makes it real automatically.
- Saving to a slot, baking, or loading a scheme collapses all
  gaps into real stops. Gap state exists only during the current
  edit session.

### Black is a colour

Black `(0, 0, 0)` is a first-class stop. A cell can be
black-and-real (an intentional black you pressed) or
black-and-gap (an extension cell).

**Hold shift** and every real black stop lights white at
brightness 50 — findable for shift+press deletion. Gaps stay
black, so the highlighted cells are exactly what you can delete.

The highlight is edit-mode only. Previewing a scheme that has
black stops won't light them white even with shift held — it's
an editing aid, not a scheme property.

### Changing a stop

With a stop selected:

- **Stepped edit** — RGB encoders and brightness encoder
  increment by ±1.
- **Absolute edit** — faders set R, G, B, brightness directly.

If the marker is selected, the same controls edit the marker
colour and brightness.

### Preview

A preview LED samples the ramp at a sweep position you control
with a knob.

The button under the preview LED toggles between on-ramp and
off-ramp sampling.

If the preview knob is bound to a CO, co-match kicks in when the
knob and the CO disagree — the LED shows the matching gradient
instead. Turn until they match.

If the current scheme has a beat config, the preview LED pulses
on every beat.

### Interp, calibration, ratio

Three state toggles. Their LEDs show on/off.

- **Interp** — `true`: blend between stops. `false`: snap.
- **Calibration** — `true`: apply the flat-target solve. `false`:
  raw values to the wire.
- **Ratio** — turn on for per-stop weights. Requires the scheme
  to have at most 9 stops — with more, ratio edits are blocked
  and any existing ratio table is wiped.

### Marker

Press the marker LED to select the marker. Same edit controls.

- **Marker position** — 0..127. 63.5 = centre.
- **Marker width** — 0 = off. Wider = bigger trigger band.
- **Marker colour** — same RGB controls.

Shift + press the marker LED clears the marker.

The marker takes an off-brightness as its last colour field:
`'red, 80, 16'` is `red@80` on, `red@16` off.

When the deviation LED's knob sits inside the marker band, the
marker colour wins over the ramp sample. The lab preview LED
shows it raw — no beat cascade applied; the runtime LEDs cascade
it like a static LED.

### Fill gaps

Linearly interpolates every gap between two real stops. Real
stops are anchors and are never overwritten, so use them to pin
the endpoints of a blend.

To make a black stop an anchor, press it first — that marks it
real.

Filled cells become real stops (so a second fill doesn't
re-paint them). To re-fill a range, delete the cells first or
black them and set them again.

## Beat edit overlay

Press **grid2_3** in edit mode to toggle. The button's LED shows
the state: dim white when out, cyan when in.

The overlay repurposes the grid and L/R encoders to edit a
scheme's `beat` config.

Open with no preview showing — the beat config you'd edit lives
in a scheme that isn't loaded while previewing. Press
shift + `pressR` first to load the preview into the edit buffer.

```
grid0_0   beat colour target
grid1_0   bar colour target
grid2_0   prePhrase colour target
grid3_0   phrase colour target

grid0_1   on/off toggle      green = on, red = off
```

Rebinding the target cells moves the LEDs with them.

### Editing a colour target

Press a target to select it. The four targets work like stops:

- **Stepped edit** — top RGB encoders and brightness encoder
  increment by ±1.
- **Absolute edit** — faders set R, G, B, brightness directly.

Targets show dim when unset and the colour you set otherwise.
Selection is not indicated on the grid — the preview LED is the
reference for what you're editing.

**Shift + press** a target to clear it.

### On/off toggle

`grid0_1` toggles the whole beat config. Off means the beat is
saved but not applied. On first entry with no `beat` config, the
overlay creates `{ enabled: true }` and the button starts green.

The rest of the grid is nulled while the overlay is active.

### Preview LED in beat edit

Once the preview's deck has fired at least one beat, the preview
LED pulses through the cascade.

Before the first beat, beat-edit mode with a target selected
shows the target's colour solid — eyeball what you just set
without waiting for a beat.

The segment strip behind the grid does not pulse in beat edit;
the preview LED is the pulse reference.

### Encoders

| | |
|---|---|
| `encoderL` | `barBeats` — beats per bar |
| `encoderR` | `phraseBars` — bars per phrase |
| Shift + `encoderR` | `prePhraseBeats` — beats before phrase |

`barBeats` and `phraseBars` clamp to 1..32. `prePhraseBeats`
clamps to `[0, barBeats * phraseBars - 1]` and defaults to one
bar.

### Dump behaviour

The beat config is emitted only when `enabled !== false`.
Toggling off and dumping discards it.

## Slots and bakes

Four of the sixteen slots are automatic bakes of the current
preview. They rewrite whenever the preview changes; you never
save to them by hand.

| Slot | Contents | Rewrites on |
|---|---|---|
| 12 structural | Source stops, everything live. | preview change |
| 13 baked+interp | Source stops, calibration bisected into brightness, interp forced `true`. | preview change |
| 14 baked | Same as 13, interp forced `false`. | preview change |
| 15 export | Same as 13, white balance baked into rgb, interp from source. | preview change |

All four preserve the source stop count. Each is a *static
image* of the ramp at bake time; reloading applies the same
render stages the source did, except where the stage has been
frozen into the stops.

### Where each render stage runs

| Stage | 12 structural | 13 baked+interp | 14 baked | 15 export |
|---|---|---|---|---|
| Stops count | source | source | source | source |
| Stop rgb | source | source | source | **wb applied** |
| Stop brightness | source | **bisected** | **bisected** | **bisected** |
| `curve` warp | live on reload | live on reload | live on reload | live on reload |
| `schemePosition` | live on reload | live on reload | live on reload | live on reload |
| `interp` | live, from source | live, forced `true` | live, forced `false` | live, from source |
| Calibration (flat-target bisect) | live on reload | baked | baked | baked |
| `brightnessScale` | live on reload | baked into bisect | baked into bisect | baked into bisect |
| White balance | live at send | live at send | live at send | baked into rgb |

- **live on reload** — value is still a field on the emitted
  scheme; the runtime applies that stage again.
- **baked** — value was applied at bake time; the corresponding
  field is absent (or forced off) on the emitted scheme.
- **live, forced X** — field is on the emitted scheme, set to X.

### What each bake keeps

Fields are either **kept** (still in the emitted scheme, still
runtime-controlled), **baked** (already in the stops, no longer a
field), or **dropped** (not needed on reload).

| Field | Lab control | structural | baked+interp | baked | export |
|---|---|---|---|---|---|
| stops | segment cells | source | source | source | source |
| `ratio` | press2 + knobs | live | live | live | live |
| `curve` | shift+enc0 | live | live | live | live |
| `schemePosition` | knob2_0 | live | live | live | live |
| stop brightness | enc3 / shift+enc1 | source | solved | solved | solved |
| `brightnessScale` | shift+enc2 | live | baked | baked | baked |
| `calibration` | press1 | live | forced off | forced off | forced off |
| `interp` | press3 | live (source) | forced `true` | forced `false` | live (source) |
| white balance | boot config | live | live | live | baked into rgb |
| marker | grid3_3 + knob1_0 + encL | live | live | live | live |
| `offScheme`, `coScheme` | — | live | live | live | live |
| `beat` | grid2_3 | live | live | live | live |

**live** = still a field on the scheme, applied at reload.
**baked** = value frozen into stop data, field absent or forced.
**solved** = brightness replaced by the calibration bisect.

**Baked** means the value is worked into the stop positions or
brightness — on reload nothing re-applies it. **Kept** means it
stays as a field and the runtime re-applies it live.

### Preview vs hardware

Structural keeps calibration live: preview and hardware both
re-solve brightness at render. They match only if the calibration
tuning hasn't changed between preview and reload.

Baked+interp / baked freeze the calibration solve into stop
brightness. Reload sends those exact brightness values with
`calibration: false`. Preview matches hardware exactly,
regardless of tuning.

Export additionally freezes white balance into rgb. Preview
matches hardware for any tuning and any wb setting — but
reloading in this runtime double-applies wb (the baked rgb is
already wb-scaled). Export is for external raw-sysex use only.

### Field notes

- `curve` — warps stop boundaries. Default 0 (none). Positive
  squishes toward the middle; negative pushes toward the edges.
- `schemePosition` — slides the whole ramp. Default 63.5 (centre).
- `brightness` — default stop brightness when a stop has none.
  Default 127.
- `brightnessScale` — multiplier on the calibration target.
  Rarely needed.
- `interp` — true blends between stops, false snaps. Baked+interp
  and baked override this field.
- `ratio` — per-stop weight. Editing turns it on; off resets to
  equal weights.

## Matching uncalibrated schemes

`calibration: true` solves each stop's brightness so every colour
hits the same perceived level. It can't solve black — black has
no emission to normalize against. So a calibrated scheme can't
fade to true black.

To get several different colours that match at every step **and**
fade to black:

1. Build the ramp with calibration on. Use the wire slot (15) as
   your reference.
2. The wire stops are already-solved RGB + brightness values.
3. Copy them into a **new uncalibrated** scheme
   (`calibration: false`, press1 off).
4. End with `[0, 0, 0]` at fixed brightness.

The colours match because the stops came out of the same solve.
The fade works because with calibration off the runtime isn't
fighting the darkening.

For a shared off-state, use each stop's brightness as
`brightnessOff` on the new scheme. All schemes dim to the same
perceived level when their `on:` reads 0.

## Dump

Shift + `press0` prints the preview as JavaScript.

- **Edit preview** → `XoneK3.SCHEMES.NAME = { ... };`
- **Registry preview** → same
- **Slot preview** → `XoneK3.SCHEMES.slotN = { ... };`. Slot 0
  includes the off/co/co-off chain from slots 1/2/3.

Rename `NAME` or `slotN` to whatever you want. Paste **after**
the existing `Object.assign(XoneK3.SCHEMES, {...})` block in
`xone-k3-cat-schemes.js` — the dump is a statement, not a
property.

If you'd rather paste inside the `Object.assign` block, strip
the leading `XoneK3.SCHEMES.` and the trailing `;` so it becomes
`NAME: {...},`.

### Format

Multi-line, trailing commas (valid JS, matches the codebase
style). Nested blocks (`offScheme`, `coScheme`, `beat`) inline
where compact. Only non-default fields appear — a scheme with
just `colors` is three lines.

Example:

```js
XoneK3.SCHEMES.myNew = {
    colors: [
        [127, 0, 0],
        [0, 127, 0],
        [0, 0, 127]
    ],
    markerColor: [127, 0, 0, 93],
    markerWidth: 2,
};
```

`coScheme: null` (disables co-match) is dropped by the emitter.
Reload falls back to the runtime default `'coMatch'`. If you
want to permanently disable co-match for a scheme, edit
`cat-schemes.js` by hand after paste.

### Slot chain for slot 0

Slots 0–3 form one conceptual scheme:

| Slot | Role |
|---|---|
| 0 | on |
| 1 | off — slot 0's `offScheme` |
| 2 | co — slot 0's `coScheme` |
| 3 | co-off — slot 2's `offScheme` |

Missing slots fall back to engine defaults (generated off from
the on-ramp; engine `coMatch` for the co ramp).

Dumping slot 0 emits the whole chain as **one** scheme object
with nested inline `offScheme` / `coScheme` objects:

```js
XoneK3.SCHEMES.NAME = {
    colors: [
        [127, 0, 0]
    ],
    offScheme: {
        colors: [
            [10, 10, 10]
        ],
    },
    coScheme: {
        colors: [
            [40, 40, 40]
        ],
        offScheme: {
            colors: [
                [5, 5, 5]
            ],
        },
    },
};
```

Each nested block only appears if the corresponding slot is
filled. Paste the whole object as one `XoneK3.SCHEMES.NAME = {…}`
statement.

### What gets emitted

Non-default fields only. Fields at their default don't appear.

The beat block is expanded across multiple lines with one field
per line, sub-objects inline:

```js
beat: {
    color: [89, 68, 125],
    brightness: 4,
    bar: { color: [0, 69, 0], brightness: 127 },
    prePhrase: { color: [0, 127, 127], brightness: 127 },
    phrase: { color: [127, 0, 127], brightness: 127 }
},
```

## Registry scroll

Shift + `encoderL`. Works from any mode. Loads each named scheme
in `XoneK3.SCHEMES` into the preview, one per step. Skips
registrations that don't carry `colors`.

Scrolling doesn't change modes — the strip (edit mode) or grid
(slots mode) stays visible, and the preview LED tracks the
scrolled scheme.

If `XoneK3.SCHEME_REGISTRY` is defined (`xone-k3-lab.js`), scroll
iterates that list instead of scanning `SCHEMES`. Use it to order
what shows up and hide test schemes.

## Edit an existing scheme

1. Shift + `encoderL` to scroll to it.
2. Shift + `pressR` to load into edit — before this, edits are
   no-ops (see intro).
3. Edit.
4. Shift + `press0` to dump, paste over the old scheme.

## Shutdown

On preset unload, the lab dumps every populated slot to the
console. Silence with `XoneK3.LAB_DUMP_ON_SHUTDOWN = false`.

Chord shutdown: shift + layer held, `press3` held 2 s. Releasing
shift, layer, or `press3` cancels the timer. Works from EDIT and
SLOTS. Chord is a modifier state (see INTERNALS §2.5); releasing
shift or layer clears it immediately.

## Debug output

Prints go through `debugPrint` when `XoneK3._debugPrintsOn = true`.
Mode events print when `XoneK3.MODE_PRINTS = true`.

Examples:

```
[k3] seg 3 r = 80
[k3] saved edit -> slot 3
[k3] preview = slot5
```

Warnings fire once per boot via `_warnOnce`. The preview-only
key is `labEditWhilePreviewing`. Reload the preset to re-arm.

## Not in the lab

- No undo. Dump before unloading.
- No persistence across presets.
- Ratio editing is blocked when the scheme has more than 9 stops
  (existing ratio is wiped).
- Beat config is edited but not played on the segment strip.
  The preview LED pulses; the strip does not.