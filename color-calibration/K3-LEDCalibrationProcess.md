# Xone K3 LED Calibration

> How to measure your strip and produce an even-luminance curve.

## Why

Different LED units don't emit equally. Red, green, and blue
channels have different response curves and different perceptual
weights. Without calibration, a gradient that's mathematically
smooth looks lumpy — blue reads weak, mid-crossfades hump, stops
that should match don't.

Calibration measures each channel's response, applies perceptual
weights, and solves per-sample brightness so every point in a
gradient emits the same perceived light.

## The model

One line:

    Y(rgb, hw) = Σ_c [ (rgb_c / 127) · f_c(hw) · w_c ]

- `f_c(hw)` — channel c's response curve, measured.
- `w_c` — channel c's perceptual weight (Rec2020).
- Sum, not max — additive light.

Three implications:

- **Per-channel curves.** R, G, B respond differently to hw. Each
  is measured and stored separately.
- **Per-channel weights.** Red, green, blue at full drive aren't
  equally bright to the eye. Weights correct that. Default
  Rec2020: `[0.2627, 0.6780, 0.0593]`.
- **Sum.** A magenta midpoint is `Y_red + Y_blue`. Taking max would
  under-rate it and produce a brightness hump at any blend
  midpoint.

The runtime then:

1. **Computes a flat target** — the minimum emission the whole ramp
   can sustain. Iterates stops at their authored hw and blend
   midpoints at max hw 127 (midpoints split drive across channels
   and can't reach endpoint luminance).
2. **Solves hw per sample** by bisection so the sample emits exactly
   the target.

The min stop solves back to its authored hw. Every brighter stop
damps to the target. That's how the strip flattens.

RGB is never touched — only hw.

## What you need

- Raw-capable camera with manual exposure, no auto-WB
- Dark room or light-tight box
- Tripod (IBIS off)
- ImageMagick (`magick`) or similar

## Step 1 — prep the strip

The calibration schemes light every calibration target. Before
shooting, disable every other LED: layer button (`0x1C`), shift
button (`0x1D`), preview LED (`button0_0`), marker LEDs (`grid2_3`,
`grid3_3`).

Easiest way: minimal boot config that loads only the sweep scheme
onto the calibration targets.

## Step 2 — camera

1. Raw mode. Manual exposure, manual ISO.
2. Fixed white balance across all shots.
3. Dark room. Lens cap on for dark frames.
4. Tripod. IBIS off.

## Step 3 — shoot

Per scheme (9 total: 3 channels × 3 hw ranges):

1. Lens cap on — dark frame
2. LEDs off — ambient frame (skip if truly black)
3. Load scheme — signal frame

Same exposure for every frame. No clipping. Brightest LED lands at
70–85% of full-scale DN.

## Step 4 — develop

Per frame:

- Demosaic: RCD or AMaZE. Capture sharpen off.
- White balance: fixed across all shots.
- Working profile: **linear Rec2020**.
- Everything else off: lens correction, denoise, filmic, highlight
  reconstruction.
- Export: **16-bit TIFF, linear Rec2020**.

Sanity check:

    magick file.tif -format "%[icc:description]\n" info:

Should print `Linear Rec2020 RGB`. If it says sRGB, gamma is leaking
in.

## Step 5 — sample

Pick a reference frame. For each lit LED centre, record (X, Y)
coordinates. Skip `CALIB_TARGETS[0]` — physically awkward, not
sampled.

    magick DSCxxxxx.tif -crop 5x5+X+Y +repage \
      -format "%[fx:mean.r*65535]\n" info:

Read the channel matching the scheme (R for `calR`, G for `calG`,
B for `calB`).

**Counts to expect:**

- `calR/G/B` — 24 values (slot 0 skipped, hw 5..127)
- `calR/G/B_low` — 15 values (hw 1..15)
- `calR/G/B_high` — 17 values (hw 111..127)

## Step 6 — process

For each channel (r, g, b) **separately**:

1. **Dark subtract** — subtract the dark frame value from every
   sample. Small (5–15 DN) but do it.
2. **Merge** — combine low + main + high into one `(hw, value)`
   list. Average overlaps.
3. **Smooth** — median or rolling average across nearby hw samples.
   Result must be monotone.
4. **Downsample** — 17–19 anchors per channel. Weighted toward the
   low-end knee (hw 1..15), the linear middle (hw 20..100), the top
   plateau (hw 105..127).
5. **Normalize per channel** — divide each channel by its **own**
   max. Not the shared max across all three.

Per-channel normalization keeps `f_c` unitless. Chromaticity is
handled by the weights, not the curve. Normalize across all three
and the weights double-count the efficiency ratios — hue fidelity
breaks.

## Step 7 — paste

Into `xone-k3-colors.js`:

    XoneK3.LED_TRANSFERS = {
      measuredRGB: {
        r: [[hw, lum], ...],   // 17-19 pairs
        g: [...],
        b: [...]
      }
    };

The runtime re-normalizes per channel (idempotent) and
monotone-enforces. Minor processing errors get corrected.

## Step 8 — turn it on

Device boot config in `xone-k3-cat.js`:

    calibration:       'measuredRGB',
    calibrationMode:   'rms',
    wbGain:            [0.6, 1.0, 0.93],
    channelPerceptual: [0.2627, 0.6780, 0.0593],
    hkBoost:           1.5,
    lumGamma:          0.5

Reload the preset.

**Per-controller.** These apply to every LED on the device. Two K3s
can carry different curves, WB, and model constants without
interfering.

**Two nested switches** control whether the solve runs on a given
render:

1. `calibrationMode: 'rms'` on the controller — master switch.
2. `calibration: true` on the scheme — per-scheme opt-in.

Both must be true for the flat-min solve to run. A wire bake sets
`calibration: false` on the resulting scheme so playback doesn't
re-solve already-solved hw.

If the named curve fails to load, `calibrationMode` is forced to
`'off'` with a boot log line:

    Xone K3: calibration curve "measuredRGB" missing for <label>; calibration off.

## Verify

Two schemes to load in the lab (paste into `xone-k3-colors.js`,
reference in `xone-k3-colorlab.js` labPresets, or load via
scheme-scroll):

**`rToG`** — 24 stops, red → green crossfade at constant hw 80.

- **Calibration off** — middle looks dull and brownish. Luminance
  dips.
- **Calibration on** — uniform brightness end to end.

**`fade_R`, `fade_G`, `fade_B`** — single hue at hw 0..127. Checks
that hue doesn't shift as brightness changes.

| What you see | What it means |
|---|---|
| Middle of `rToG` brighter than endpoints | Sum isn't applying, or HK is saturating on WB'd drive instead of authored. |
| Blue dimmer than red | Weights not applying. Check `channelPerceptual`. |
| Strip dim overall | The min-setting stop's authored hw is too low. Raise it. |

## Tune

Per-controller fields. No live adjustment in the current lab — edit
the boot config and reload.

### `wbGain`

Corrects the physical imbalance between LED primaries.

Load a pure-white scheme. Adjust `wbGain[0]` (red) until white reads
neutral. Start at `[0.6, 1.0, 0.93]`. WB limits the strongest
channel's headroom — expect some tradeoff if red and blue disagree.

### `hkBoost` and `lumGamma`

Load a W-R-W crossfade.

- **Mid pops vs endpoints** — HK too low, or `sat` is being computed
  on WB'd rgb instead of authored. Check `_emitAt` uses `rgb`, not
  `wbRgb`, for `sat`.
- **Mid dips vs endpoints** — `hkBoost` too low or `lumGamma` too
  high.
- **Strip feels flat** — lower `lumGamma` toward 0.4.

### `channelPerceptual`

Only if the strip is perceptually uneven after everything else.

| Problem | Adjustment |
|---|---|
| Blue still weak | Lower `w[2]` toward 0.04–0.05 |
| Blue too strong | Raise `w[2]` toward 0.10 |
| Green dominates | Lower `w[1]` toward 0.55 |
| Red dominates | Lower `w[0]` toward 0.20 |

If a strip that was flat becomes uneven after a weight change,
you've pushed a channel so far it's no longer the min stop. The
target moved. Expected.

### Brightness level

Per-scheme now. Load the lab, edit `brightness` on the current
scheme, or use shift + `encoder1` (top) to increment.

In calibrated mode, only the **min stop's** authored brightness
affects the target. Raising a brighter stop has no visible effect —
it gets damped back. Move all stops together or lower the min.

### Re-measure

Only if the strip doesn't match after all of the above. Different
units have different curves.

**Camera vs LED saturation check:** if a channel's sweep flattens
unexpectedly at the top, compare the ratio of two unclipped
channels across the sweep. Constant ratio → shape is shared, flat
top is the camera's ceiling. Reshoot at 2 stops less. Drifting
ratio → LED is genuinely saturating. Take it as real.

## Pitfalls

- **Don't normalize across all three channels.** Each channel gets
  its own max. Shared max erases efficiency ratios.
- **Don't skip midpoints.** Flat target must include blend midpoints
  at max hw. Blends split drive and can't reach endpoint luminance.
  Omitting them over-targets and over-drives the middle.
- **Don't use max or rms.** Sum. Additive light.
- **Don't compute HK `sat` on WB'd rgb.** Use authored. Otherwise
  the middle of any white→hue blend pops.
- **Slot 0 is skipped.** `CALIB_TARGETS[0]` isn't sampled. Low
  yields 15 values, high yields 17.
- **Lens correction.** Vignette sliders multiply pixels by a
  distance-from-centre gain.
- **Auto-WB.** Any change between shots contaminates R/G/B ratios.
- **IBIS drift.** Disable, or record per-frame offsets.
- **Working profile.** `"sRGB"` in `identify` is often a default
  string, not the actual profile. Check `%[icc:description]`.
- **Sweep scheme format.** `calR` etc. in
  `xone-k3-colors-calibration.js` use the old `colorsOn`/`pct`
  format. The current runtime doesn't read those fields. Reference
  only — migrate to `{ colors: [...] }` if you want to load them in
  the current lab.

## Files

- `xone-k3-colors.js` — palette, schemes, `LED_TRANSFERS` table
- `xone-k3-lib.js` — `buildTransferRGB`, `_emitAt`, `_flatTarget`,
  `_calibratedHw`, `sampleSegs`, `sendLED`, `_wbRGB`
- `xone-k3-cat.js` — boot config (`calibration`, `calibrationMode`,
  `wbGain`, `channelPerceptual`, `hkBoost`, `lumGamma`)
- `xone-k3-colors-calibration.js` — sweep schemes (old format,
  reference only)
- `xone-k3-lab.js` — lab runtime
- `xone-k3-colorlab.js` — lab entry
