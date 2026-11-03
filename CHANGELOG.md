# Changelog

All notable changes to this controller preset are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.2.3] — 2026-11-03

Inpulse 500 patch on v2.2.2. No behaviour change for K3 presets.

## Changed

- **Inpulse beatmatch markers mode restored.** Removed in v2.2.2 on
  a misread of the port scope — the intent was that beat-align LEDs
  should do what the original community script does, and the
  original ships both guide and markers modes. Both are now
  available via boot config:
    `beatmatchGuideMode: 'guide'`   (default — tempo assist)
    `beatmatchGuideMode: 'markers'` (alt-deck state, A=3 / B=4)
  Markers mode writes only the beat-align LEDs (`0x1C`, `0x1D`,
  `0x2D` per side) plus off-frames on the unused tempo LEDs. Number
  LEDs (`0x30`) are not written from `_ip500TempoMarkers` — the
  v2.2.2 single-owner fix in `_ip500UpdateDeckIndicators` is
  preserved, so deck switches no longer double-write `0x30`.

## Fixed

- **Inpulse CC dump request missing at boot.** The community script
  sends `0xB0/0x7F` (`all-CC-dump`) from `init()` so the hardware
  reports current pot positions to Mixxx. Without it, soft-takeover
  forced a physical touch per knob before each fader/knob would
  "catch." Restored in `_ip500InitExtra`.

## Review notes (no code change)

- v2.2.2's "Removed beatmatch markers mode" bullet stands as the
  historical record of that release. v2.2.3 restores it. Released
  CHANGELOG notes are not rewritten.

---

## [v2.2.2] — 2026-11-03

Inpulse 500 bug pass. No behaviour change for K3 presets.

## Changed

- **Inpulse tempo LED writes are deduped.** The 250 ms tempo update
  previously re-sent identical `sendShortMsg` calls every cycle —
  40–70 MIDI messages/sec at idle. Now routed through
  `_ip500TempoSend`, which no-ops on unchanged velocity per
  `(status, note)`. Steady-state traffic collapses to zero.

## Fixed

- **Inpulse PFL / slip / quant buttons were dead on input.** HW
  descriptor declared them `type: 'toggle'`, which is not a valid
  `Binding.type` and silently bypassed input dispatch. Renamed to
  `type: 'button'` — the framework derives `buttonMode: 'toggle'`
  from `cfg.type !== 'push'`, which is the correct toggle path.
  Affects `pflA/B`, `slipA/B`, `quantA/B`, plus the two
  `quantA_shift` / `quantB_shift` keylock bindings.
- **Inpulse slicer mode never tracked LED position.**
  `_ip500Slicer.A/B.active` was initialised `false` and never set;
  the LED-advance branch in `ip500SlicerBeatActive` was
  unreachable. `F.ip500SetPadMode` now sets `slicer.active` on
  mode entry and clears it (plus `slicer.button`) on exit.
- **Inpulse effect pads 1–3 had no LED feedback.** `noLED: true`
  was applied uniformly across the eight effect pads, discarding
  the community script's white-on / yellow-off state. Restored via
  the effect's `enabled` CO. Pads 4–8 remain `noLED` (stateless
  actions in the original too).
- **Inpulse crossfader active at boot when switch was OFF.**
  Physical enable switch (note `0x18`) reports no state at boot,
  so `_ip500XfaderEnabled` defaulted `true`. Now `false` — toggle
  the switch once to sync.
- **Inpulse loop encoder blocked halving at 1 bar.** Prior guard
  `beatloop_size < 8` was the wrong threshold (2 bars) and fragile
  against sample rounding. Replaced with a hard floor at 1/32 beat
  (`0.03125`), matching the smallest pad-shift-fraction size.
  `loop_halve` / `loop_double` run at every size down to the floor.
- **`Binding._isOn` trusted a stale CO cache.** Preferred
  `_lastOutKeyValue` over a live `engine.getValue`. The outKey
  observer does not fire synchronously in every environment (test
  harness; some boot-order scenarios), so the cache could return
  the bind-time seed. Now live-read. The observer in `_bindConns`
  still triggers `_refresh()` on real CO change — that is the
  repaint path, not the cache. Framework-wide fix; no user-visible
  change for the K3 workflow (observer fires synchronously there).

## Removed

- **Inpulse beatmatch markers mode.** The port added
  `beatmatchGuideMode: 'markers'`, which repurposed the beat-align
  LEDs for alt-deck state — duplicating the number and browser
  LEDs. Removed; guide mode (the community-script behaviour) is
  the only tempo display.
- **Inpulse dead config / state.** `F.ip500Quant`,
  `F.ip500QuantShift`, `_ip500PadMode`, `pacing` on
  `HW_INPULSE500`, the `autoDJ` config binding (no HW control),
  `padSelect<n>` colorSchemes (HW idx `-1`, colour never renders),
  and the `padSelect` / `autoDJOn` scheme names.

## Tests

- `test/lifecycle.test.js` — new: `_isOn` reads live when the
  outKey CO changes without observer fire.
- `test/misc-hooks.test.js` — `_isOn` cache test corrected to
  match harness contract (`engine._set` writes the CO,
  `engine._trigger` fires observers — both needed to model a real
  CO change).

## Review notes (no code change)

- `engine.brake(ch, 1, 54)` in `F.ip500Play` — verified matches
  the community script's call signature.
- Browser-LED burst (`_ip500BrowserLedBurst`, five sends over
  ~1 s) — deliberate, matches community script; the retry comment
  explains why (shared MIDI buffer drops short messages during
  sysex drains).
- `Binding._lastOutKeyValue` is now write-only dead state
  (observer still fires, value never read). Deferred to a future
  cleanup pass.

---

## [v2.2.1] — 2026-11-03

Inpulse 500 bug fixes. No behavior change for K3 presets.

## Fixed

- Deck-assignment LEDs (notes 1/2): in guide mode, `_ip500ResendSideVU` was overwriting the assignment bit with `play_indicator` at every deck switch, and no observer kept it refreshed. The 1/2 indicator now shows assignment in both modes, consistently.
- Jog scratch persistence: switching decks mid-touch now re-establishes scratch on the new channel via `_ip500RefreshJogTouch<side>`. Previously the new deck pitched instead of scratching for the remainder of the touch.

---

## [v2.2.0] — 2026-11-03

New hardware preset: Hercules DJControl Inpulse 500 (Cat mapping).

## Added

- `hw/inpulse500.js` — full descriptor: palette quantisation (17 velocities), 14-bit CC pairs (volume/EQ×3/gain/pitch), custom jog handler (touch + relative ticks with twos-complement decode + shift multiplier), 8 pad modes × 2 decks (hotcue, loop, slicer, sampler, pitch, roll, effect, beatjump).
- `config/inpulse500-funcs.js` — all funcs. Transport, momentary loop triggers, loop encoder halve/double, pad modes, assistant-as-shift, browser tunnel, crossfader normal + scratch.
- `config/inpulse500-vu.js` — `InpulseController` subclass: VU meters (master L/R + per-deck), peak indicators, tempo LEDs (guide and markers modes), deck-assignment indicators, browser LED burst, jog/vinyl state.
- `config/inpulse500-slicer.js` — slicer state machine (ported).
- `config/inpulse500-config.js` — layer tree (`master`, `deckABase`, `deckBBase`, 16 pad-mode layers).
- `config/inpulse500-schemes.js` — palette-named schemes.
- `inpulse500.js` / `inpulse500.midi.xml` — boot + load order.
- `myCatnip.IP500_JOG` tunables: `wheelResolution`, `rpm`, `alpha`, `beta`, `shiftMultiplier`, `tickMode`. Override via `applyIP500Jog({...})`.
- Boot options: `initialVinylMode`, `browserOffFocus`, `beatmatchGuideMode` (`'guide'` | `'markers'`).

## Changed

- `lib/binding.js` — 14-bit CC support. New `_bits` field (`spec.bits === 14`); `_scaleValue` branches on it. 7-bit path unchanged; existing hardware unaffected.

## Fixed

- Momentary COs (`reloop_toggle`, `beatloop_activate`) reset to 0 on button release so the skin button doesn't latch.
- Cue: goto-and-stop while playing, hold-preview while paused.
- Note-off registered for all note-on statuses — buttons no longer latch after first press.
- Hotcue LEDs: `outKey` wires the hotcue colour CO, so LEDs show Mixxx hotcue colour.
- Loop in/out: explicit `type: 'push'` + release-clear.
- Browser encoder: press+turn tunnels (`MoveRight`/`MoveLeft`); release without turn cycles focus.
- Deck indicators: number LEDs 1/2 show primary assignment; beat-align LEDs under jog show alt deck (3/4) in `markers` mode.

---

## [v2.1.5] — 2026-11-03

HAL decoupling. No behaviour change for shipped presets.

## Changed

- `_perceptionMixActive` resolution: explicit `cfg.perceptionMixActive` wins; falls back to `sysex !== false` for existing descriptors. Removes the framework's dependence on the K3-specific `sysex` field when deciding whether mix correction is active.

## Fixed

- `Controller.inspect()` no longer throws when a hardware descriptor omits `midiChannel` (non-MIDI hardware). Prints `ch —` instead.

---

## [v2.1.4] — 2026-11-03

Bug pass + simplification. No behaviour change for shipped presets.

## Fixed

- `Binding._evaluateScheme`: a scheme function returning a fresh-but-value-equal object no longer recompiles on every render. Warns once (`csSchemeFresh`), reuses the compiled memo.
- Lab `bakeScheme`: `perception.brightness === 'own'` sources no longer get a flat-target bake applied against intent. Flat bake is now gated on `brightnessMode === 'flat'`.
- Lab `bakeScheme`: the scheme's `perception` field is now preserved on round-trip (non-null only — `null` is left unset so the `calibration: false` → `{ brightness: 'off' }` legacy translation still applies).

## Changed

- `perceptionOverride` → `mixMode` / `brightnessMode` resolution consolidated into `Controller._resolveMixMode` / `Controller._resolveBrightnessMode`. Used by `sendLED`, `_solveHw`, and Lab `bakeScheme` (three copies → one).
- `perception._fingerprint(hw)` is now cached per HW (`_fpCache` WeakMap). Removes a string build per `_flatTarget` call. `_invalidate(hw)` clears it.
- `EMPTY_META` is frozen. `lib/controller-beat.js` is now `'use strict';`.

## Review notes (no code change)

- B5 (deviation LED + beat brightness inheritance): documented in INTERNALS §20.7 as a latent limitation. Full fix needs an `applyBeat` return-shape change; deferred.
- B1 (co-match perception — parent vs co-scheme): confirmed as designed. Parent wins. No shipped scheme exercises a non-default co-scheme perception.
- B7 (unbind orphans an active transaction): behaviour confirmed correct. Inline comment added to `_applyBinding`'s unbind branch.

---

## [v2.1.3] — 2026-11-03

Small fix + doc pass. One real bug (lab bake), one real waste of
work (redundant write), and a lot of cosmetic cleanup.

## Fixed

- **`bakeScheme` honours scheme-level `perception.mix`.** Lab bake
  resolved `mixMode` from the controller + hardware but ignored
  `scheme.perception.mix`. A scheme with `perception: { mix: 'off' }`
  got baked with mix applied — baked stops were post-mix rgb, but
  the render path would skip mix. Preview and reload diverged.
  WB is now baked only when `mixMode === 'correct'`.

## Changed

- **K2 described as a discrete-colour transport.** Trimmed
  overlong K2 sections in PERCEPTION §6.1, CONCEPTS §10, and the
  GLOSSARY entry. Corrected `hw/k3.js` file header — the
  brightness solve runs on K2 and its byte reaches `sendK2Note`
  as velocity; fine resolution is discarded, mix is skipped.
- **`_onTrackLoaded` writes `shared.lastLoopTouchMs[ch] = 0`
  once** instead of twice on the load path.
- **`.mjs` → `.js` in comment headers** across `lib/`, `hw/`,
  `config/`. 32 occurrences across 16 files. Cosmetic; v2.1.0
  port leftover.

## Compatibility

- Mixxx 2.5
- No shipped-preset behaviour change vs v2.1.2

---

## [v2.1.2] — 2026-11-03

Documentation-only release. **No shipped-preset behaviour change**
vs v2.1.1, no code changes, no `.midi.xml` changes, no config
changes. Brings every doc up to v2.1.x reality after the
v2.1.0 / v2.1.1 code churn: `.mjs` paths, `hw.writeLED`,
`calibration` fields, per-controller `_lastLoopTouchMs`,
session-global `TIME_SIG`, and `labToggleWb` were still
referenced throughout `docs/` and `README.md`.

## Changed

- **`docs/HARDWARE.md` split into `HARDWARE.md` + `PERCEPTION.md`.**
  Perception was ~40% of the file and genuinely self-contained.
  HARDWARE.md retains the descriptor-side contract (six
  methods, other data blocks, boundary, porting checklist,
  worked examples, cross-controller state, migration).
  PERCEPTION.md covers the model, curves, modes, Model A/B,
  per-scheme override, and the `myCatnip.perception.*` API.
  Cross-referenced from both directions.

- **`docs/PERCEPTION.md` — new file.** Covers the whole
  perception pipeline: data formats (curves / samples / custom),
  model parameters, modes (`mix`, `brightness`), Model A vs
  Model B, runtime mix toggle, K3's own expression, per-scheme
  override, public API with resolution order, per-HW caches.
  Three doc-side corrections along the way:
  - The v2.1.0 `mode` default was documented as
    `{ mix: 'correct', brightness: 'own' }` when omitted; it is
    in fact `'off'` for both. Fixed.
  - Model B emit formula now correctly states "post-mix rgb"
    as the sampling input.
  - Static render paths skip the brightness solve; deviation
    paths run it. This was implied but not stated — now
    explicitly documented.

- **`docs/INTERNALS.md` full rewrite.** Every v2.0.x identifier
  removed (`writeLED`, `_transfer`, `_calibCurveName`,
  `calibrationMode`, `_flatCache` / `_hwCache` on the controller,
  `_lastLoopTouchMs` per-controller, session-global `TIME_SIG`,
  `[k3]` prefix). File reorganised from "list of non-obvious
  facts" into themed sections:
  - §0 known artifacts (`config/k3-lab.js` vs `lib/`, `.mjs`
    comment headers).
  - §3–§10 boot, recompute, patches, modes, focus, modifiers,
    chord, timeline — prose-first with the reasoning behind
    each invariant.
  - §16 debugging with the six new perception warnings added to
    the warn table.
  - §19 performance — `PERFORMANCE.md` merged in, reorganised
    by "design → slow machine → can't save → measuring →
    cross-project principles".
  - §20 design notes — the old ~90 bullet "non-obvious" list
    regrouped by theme with reasons attached.
  - §21 limits updated (hardware descriptor contract now names
    all seven data blocks; `shared.lastLoopTouchMs[ch]`).

- **`docs/PERFORMANCE.md` deleted.** Content merged into
  INTERNALS §19. Two unique sections (bisect cost, ramp sample
  cost) folded into INTERNALS §19.3. Per the doc-pass plan.

- **`docs/CONCEPTS.md`** — new §8.5 "Shared session state"
  covering `shared.timeSig[ch]`, `shared.lastLoopTouchMs[ch]`,
  `shared.controllers[label]`, `warned`, `rw`. §8 beatjump
  gate sentence now names `shared.lastLoopTouchMs[ch]`. §8
  gains a per-channel time signature paragraph. §10 gains a
  K2 perception note and the "calibration solve" → "perception
  solve" wording fix. "Where to go next" now points at
  HARDWARE.md and PERCEPTION.md, drops PERFORMANCE.md.

- **`docs/CUSTOMISE.md`** — path renames throughout
  (`config/k3-*.js`, `lib/*.js`, `hw/k3.js`). Scheme field
  table gains `perception`, marks `calibration` deprecated
  with translation note. §2.7 was "hardware calibration" — now
  a stub pointing at `PERCEPTION.md`. §2.8 "K2-mode LEDs"
  rewritten: K2 is transport-level only, `k2: true` and
  `k2Indices` were removed in v2.1.0 and have no effect.
  §2.9 tunables now show per-channel `setTimeSig(bb, pb, ch)`.
  §2.10 diagnostics gains `inspect('perception')` and
  `inspect('shared')`. §2.11 funcs reference
  `shared.lastLoopTouchMs[ch]` instead of
  `_lastLoopTouchMs[ch]`. §1.5 "calibration solve" →
  "perception solve". §1.13 builder calls use
  `myCatnip.builders.*`.

- **`docs/AI-HELPER.md`** — doc map updated (HARDWARE, PERCEPTION
  added; PERFORMANCE removed). "Where changes happen" updated
  to `config/k3-*.js` + `lib/*.js` + `hw/k3.js`. "Reading the
  user" gains eight perception / K2 / shared mappings. "When to
  say no" gains wbGain-moved and per-binding-K2-removed
  entries. "AI failure modes" gains the K2 transport-level
  entry.

- **`docs/GLOSSARY.md`** — 15 new entries: HAL, Perception,
  `PERCEPTION`, Model A, Model B, Mix, Brightness solve,
  `_perceptionMixActive`, `labToggleMix`, `shared`,
  `shared.controllers[label]`, `shared.timeSig[ch]`,
  `shared.lastLoopTouchMs[ch]`, Time signature, K2. Updated:
  Beatjump gate (shared location), Bake (perception brightness
  solve), Wire (perception brightness solve). Static LED entry
  clarified to note brightness solve is skipped.

- **`README.md`** — install section rewritten to describe the
  `lib/` / `hw/` / `config/` tree and the full-restart
  requirement. "Where to go" table updated: HARDWARE and
  PERCEPTION added; PERFORMANCE removed; INTERNALS now covers
  tuning performance. Four `xone-k3-cat-*.js` references
  renamed to `config/k3-cat-*.js`.

## Review notes (no code change)

- **`hw/k3.js` file header still says the K2 mode skips
  brightness solve.** It doesn't — `_perceptionMixActive` only
  suppresses the mix step; brightness solve runs and its output
  reaches `sendK2Note` (which then collapses it to a coarse dim
  scalar). Documented in PERCEPTION.md §6.1 as a code-comment
  bug for the follow-up code pass.

- **`.mjs` remains in some source comment headers** (e.g.
  `hw/k3.js`, `lib/perception.js`, `lib/binding.js`,
  `lib/controller.js`, `lib/controller-beat.js`,
  `lib/controller-boot.js`, `lib/controller-colour.js`,
  `lib/controller-render.js`, `lib/schemes.js`). Cosmetic
  leftover from the v2.1.0 `.mjs` → `.js` port. Noted in
  INTERNALS §0. Fix in a follow-up `.mjs` cleanup commit.

## Compatibility

- Mixxx 2.5
- **No behaviour change** vs v2.1.1
- Same file layout as v2.1.1
- No config changes
- Pure documentation release — safe to ship without a Mixxx
  restart (docs aren't loaded by Mixxx)

---

## [v2.1.1] — 2026-11-03

Test restoration + framework compat fixes. No shipped-preset
behaviour change vs v2.1.0. Restores the vm-based test harness
that was left in .mjs form at v2.1.0, adds two small API shims
for backward compat, and fixes three bugs that surfaced once
tests ran again.

## Fixed

- **`applyBeat` inline brightness inheritance.** A colour spec
  with an inline brightness (`'red, 60'`, `[127, 0, 0, 60]`)
  no longer had its brightness carried into the emitted entry
  when the cascade reached that stop via bar / phrase /
  prePhrase. `applyBeat` now checks `_colorHasBrightness(lc.color)`
  and inherits `ce.brightness` when no higher level set an
  explicit brightness. Restores v2.0.0 behaviour.

- **`_resetShared` crashes on null-prototype warned map.** The
  shared warn dedupe map is `Object.create(null)` — no
  `hasOwnProperty` on the prototype. Switched to `Object.keys`
  iteration. `_bootWith` no longer throws on the second boot.

- **`_resolveSig` with no channel argument.** Callers that used
  the v2.0.0 session-global `TIME_SIG` shape (`myCatnip.beatLevel(
  beat, count)` without a channel) hit `shared.timeSig[undefined]`
  and fell through to scheme defaults. Now falls back to
  channel 1 when `ch === undefined` — matches the 2-arg
  `setTimeSig(bb, pb)` semantic.

- **`resolveNamedColour` / `mapMixxxColor` with no ctrl.** Direct
  API calls without a controller (scheme compile from a
  bootstrap context, `applyBeat` resolving a colour name before
  a controller exists) returned `null`. Falls back to `HW_K3`'s
  palette when `ctrl` is undefined. When `ctrl` is passed but
  its hardware has no `PALETTE`, still warn-once + dark — that's
  a real HW config gap.

## Added

- **`myCatnip._warned` is now a getter/setter proxy over
  `myCatnip.shared.warned`.** v2.0.0 code and tests reset the
  warn-once map by reassigning `myCatnip._warned = {}`. The
  proxy keeps both names in sync — the setter replaces
  `shared.warned`, the getter returns the live object.

- **`myCatnip.TIME_SIG` accessor.** Getter returns
  `myCatnip.shared.timeSig[1]` (or null). Setter writes all
  four channels at once — same as `setTimeSig(bb, pb)`. Existing
  presets that read or write `myCatnip.TIME_SIG` directly
  continue to work; new code should use `setTimeSig` /
  `clearTimeSig` / `shared.timeSig` directly.

## Changed

- **Test harness restored to vm-based `node test/run.js`.**
  `test/harness.js`, `test/helpers.js`, `test/run.js`, and all
  `*.test.js` files loaded from v2.0.0 and re-targeted at the
  v2.1.0 file layout. `test/calibration.test.js` removed
  (tested controller-bound implementation details that moved
  to `myCatnip.perception.*`). New `test/perception.test.js`
  covers the public perception API. `test/sysex.test.js`
  rewritten for `hw.send(ctrl, idx, rgb, hw)` +
  `PERCEPTION.curves` / `.mode`. `test/misc-hooks.test.js`
  drops two `channelPerceptual` tests (feature moved to
  `PERCEPTION.weights`, validated at derivation time not
  construction time).

- **`test/helpers.js` provides `_identityHw()`.** Returns
  `HW_K3` with `PERCEPTION: { curves: 'linearTest',
  mode: { mix: 'off', brightness: 'off' } }` — the equivalent
  of v2.0.0's `calibrationMode: 'off'` + `wbActive: false`.
  All test fixture controllers use this by default, so LED
  output assertions observe the scheme's raw rgb + brightness.

## Tests

- 1005 passing, 0 failing.
- `test/beatjump-gate.test.js`, `test/beatsync.test.js` — sed
  migrated `c._lastLoopTouchMs[ch]` → `myCatnip.shared.lastLoopTouchMs[ch]`.
- `test/warnings.test.js` — sed migrated `[k3]` prefix to `[myCatnip]`.

## Compatibility

- Mixxx 2.5
- Same `.midi.xml` schema as v2.1.0
- Same file layout as v2.1.0
- No config changes vs v2.1.0
- Pure patch release — no behaviour change for shipped presets

---

## [v2.1.0] — 2026-11-03

Major restructuring release. File layout reorganised into
`lib/`, `hw/`, `config/`. Perception model replaces framework-
owned calibration. Per-HW palette and brightness. Shared
namespace for cross-controller state. Per-channel time
signature. K3 sysex output byte-identical to v2.0.0 for
`sysex: true` presets; K2 mode (`sysex: false`) brightness
solve is now internally consistent (see Fixed).

## Breaking

- **File layout.** Source files moved into `lib/`, `hw/`,
  `config/` subdirectories. Old `myCatnip-*` prefixed files
  removed. Entry modules renamed `k3-<preset>.js` and live at
  repo root alongside the `.midi.xml` files. All 5 `.midi.xml`
  files updated to reference the new paths via `<scriptfiles>`.
  Old presets must be deleted and re-downloaded. Full Mixxx
  restart required (not just preset reload) to clear the script
  cache.
- **HAL.** `hw.writeLED(ctrl, idx, r, g, b, hw)` →
  `hw.send(ctrl, idx, rgb, hw)`. `rgb` is a `[r,g,b]` array of
  post-perception wire values. Per-scheme `perception` override
  is applied in `ctrl.sendLED` before `hw.send`.
- **DEFAULTS.** `calibration`, `calibrationMode`, `wbGain`,
  `channelPerceptual`, `hkBoost`, `lumGamma` removed from
  `DEFAULTS`. Migrate to `hw.PERCEPTION`. Presets that still
  pass these fields are ignored.
- **Palette hooks.** `resolveNamedColour(name)` →
  `resolveNamedColour(name, ctrl)`. `mapMixxxColor(rgb)` →
  `mapMixxxColor(rgb, ctrl)`. Module-load overrides are no
  longer used; palette lives on `hw.PALETTE` /
  `hw.MIXXX_COLORS`.
- **Per-HW brightness defaults.** `DEFAULT_RGB_BRIGHTNESS` /
  `_OFF` read from `ctrl.hw` first, fall back to framework
  110/12.
- **`_lastLoopTouchMs` per-channel.** Moved from per-controller
  to `myCatnip.shared.lastLoopTouchMs[ch]`. Two controllers on
  the same channel now gate each other's beatjumps.
- **`TIME_SIG` per-channel.** `myCatnip.setTimeSig(bb, pb)`
  still sets all four channels; `setTimeSig(bb, pb, ch)` scopes
  to one. Presets that read `myCatnip.TIME_SIG` directly should
  read `myCatnip.shared.timeSig[ch]`.
- **`scheme.calibration: false`** translated to
  `perception: { brightness: 'off' }` at compile time. Still
  skips brightness solve, still keeps mix. Preserved for
  filter-scheme byte-identity.

## Added

- **`lib/perception.js`** — perception model as pure data
  processing: curve derivation, LUT inversion, emit prediction
  (Model A / Model B), mix application, brightness bisect.
  Per-HW caches (curves, LUTs, flat target, hw byte) keyed on
  the hardware descriptor via WeakMap.
- **`hw.PERCEPTION`** — `{ curves | samples | custom,
  wbGain?, weights?, gamma?, hkBoost?, mode: { mix, brightness } }`.
  Data-only; framework derives and applies. K3 supplies full
  model (WB, weights, gamma, hkBoost) and declares
  `mode: { mix: 'correct', brightness: 'flat' }`. Simple
  hardware can supply `samples` only (derived to curves, uses
  Model B). No `PERCEPTION` = raw output.
- **Per-scheme `perception` override** — `false` bypasses both
  mix and brightness; `{ mix: 'off' }` skips mix only;
  `{ brightness: 'own' }` / `'flat'` / `'off'` overrides just
  brightness. Omitted = use HW default.
- **`myCatnip.shared`** — session-scoped namespace:
  `{ timeSig, lastLoopTouchMs, warned, controllers, rw }`.
- **`shared.controllers[label]`** — owner-write, everyone-read
  per-controller block for cross-controller state. Both slot
  letter (`activeDeck: 'A'`) and resolved channel
  (`selectedDeckCurrent: 1`) exposed. `shutdown` deletes the
  block.
- **`myCatnip.perception`** — public API: `deriveCurves`,
  `deriveFromSamples`, `deriveLuts`, `applyMix`,
  `solveBrightness`, plus internal helpers.
- **`inspect('perception')`** — new probe: mode, curves source,
  derived curve point count, current fingerprint, ctrl mix
  state.
- **`inspect('shared')`** — new probe: timeSig, lastLoopTouchMs,
  warn key count, per-controller blocks.
- **`inspect('why')`** — now includes a perception section
  (HW mode, scheme override, ctrl mix state).

## Changed

- **Print prefix:** `[k3]` → `[myCatnip]` throughout.
- **Throw prefix:** `Xone K3:` → `myCatnip:`.
- **Scheme compile cache** is per-HW (WeakMap keyed on HW
  descriptor). Two descriptors with different `PALETTE` compile
  schemes independently.
- **`labToggleWb` → `labToggleMix`.** Toggles
  `ctrl._perceptionMixActive`, clears `_ledCache` on toggle.
  Alias `labToggleWb` kept with warn-once.
- **Lab bake `bakeScheme`** uses `myCatnip.perception._flatTarget`
  / `_bisectHw` with mix mode threaded; scheme-level perception
  override respected. Export level bakes WB from
  `hw.PERCEPTION.wbGain` (only when mix is active).
- **`hw/k3.js` shrinks** — calibration math removed (moved to
  `lib/perception.js`). File now declares model as data plus
  the six HAL methods and protocol primitives.

## Fixed

- **K2 mode brightness solve is now consistent.** v2.0.0 solved
  brightness predicting with white-balance applied but sent raw
  rgb to the K2 path — actual brightness differed from
  prediction. v2.1.0 disables mix for the whole K2 transport
  (`_perceptionMixActive = (sysex !== false)`), so prediction
  and send both skip WB. K2 LEDs may be slightly dimmer than
  v2.0.0 for schemes where WB would have scaled the send.
- **Per-channel beatjump throttle.** Two controllers on the same
  channel now gate each other. Without this, Kitten's rapid
  beatjumps bypassed Cat's throttle on the same CO tree.

## Review notes (no code change)

- **`_emitAt` applies mix internally.** Pre-mix rgb is
  mix-corrected, then the model formula predicts on post-mix
  rgb. `applyMix` is called once per render at `sendLED`; the
  emit model reuses the same mix application for prediction.
  No double-WB.
- **`_flatTarget` / `_hwCache` keys include mix mode.** Toggling
  mix at runtime (`labToggleMix`, or preset change) invalidates
  caches automatically. `_ledCache` is cleared on toggle so
  next render re-sends.
- **`labToggleWb` alias retained** for any user config still
  referencing it. Warns once, defers to `labToggleMix`.
- **`scheme.calibration` field is deprecated.** Still read
  (translated at compile time to `perception: { brightness:
  'off' }`), but new schemes should use `perception:` directly.
  Alias scheduled for removal in the next major.
- **Test harness not updated.** `test/` still has `.mjs` files
  from the ES module experiment. Not part of the shipped
  preset — no user impact. Harness conversion deferred to a
  follow-up commit.

## Compatibility

- Mixxx 2.5
- **Breaking file layout** (`.js` in subdirectories, `k3-*`
  entry modules at root, `myCatnip-*` prefixed files removed)
- **Breaking HAL** (`send` not `writeLED`)
- Old v2.0.0 presets must be deleted and re-downloaded
- Full Mixxx restart required after upgrade
- K2 mode (`sysex: false`) brightness may shift slightly vs v2.0.0
- `sysex: true` presets byte-identical to v2.0.0

---

## [2.0.0] — Namespace and filename rename

Breaking for framework extenders. Preset loading (Cat, Kitten, oneK3,
oneK3 miniFX, colorLab) is unaffected — the `.midi.xml` `<key>` bindings
and `<file filename>` entries are updated in lockstep with the source,
so user-visible behaviour is identical to v1.2.0. **No behavioural
change from v1.2.0.**

### Changed — Framework namespace

- `XoneK3` → `myCatnip` in every `.js` and `.midi.xml`.
- `XoneK3.K3Controller` → `myCatnip.Controller`. No `K3Controller`
  alias.
- `XoneK3.LabController` → `myCatnip.LabController`. Extends
  `myCatnip.Controller`.
- `_requireLoad` prereq key `'K3Controller'` → `'Controller'`.
- XML `<key>XoneK3.init</key>` / `<key>XoneK3.shutdown</key>` →
  `<key>myCatnip.init</key>` / `<key>myCatnip.shutdown</key>`.
- XML `functionprefix="XoneK3"` → `functionprefix="myCatnip"`.

### Changed — Filenames

- `xone-k3-*.js` → `myCatnip-*.js` (24 files, git mv).
- `xone-k3-*.midi.xml` → `myCatnip-*.midi.xml` (5 files, git mv).
- `<file filename="...">` references in every `.midi.xml` updated.
- `_requireLoad(...)` filename strings and error-message headers
  updated.

### Not changed

- `HW_K3` object name.
- `'XONE:K3'` controller IDs in `<controller id="...">`.
- `'Xone K3'` strings in print/error prefixes.
- Scheme names, preset names, `[k3]` print prefix, `_warnOnce` keys.

### Migration

- **Preset users:** no action.
- **Custom presets:** `sed -i 's/xone-k3-/myCatnip-/g; s/XoneK3/myCatnip/g; s/\.K3Controller/.Controller/g' your-preset.js your-preset.midi.xml`

### Deferred to v2.1.0

- `HW_FAKE` test hardware.
- `HARDWARE.md`.
    
---

## [1.2.0] — Boundary hardening

Backwards-compatible. Existing presets, tests, and saved layouts load
unchanged. Non-K3 hardware that omits the new data blocks degrades
gracefully with warn-once diagnostics.

### Changed — Framework / Hardware boundary

- **L3a — Palette.** `XoneK3.SYSEX_PALETTE` moved to
  `XoneK3.HW_K3.PALETTE`. New framework hook
  `XoneK3.resolveNamedColour(name)`; default warns once and returns
  `null`. `HW_K3` overrides at module load. `_parseNamedEntry` in
  `lib-schemes` already dispatched through the hook; no consumer
  change required.

- **L3b — Mixxx colour mapping.** `XoneK3.MIXXX_COLORS` moved to
  `XoneK3.HW_K3.MIXXX_COLORS`. New framework hook
  `XoneK3.mapMixxxColor(hex)`; default warns once and returns `null`.
  `HW_K3` overrides. `Binding._resolveMixxxColor` already dispatched
  through the hook.

- **L4 — Brightness defaults.** `DEFAULT_RGB_BRIGHTNESS` (110) and
  `_OFF` (12) stay as framework fallbacks with the same values, but
  are re-declared on `HW_K3` at module load so a second hardware has
  a single override point. K3 behaviour unchanged.

- **L1 — Pacer transport hook.** `ctrl.pacer(name, opts)` now accepts
  `opts.sendFn` and `opts.throttleMs`. Called without a `sendFn`,
  the pacer warns once and drops payloads — no transport is
  silently guessed. `TIMING.sysexThrottleMs` renamed to
  `TIMING.pacingDefaultThrottleMs` (getter/setter alias keeps both
  names working; `XoneK3.SYSEX_THROTTLE_MS` and the new
  `XoneK3.PACING_DEFAULT_THROTTLE_MS` framework aliases both stay in
  sync). `HW_K3.writeLED` passes its `_sendSysex` helper to the
  pacer.

- **L7 — Blank sweep.** The `for 0x0C..0x37` loop replaced by an
  explicit 44-entry `BLANK_NOTES` array (`HW_K3`-local) laid out
  like the physical K3: layer / pressL / pressR / shift, unmapped
  gap, grid rows top-down, button rows top-down, encoder press row.
  Same bytes on the wire, auditable row-by-row against the
  hardware.

### Tests

- `test/colors.test.js`: last test now iterates `HW_K3.PALETTE` (was
  `SYSEX_PALETTE`); three new tests covering the `HW_K3` palette
  surface and the two framework hooks.
- `test/sysex.test.js`: two new tests — `pacer` accepts `opts.sendFn`
  and routes payloads through it; `pacer` with no `sendFn` warns once
  and drops payloads. `pacer` tests that previously omitted a
  `sendFn` now pass a no-op to avoid tripping the warn-once.
- `test/run.js`: `_refreshTimingAliases` refreshes
  `PACING_DEFAULT_THROTTLE_MS`; `resetGlobals` uses
  `pacingDefaultThrottleMs` in the test override.

### Compatibility

- All existing schemes resolve unchanged.
- `lab.js`, `snake.js`, `onek3.js`, `onek3-minifx.js`, and all
  `.midi.xml` files load without source changes — their palette
  access routes through `resolveColorEntry`, their pacer use routes
  through `ctrl.sendLED` → `HW_K3.writeLED`, and their blank path
  routes through `_blankLeds` → `HW_K3.blank`.
- `XoneK3.SYSEX_PALETTE` / `XoneK3.MIXXX_COLORS` are **removed** as
  framework globals. Any external code that read them directly
  should read `XoneK3.HW_K3.PALETTE` / `XoneK3.HW_K3.MIXXX_COLORS`
  instead, or call the hooks.
- `XoneK3.TIMING.sysexThrottleMs` / `XoneK3.SYSEX_THROTTLE_MS`
  continue to work as aliases. No deprecation yet — both names are
  first-class in v1.2.0.

---

## [1.1.0] — 2026-11-02

Hardware descriptor extraction. The framework (`xone-k3-lib-*.js`) is
now hardware-agnostic; K3-specific protocol lives in
`xone-k3-hw-k3.js`, timing constants in `xone-k3-lib-timing.js`.

Preset behaviour unchanged: byte-identical LED output across all
five presets, same input dispatch, same calibration. Verified
against `pre-hardware-extraction`.

### Added

- **`xone-k3-hw-k3.js`** — hardware descriptor. HAL contract:
  `buildBindings(ctrl)`, `wireInputs(ctrl)`,
  `writeLED(ctrl, idx, r, g, b, hw)`, `blank(ctrl)`,
  `anyPendingWrites(ctrl)`, `decodeLedCache(val)`. Data blocks:
  `DEFAULTS` (boot defaults), `pacing` (TIMING overrides),
  `LED_TRANSFERS` (raw calibration curves).
- **`xone-k3-lib-timing.js`** — `XoneK3.TIMING` (all throttle /
  settle / epsilon constants), `XoneK3.Pacing` (generic
  rate-limited queue), `XoneK3.applyPacing(overrides)`
  (idempotent merge, validates the
  `takeoverEpsilon > coMatchEpsilon` invariant).
- **`ctrl.pacer(name)`** — lazy named-Pacing accessor. `'led'` is
  the sysex RGB queue; a zero-throttle hardware sends
  synchronously and never allocates a timer.
- **`cfg.hw`** — presets may pass a custom hardware descriptor to
  `bootCat` / `bootLab`. Defaults to `XoneK3.HW_K3`.
- **`inspect('root')`** — new `hw:` line showing the active
  descriptor's name.

### Changed

- **`HARDWARE_CALIB` → `XoneK3.HW_K3.DEFAULTS`.** Same fields
  (`calibration`, `calibrationMode`, `wbGain`,
  `channelPerceptual`, `hkBoost`, `lumGamma`), plus
  `midiChannel` and `sysex`.
- **`LED_TRANSFERS` → `XoneK3.HW_K3.LED_TRANSFERS`.** Raw curve
  data. `XoneK3._buildTransferRGB` (framework) normalises;
  controller reads `this.hw.LED_TRANSFERS[cfg.calibration]`.
- **`LAYER_BUTTON_NOTE`, `SHIFT_BUTTON_NOTE`, `K2_RG_THRESHOLD`
  → `XoneK3.HW_K3`.** Physical-note constants and palette
  threshold moved with the protocol.
- **Timing constants → `XoneK3.TIMING.*`.**
  `XoneK3.SYSEX_THROTTLE_MS`, `BEAT_REPAINT_THROTTLE_MS`,
  `PULSE_CO_MS`, `BEATJUMP_GAP_MS`, `BEAT_STALL_MS`,
  `META_SETTLE_MS`, `BOOT_SETTLE_MS`, `BOOT_MAX_ATTEMPTS`,
  `CO_MATCH_EPSILON`, `TAKEOVER_EPSILON` still resolve (compat
  re-exports), but their source of truth is `XoneK3.TIMING`.
- **`BOOT_DEFAULTS` in `xone-k3-cat.js`** no longer carries
  `midiChannel` or `sysex` — these come from `HW_K3.DEFAULTS`.
- **`sendLED`** signature reduced to `(idx, r, g, b, hw)` —
  `k2Override` removed (was per-LED; now whole-controller via
  `ctrl.sysex`).

### Removed

- **Per-LED K2 mode.** `k2: true` on a binding, `Binding._k2`,
  `_BINDING_FIELDS` `k2` row, `_bindCore._k2`, `_unbind.wasK2`,
  `k2Indices` scan, `sendLED`'s 6th arg. To force K2 MIDI mode,
  set `sysex: false` on the preset or the hardware descriptor.
- **`XoneK3.buildSysExLED`, `sendK2Note`, `noteToLEDIndex`,
  `rgbToK2`, `idxToK2`** — moved to `XoneK3.HW_K3.*`.
- **`XoneK3._wireInputs`** — moved to `XoneK3.HW_K3.wireInputs`.
- **`XoneK3._sendSysExLED`, `_enqueueSysEx`,
  `_startSysExDrain`, `_sysExDrainTick`, `_stopSysExDrain`,
  `_decodeLedCacheValue`, `_blankShortMsgSweep`,
  `_blankSysexSweep`** — replaced by `Pacing` + `hw.writeLED` /
  `hw.blank` / `hw.decodeLedCache`.
- **`ctrl._sysexQueue`, `ctrl._sysexQueueMap`,
  `ctrl._sysexTimer`** — replaced by `ctrl._pacers`.

### Fixed

- **Preset reload with custom pacing.** `XoneK3.applyPacing` now
  resets from `_TIMING_DEFAULTS` before merging, so loading
  preset A (`sysexThrottleMs: 25`) then preset B (no override)
  restores 10. Previously the merge was purely additive and A's
  values poisoned B.
- **`applyPacing` epsilon invariant.** A broken
  `takeoverEpsilon <= coMatchEpsilon` override now warns once and
  restores both defaults, rather than silently letting deviation
  LEDs misreport "matched" when control isn't live.

### Migration notes

- **From 1.0.x** — no action required for shipped presets. Cat,
  Kitten, oneK3, oneK3-miniFX and colorLab all boot and behave
  identically. Byte-identical LED output across all five presets.
- **Custom bindings with `k2: true`** — remove the field. To
  force K2 for the whole controller, pass `sysex: false` in the
  preset override.
- **Custom hardware** — implement the six HAL methods
  (`buildBindings`, `wireInputs`, `writeLED`, `blank`,
  `anyPendingWrites`, `decodeLedCache`) plus the three data
  blocks (`DEFAULTS`, `pacing`, `LED_TRANSFERS`). Pass via
  `overrides.hw` to `bootCat` / `bootLab`.
- **Custom timing overrides** — pass `pacing: { ... }` on the
  hardware descriptor, or call `XoneK3.applyPacing({ ... })`
  before boot.

---

## [v1.0.18] — 2026-11-01

Removed a duplicate map in `_applyResolved`'s diff state. No
behaviour change.

## Removed

- **`_appliedCfgs`.** It held the same cfg object references as
  `_applied`; the identity guard
  `oldCfgs[name] === cfg` was the only consumer. Now reads from
  `_applied` directly. Three parallel maps to two, and one
  "these must be updated together" invariant becomes structural
  (`_applied` and `_appliedHashes` are the only pair left, and
  they're updated in one place each). Drops a `newCfgs = {}`
  allocation per recompute and one assignment per binding per
  recompute.

  Relies on `_resolvePatch`'s memoization — a repeated
  recompute over an unchanged stack returns the same cfg
  object references, so the identity check fires and the hash
  recompute is skipped. That memoization is unchanged.

## Tests

- No test changes. `test/helpers.js`'s
  `Object.assign({}, ctrl._applied)` still copies the flat cfg
  map — `_applied` remains that. `_inspectRoot`,
  `_needsBeatClocks`, `_unbindRemoved` still read `_applied`
  unchanged.

## Review notes (no code change)

- Full collapse into a single `{ name → { cfg, hash } }` map
  (`_applied` + `_appliedHashes` → `_appliedMeta`) was
  considered and deferred. It needs `test/helpers.js` updated
  in lockstep — the helper copies `_applied` as a flat cfg
  map, so a nested shape would break `bind()` and every
  cell-discovery path in `test/helpers.js`. The two-map form
  shipped here is safe; the one-map form would be a clean
  follow-up if `test/helpers.js` is refactored anyway.

## Compatibility

- Mixxx 2.5 · preset schema unchanged · no config changes ·
  no shipped-preset behaviour change

---

## [v1.0.17] — 2026-11-01

Clarity pass across `lib-binding.js`, `lib-controller.js`, and
`lib-controller-beat.js`. Long functions split, per-object state
documented at class-top, pipeline comments added. No behaviour
change; no shipped-preset impact.

## Changed

- **`Binding.input` split into 6 named methods.** The 130-line
  dispatcher becomes a ~35-line orchestration (`input`) plus
  `_readPhysicalInput`, `_maybeOpenTransaction`, `_isBounce`,
  `_dispatchInput`, `_postInputRefresh`. Pipeline comment at
  the top of `input` names the seven steps.
- **`_dispatchCapturedRelease` split.** Captured-surface
  swap-out / swap-in becomes `_captureCurrentSurface` /
  `_installSurface`, both accepting the same
  `{group, inKey, func, funcArgs, buttonMode}` shape.
- **`_refresh` fallback render extracted to `_renderOutKey`.**
  The no-colorScheme path (outKey on/off) becomes a
  one-method body.
- **`_updateModifiers` split into `_deriveModifierChanges` /
  `_applyModifierChanges`.** Derivation returns
  `{ patchChanges, needsRecompute }`; application batches
  patch deltas and fires hooks. The public entry point is
  four lines. Same hook order, same batching, same
  standalone-recompute fallback.
- **`_onPlayposition` split into `_trackPlayhead` /
  `_shouldSkipPulse` / `_dispatchPositionTick`.** The
  90-line body becomes a ~15-line orchestration (read
  playhead, throttle gate, advance clock, derive origin,
  dispatch) plus three named helpers.
- **Class-top state blocks.** `Binding` gains a documented
  list of the ten `_cs*` colour-scheme flags and the
  four-state transaction machine. `freshDeckState` in
  `lib-controller.js` gains a twelve-field table.
- **`_isShuttingDown` / `_isNoteOn` helpers.** Named
  predicates replace the inline `this._ctrl._shuttingDown`
  and `(status & 0xF0) === 0x90` tests in `input`,
  `_refresh`, and `_send`.
- **Base-hook comment on `_afterRecompute` / `_onInput` /
  `_onPatchChange`.** Grouped under one "subclass hook —
  no-op in base" note.
- **Pipeline comments on `_applyBinding`, `_buildStack`,
  `_batchPatches`, `_refreshColorScheme`, `_onPlayposition`.**
  Numbered-step headers. Original inline comments preserved
  on each step.
- **`_resolveFxPatchName` return-value comment.**
  `undefined` = not mine, `null` = mine-but-missing,
  `string` = swap target. Surfaces the convention at the
  function head instead of only in INTERNALS.

## Removed

- **`_send`'s redundant shutdown check.** `sendLED` gates on
  `_shuttingDown` at the actual MIDI choke point; the extra
  check in `_send` was unreachable-by-design. Comment in
  `_send` explains the delegation.

## Tests

- No test changes. Every method added is a straight
  extraction with the same signature and side effects as the
  inline original. Warn keys (`inputThrow:`, `txReleaseThrow:`,
  `refreshThrow:`, `obsRefreshThrow:`, `updateModifiersPressThrow:`,
  `updateModifiersReleaseThrow:`) unchanged.
  `_onPlayposition` split preserves the exact dispatch order
  (backward detect → throttle → clock advance → origin derive
  → guard → sync-or-repaint).

## Review notes (no code change)

- The plan's `_guardShutdown` wrapper was dropped in favour
  of `_isShuttingDown`. A wrapper buys nothing when the
  underlying check is a single boolean load; the named
  predicate gives the readability win at zero indirection.
- `_isNoteOn` is defined in `lib-binding.js` but only consumed
  by `_wireInputs` in `lib-controller-boot.js`. Kept on
  `Binding.prototype` so the status-nibble idiom is next to
  the midi field it inspects.

## Compatibility

- Mixxx 2.5 · preset schema unchanged · no config changes ·
  no shipped-preset behaviour change

---

## [v1.0.16] — 2026-11-01

Code review pass. One LED fix, a palette cleanup, tunable
extraction, minor read-path tidy-ups. No shipped-preset
behaviour change.

## Fixed

- **`routeTo` LED staleness on THEME.fx mutation.** FX-routing
  overlay grid cells held a raw reference to `THEME.fx[unit]`,
  so an in-place mutation (`THEME.fx[3][0] = 100`) didn't
  repaint — the ref-identity memo in `_evaluateScheme` saw the
  same array and skipped recompile. Routed through
  `CAT.themeScheme('fx', unit)`.

## Added

- **`on.group` without `on.co` warns.** The group was silently
  dropped before (it's a known `on:` field only *with* `co`).
  Key: `csOnGroupNoCo`.
- **`on.patchActive` alongside `co` / `state` warns.**
  `_evalCsOn` checks patchActive first and returns early; the
  other source is unreachable. Key: `csOnPatchActiveSource`.
- **`BEAT_STALL_MS = 1500`** in `lib-core.js`. Replaces the
  sole inline timing literal among the beat-repaint tunables.
  Same value; `_requireLoad`'d from `lib-controller-beat.js`.

## Changed

- **`slipOrLoad` uses `_loadSelectedOntoChannel`.** Matches
  the other three load-arm call sites. No behaviour change —
  `selectedDeckCurrent` is clamped 1–4 at boot.
- **`_parseSchemeValue` returns a boolean.** Dropped the dead
  `hasBase` field from the `{ hasBase, schemeIsFn }` shape.
- **`Binding` ctor / `_reset` use `Object.assign`.** Same
  semantics as the manual `for..in` copy; one less place to
  edit when fields are added.

## Removed

- **`XoneK3.COLORS` / `_populateColors`.** The registry was a
  boot-time copy of `XoneK3.SYSEX_PALETTE`; the only consumer
  (`_parseNamedEntry`) reads the palette directly. Dropped
  from `_bootWith` and `test/harness.js`.

## Tests

- `test/harness.js` — `_populateColors()` call removed.
- `test/colors.test.js` — two `_populateColors` tests removed.
  `resolveColorEntry: every palette entry resolves` already
  covers the same invariant.

## Review notes (no code change)

- `_segsCacheId` attaches a controller-scoped id onto cached
  scheme arrays. A WeakMap would be cleaner but can't back
  `_flatCache`'s 1024-entry eviction. Deferred.
- `_wireCsOnConnection` / `_buildCsFromStateClosure` share a
  seed-then-connect shape. Extracting a helper saves ~6 lines
  at the cost of indirection. Deferred.

## Compatibility

- Mixxx 2.5 · preset schema unchanged · no config changes ·
  no shipped-preset behaviour change

---

## [v1.0.15] — 2026-11-01

Verification pass on v1.0.10 – v1.0.14, focused review of
`lib-controller-colour.js`, and nine micro-cleanups. No
shipped-preset behaviour change.

## Performance

- **`_beatjumpAllowed` accepts the already-read `loop_enabled`
  value.** `encBeatjump` reads `loop_enabled` for its loop-only
  gate, then `_beatjumpAllowed` read it again for its 130 ms gap
  gate — two `engine.getValue` (CO mutex) acquisitions per
  encoder tick while spinning. The encoder now passes the fresh
  value through; grid buttons still omit it and the gate reads
  fresh. Halves the CO-mutex load on the beatjump spin path.
- **`_evalPatchActive` skips the array wrap for string input.**
  Every render of any `on: { patchActive: 'name' }` binding
  (shipped: `CHORD.pressL`, `CHORD.pressR`) was allocating
  `[patchActive]` fresh. Negligible frequency (chord-held only)
  but zero-cost to remove.

## Hardening

- **`colorScheme.knob: null` means "no knob".** Previously
  `null` fell through `!== undefined`, set `_csDeviation`,
  then failed at `this.bindings[null]` → `_csFailed` → black
  LED with a confusing "knob 'null' not found" warning. Now
  treated as `undefined` and renders the static scheme as
  intended. No shipped preset uses `knob: null`, so this is
  a config-shape hardening.
- **`schemeFromState` with a source but no `map`/`list`
  warns at parse.** The closure always returned `undefined`;
  with a base scheme also set, the base silently masked the
  misconfiguration and `csDarkFromFn` never fired. New
  `csFsNoMap` warn-once at parse time surfaces it.

## Readability

- **`_onPlayposition` inlines the mock-fallback `grp`.** The
  local sat above the throttle gate, misleadingly implying
  hot-path use; it only fed the `newPos === undefined` mock
  branch. No behaviour change.
- **`_parseSchemeFromState` drops the dead shape re-check and
  return value.** The caller (`_parseCsScheme`) already
  guarantees a non-array object via its `hasFromState` guard;
  the check was unreachable and the return value ignored. Pure
  cleanup.
- **`_setupColorScheme` uses `_warnOnce` for a bad-shape
  `colorScheme:`.** Previously `print`ed the same line on
  every rebind (focus flips, patch swaps); now warns once per
  binding. Warning key: `csShape:<name>`.
- **`csOnEmpty` warning text matches the actual fallback.**
  On this path `_csOn` stays `null`, so `_bindConns` wires the
  `outKey` listener and `_isOn` reads it — the LED renders
  from `outKey` (or off-ramp), not dark. New text:
  "on: ignored; LED falls back to outKey (or stays off if
  none)." Warning text only.
- **`csOnNoSource` warning text matches the actual outcome.**
  `_csOn` is set with `equals`/`contains` but no source →
  `_isOn` returns 0 → off-ramp renders (dim), not black. New
  text: "no match possible; LED renders its off-ramp."
  Pairs with the `csOnEmpty` fix.

## Tests

- No test changes required. `encBeatjump`'s in-loop /
  out-of-loop tests still pass unchanged (the `> 0` cast
  preserves semantics for binary `loop_enabled`).
  `_beatjumpAllowed`'s default-argument path is identical from
  `beatjumpButton`'s perspective. `_evalPatchActive` returns
  the same values on array and scalar inputs.

## Review notes (no code change)

- **v1.0.10 – v1.0.14 changelog claims re-verified.** All 28
  verifiable claims confirmed on disk (parseNum strictness,
  `_warned` null-proto, `_stableStringify` cycle detection,
  `resolve` bail-outs, `_onPlayposition` callback `v`, hotcue
  colour cache, `applyBeat` deferred slice, `_sampleSnap` /
  `_sampleBlend` index-tracked, `_warnIfFreshScheme` hoist,
  `_buildSegments` warn, `wbGain` validation, `BOOT_WHITE_ENTRY`,
  `_resolveDeckRef` fast paths, `pos` threading, `EMPTY_META`,
  `encBeatjump` loop gate, `_wbRGB` / `_channelEmit` scratch,
  `sendLED` wb-off skip, `_bootWith` shutdown + try/catch,
  `_inspectBeat` dead local). External-fact claims
  (`PULSE_CO_MS`, `ControlPushButton` CO types, Mixxx mock
  signatures) not re-verified from source this pass.
- **`_buildCsFromStateClosure` — `sf.list.slice()` inconsistent
  with `sf.map`.** `list` is copied, `map` shared. Not
  exercised by shipped code (no `list:` in any provided
  preset). Design decision rather than a bug; deferred.
- **`scheme: 'invalid'` + valid `schemeFromState` — base
  failure blocks fromState.** `_parseSchemeValue` sets
  `_csFailed = true` and `_parseCsScheme` returns before
  `_parseSchemeFromState`. Arguably correct (config error
  blocks downstream) but the user sees only `csUnresolved`,
  not "schemeFromState was also provided". Deferred.
- **`resolveScheme` returns `null` silently for missing named
  schemes.** `csUnresolved` at the caller stringifies the ref
  so the bad name is visible. Sufficient. Deferred.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No shipped-preset behaviour change

---

## [v1.0.14] — 2026-11-01

Beatjump encoder scope fix, render-path allocation reduction,
boot hardening. One shipped-preset behaviour change: encoder
beatjump is now loop-only.

**Perf reclaimed:**
- ~24 array allocations / knob-event on calibrated schemes —
  eliminated (shared `_wbRGB` / `_channelEmit` scratch)
- One passthrough function call / LED frame when white balance
  is off

## Fixed

- **`encBeatjump` is now loop-only.** The beatjump encoder
  previously fired outside a loop, where no throttle exists
  and fast spins could drop. Mixxx's `beatjump_forward` /
  `beatjump_backward` are `ControlPushButton`, not
  `ControlTrigger` — `_pulseCo` is required for them, so
  removing the pulse was not an option. The fix gates the
  encoder on `loop_enabled`: outside a loop it does nothing
  (no beatjump, no pulse timer); inside a loop the existing
  130ms `_beatjumpAllowed` cap sits well below the 30ms pulse
  width, so no drops. The grid beatjump buttons
  (`beatjumpButton`, `grid0_1` / `grid1_1`) are unchanged and
  remain usable outside a loop for track navigation.

## Performance

- **Shared scratch for `_wbRGB` / `_channelEmit`.**
  Both returned a fresh 3-element array per call. On a
  calibrated scheme, every `_calibratedHw` cache miss runs
  12 bisect iterations × 1 `_emitAt` → `_channelEmit` →
  `_wbRGB` = **24 array allocations per knob position**.
  Every production caller unpacks indices immediately and
  discards the array; none holds it past the current call.
  Module-scope scratch eliminates the allocation.

  **Contract:** `_wbRGB` / `_channelEmit` return a shared
  array — read indices immediately, do not hold across calls.
  A new caller that needs to hold two returns must copy
  explicitly. The `_channelEmit: scales linearly` test was
  updated to unpack immediately for this reason.
- **`sendLED` skips `_wbRGB` entirely when white balance is
  off.** colorLab after `labToggleWb`, custom configs with
  `wbActive: false`, and any preset where `calibrationMode`
  is off — all skip the passthrough `_wbRGB` call. Saves one
  function call per LED frame, not just an allocation.

## Hardening

- **`_bootWith` shuts down existing controllers before
  resetting the array.** Console `init()` after a boot would
  otherwise leak the old controllers' sysex drain timer,
  beat-clock connections, and boot-settle timers. Mixxx's
  framework calls shutdown before init on preset reload, so
  this only matters for manual re-init — but the fix is one
  line and removes a real leak path.
- **`_bootWith` device loop is try/catch per device.** A
  throwing constructor or `init()` previously aborted the
  loop — remaining devices never booted, and the failed
  controller wasn't in `controllers` for `halt` to clean up.
  Now warn-onces per device and continues.

## Readability

- **`_inspectBeat`** — removed dead `vbeat` local
  (`_virtualBeatFor` result was assigned but never used).

## Tests

- `calibration.test.js` — "`_channelEmit: scales linearly with
  hw`" now unpacks each return immediately (was holding two
  returns across calls, which aliases under the new shared
  scratch). Same mathematical assertion.
- `funcs.test.js` — the two `encBeatjump` tests enable a loop
  before firing the encoder; two new tests cover the
  outside-loop no-op. Locks in the loop-only gate.

## Review notes (no code change)

- **All four `_pulseCo` callers verified as `ControlPushButton`.**
  `beatjump_forward` / `beatjump_backward` are declared
  `ControlPushButton*` in `loopingcontrol.h`;
  `reloop_toggle` and `beatloop_activate` are the same loop-
  button family. `ControlPushButton` stays at 1 until
  explicitly reset, so `_pulseCo` is load-bearing for all
  four. Removing it would leave every beatjump and loop
  action stuck after the first press.
- **`PULSE_CO_MS` stays at 30.** No split into
  beatjump / loop-action tuneables — the pulse width is CO
  reset latency (enough for Mixxx's event loop to observe
  the 1), identical requirement for every caller. The
  throttle side effect is unintentional but harmless: inside
  a loop the 130ms `_beatjumpAllowed` cap is the real rate
  limiter, and outside a loop the encoder now does nothing.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- **`encBeatjump` outside a loop is now a no-op.** If a user
  relied on encoder beatjumps for non-loop navigation, bind
  `beatjumpButton` to a grid cell instead — those stay
  unrestricted.
- No other config changes required

---

## [v1.0.13] — 2026-11-01

Beat-engine performance + readability. No shipped-preset behaviour
change.

**Perf reclaimed:**
- ~1.3k token comparisons + ~80 regex matches /sec — steady
  playback
- ~52 redundant CO mutex acquisitions / boot
- ~33 redundant CO mutex acquisitions / track load
- ~32 object allocations /sec — idle-deck countdown repaints

## Performance

**`_resolveDeckRef` fast-paths the three common deck tokens.**
Every beat-enabled LED refresh resolved its `beat.deck` via the
full 16-token `XoneK3.resolve` loop plus a regex match. Shipped
schemes all use `$DECK_ACTIVE$` (or `$DECK_A$` / `$DECK_B$` in
custom configs), which map directly to controller state. The
fast path returns the same numeric channel in O(1); other tokens
fall through unchanged to the generic resolver. Steady-state
playback eliminates ~1.3k token comparisons and ~80 regex
matches per second; a `_refreshAllLeds` sweep saves the same
per-binding cost across all ~80 bindings.

**`_catchUpChannel`, `_onTrackLoaded`, and the `track_samples`
listener pass `pos` into `_syncBeatCount`.** Each handler read
`playposition` for origin derivation, then let `_syncBeatCount`
re-read it via `_trackBeatF`'s fallback. Passing the already-read
value avoids the second `engine.getValue`. Saves ~20 redundant
reads per boot (boot settle runs up to 5 × 4 channels) plus one
per track load and per `track_samples` fire.

**Hotcue colour/position observers use the callback `v`.**
`makeConnection` delivers the new CO value as the first callback
argument; the observers were ignoring it and re-reading via
`engine.getValue`. Same value, one fewer mutex acquisition per
fire. 32 reads eliminated per track load (4 channels × 4 hotcue
slots × 2 COs). The `playposition` read inside each observer
stays — that's a different CO the observer isn't watching.

**`_trackMeta` returns a shared `EMPTY_META` sentinel for
unloaded decks.** Previously allocated a fresh
`{ duration: 0, fileBpm: null, samples: 0, outroEnd: 0 }` per
call. Unloaded-deck countdown LEDs repaint at ~32 Hz across four
channels; the shared object skips that allocation. No caller
mutates it (verified). Same pattern as `BOOT_WHITE_ENTRY` in
`lib-binding.js`.

## Readability

- **`_repaintFromPosition`** — `trackAbs` was a dead local used
  only to compute `trackFrac`. Inlined.
- **`_onPlayIndicator`** — comment documents the two independent
  refresh triggers (state change → virtual clock + beat LED
  repaint; `v === 1` → beat-count resync). The double refresh on
  play-start is intentional; `_ledCache` dedupes unchanged frames.

## Review notes (no code change)

- **`_patchActive` doesn't recurse into host's `_host`.** Reviewed
  as a possible hardening gap. Shipped `_host` values all
  reference base patches (no nesting), so the presence-based
  check is correct for every shipped preset. Recursion would
  require cycle detection for a config shape nobody writes. A
  future INTERNALS §4 edit could add "`_host` should reference
  base patches, not other overlays" if desired.
- **`_recompute` throw during patch mutation leaves
  `activePatches` mutated.** A cycle in an overlay's patch tree
  self-heals on the next toggle (the patch is already in the
  array, so the next press removes it, and the subsequent
  `_recompute` succeeds). A cycle in a base patch is a broken
  config — the preset is unusable by design. No change.
- **`_applyBinding`'s per-binding refresh is unreached in shipped
  code.** INTERNALS §21's phrasing ("direct callers still get a
  per-binding refresh") is conditional — describing behaviour if
  a direct caller existed, not asserting one does. Dead code is
  intentional scaffolding. No change.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No shipped-preset behaviour change

---

## [v1.0.12] — 2026-11-01

Small hardening + readability release. No shipped-preset behaviour
change.

## Fixed

- **Constructor validates `wbGain` before slicing.** `wbGain:
  undefined` (or `null`) crashed at construction with
  `.slice()` on undefined. `wbGain: 'foo'` (string) survived
  construction — strings have `.slice` — but fed `NaN` through
  `_channelEmit`'s white-balance multiplication, silently
  degrading calibrated schemes to uncalibrated. Now validates
  with the same warn-once + `[1,1,1]` fallback pattern as
  `channelPerceptual` (which sits immediately above it in the
  constructor). Warning key: `wbGainShape:<label>`.

## Performance

- **`_renderDeviation` boot-white fallback uses a shared
  module constant.** The deviation-LED fallback for a knob
  that has never reported was allocating
  `{ rgb: [127,127,127], brightness: 127, brightnessOff: 127 }`
  fresh on every render. Hoisted to `BOOT_WHITE_ENTRY` at
  module scope. `_sendColor` reads indices only — no mutation,
  safe to share. Bounded win (fires only before the first
  knob turn), zero behavioural change.

## Documentation

- **`_armOwnConn` value listener** — comment explains why the
  listener reads `getParameter` instead of using the callback
  `v`. The callback value is the raw CO value; co-match's
  deviation maths needs the normalised [0,1] parameter, and
  for ranged COs (`rate`, `pitch_adjust`) the two differ.
  Standard [0,1] COs (EQ, pregain, volume) are unaffected,
  but the read is load-bearing for custom bindings. Prevents
  a future "obvious optimization" from breaking co-match on
  ranged COs.

## Review notes (no code change)

- **`_patchActive` doesn't recurse into host's `_host`.**
  Reviewed as a possible hardening gap. Shipped `_host` values
  all reference base patches (no nesting), so the presence-based
  check is correct for every shipped preset. Recursion would
  require cycle detection for a config shape nobody writes.
  Future INTERNALS §4 edit could add "`_host` should reference
  base patches, not other overlays" if desired.
- **`_recompute` throw during patch mutation leaves
  `activePatches` mutated.** Reviewed as a possible recovery
  gap. A cycle in an overlay's patch tree self-heals on the
  next toggle (the patch is already in the array, so the next
  press removes it, and the subsequent `_recompute` succeeds).
  A cycle in a base patch is a broken config — the preset is
  unusable by design. Rolling back state would mask the
  underlying problem. No change.
- **`_applyBinding`'s per-binding refresh is unreached in
  shipped code.** Reviewed as a possible dead-code / doc
  mismatch. INTERNALS §21's phrasing ("direct callers still
  get a per-binding refresh") is conditional — describing
  behaviour if a direct caller existed, not asserting one
  does. Dead code is intentional scaffolding. No change.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No shipped-preset behaviour change

---

## [v1.0.11] — 2026-11-01

Performance-focused release plus small UX and warning improvements.
No shipped-preset behaviour change except the intro/outro marker
LEDs, which now stay dimly visible when unset.

## Performance

**`_onPlayposition` uses the callback value instead of re-reading
`playposition`.** `makeConnection` delivers the new value as the
first callback argument, and every other CO listener in the file
already uses it — `playposition` alone discarded it and called
`engine.getValue` for the same value. `playposition` fires at
audio-buffer rate (~690 Hz per playing deck at 64-sample
buffers), so the old path was taking ~2,760 control-object
mutex acquisitions per second across four playing decks — the
audio thread contends on the same mutex. Now zero. Playback
states (play / pause / seek / reverse / loop wrap) update
identically because the callback value *is* the new position.
The `undefined` fallback covers test mocks and future Mixxx
variation.

**Hotcue colour CO read eliminated from render path.** Hotcue
and phrase LEDs using `colorScheme: 'mixxx'` were regex-matching
`outKey` and re-reading `hotcue_N_color` on every render. The
colour CO name is now precomputed at bind time, and its value is
cached on the binding — seeded at bind, kept current by the
existing colour listener. Same pattern as `_lastOutKeyValue`,
`_lastCoValue`, and `_csOn.cachedValue`. Removes one regex
match and one mutex acquisition per mixxx-typed LED per sweep
(sweeps happen on track load, patch swap, focus change, and
hotcue state / colour change).

**`applyBeat` no longer slices `entry.rgb` on brightness-only
cascades.** The common case — bar / phrase boundaries that only
override brightness — was allocating a fresh rgb array that was
never replaced. Deferred the slice to when the cascade actually
supplies a new colour. ~660 allocations/sec saved on a typical
20-LED playback sweep.

**`_sampleSnap` / `_sampleBlend` no longer allocate per-candidate
wrapper objects.** Both functions built intermediate
`{ t, color }` / `{ rgb, brightness, type }` objects inside the
scan loop. Index-tracked now — one allocation per sample call,
identical behaviour. ~5,400 small objects/sec churned during
knob turn (deviation LEDs sampling at ~30 Hz).

## Warning improvements

**`_warnIfFreshScheme` now catches fresh-array scheme
functions.** The warning exists to catch scheme functions that
return a structurally-identical-but-different-reference value
each call (which forces a recompile every render) — but the
guard silently skipped arrays. `scheme: function() {
return [127,0,0]; }` was the same trap as a fresh object, and
now warns.

**`_warnIfFreshScheme` stops re-stringifying after warning.**
Two `_stableStringify` calls per render used to run forever for
a buggy config, because the warn-once guard sat below them. Now
the guard sits above. No effect on well-behaved configs.

**`_buildSegments` warns on unresolved colour specs.** A typo
in a scheme's `colors` array (`'gren'` for `'green'`) silently
dropped the segment — no warning, no error, just a scheme with
fewer stops than the config declares. Now warn-onces with the
bad spec. No effect on shipped schemes.

## UX

**Intro / outro marker buttons stay dimly visible when unset.**
`markerCell` / `markerCellShift` previously set brightness-off
to 0, so the marker LEDs went fully dark when the marker wasn't
set — indistinguishable from a dead LED or an unused cell.
Brightness-off is now 12 (`DEFAULT_RGB_BRIGHTNESS_OFF`), so the
unset state shows a dim version of the marker colour (or dim
red under shift). Only affects the four row-3 marker cells in
the hotcue2 overlay.

## Tests

- `integration-bottom.test.js` — "hotcue2: row-3 LED follows
  `_enabled` (off)" updated to assert `hw = 12` and rgb
  `(0, 127, 0)`. Previous assertion was `hw = 0` (fully dark).
  Aligns with the marker dim-when-unset change above; only
  the off-state brightness assertion changed, on-state test
  was already correct.
  
## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No shipped-preset behaviour change beyond marker LED
  visibility

---

## [v1.0.10] — 2026-11-01

## Changed

- **`parseNum` is strict about malformed fractions.** `'1/0'`,
  `'5/'`, and `'1/2/3'` now return `NaN` instead of silently
  falling back to the leading integer (`1`, `5`, `1`). Affected
  shipped configs: none.
- **`resolve()` bails out early on token-free strings.** Two
  `indexOf` guards — one at function entry, one per token
  iteration. No behavioural change; focus-flip rebinds are
  measurably cheaper.

## Fixed

- **`_stableStringify` detects cycles.** Previously recursed
  until stack overflow if a binding cfg held a cyclic
  reference. Now warn-onces (`stableStringifyCycle`) and
  substitutes `"[cycle]"` at the cycle point. Unreachable from
  any shipped config; hardening. Diamond references serialise
  normally.
- **`_warned` uses `Object.create(null)`.** A warn key
  colliding with `Object.prototype` (`toString`, `constructor`,
  `__proto__`) inherited truthy and was silently swallowed.
  All shipped keys are prefixed, so unreachable today —
  one-line hardening. Two reset sites updated (lib-core,
  lib-controller-boot).

## Documentation

- **README** — clarified how `midiChannel` is used. It controls
  input routing (MIDI note-on/note-off) and the K2 fallback
  output (`sysex: false`) only; SysEx LED output is port-scoped
  by the `<controller id="...">` binding in each `.midi.xml`.
  The `0x0E` byte in the SysEx frame is a fixed command-header
  byte — shared by the RGB write and release commands, invariant
  across LED indices — not a channel. Confirmed empirically
  (Cat on `0x0E` and Kitten on `0x0D` emit identical 14-byte
  frames to their respective ports and both render correctly).
  The "fight over outputs" warning now describes the actual
  failure mode: shared input bindings, one preset's LED state
  driven by the wrong physical unit.
- **`beatLevel`** — comment clarifying that `prePhraseBeats`
  marks a single beat, not a duration.

---

## [v1.0.9] — 2026-11-01

Dead code removal. No runtime behaviour change on shipped presets.

## Cleanup

**Transaction `type` field removed.** `_captureTransaction` was
snapshotting `binding.type` onto `_transaction.type`, and
`_orphanTransaction` was comparing it against the current
binding's type. Hardware type is fixed per control in
`_buildHardware` (an encoder is always an encoder), so the
comparison was a tautology — it could never contribute to
orphan detection. Removed from the transaction init, from
`_captureTransaction`, and from `_orphanTransaction`'s signature
comparison. The documented orphan-detection signature is now
`group`, `inKey`, `func`, `funcArgs`, `buttonMode`.

**`_accel` binding field removed.** Listed in `_BINDING_FIELDS`
with `ignored: true` as a leftover from a removed acceleration
feature. Never written, never read, never audited against
`_bindingDefaults` (which doesn't define it). Removed from
`_BINDING_FIELDS`; the derived `_SNAPSHOT_IGNORED` list is
shorter by one entry. `_auditBindingCfg`'s warn-once for the
non-underscore `accel:` config key is unchanged — that's the
migration check for user configs, not the binding-side field.

## Docs

- `docs/INTERNALS.md` §2.5 — transaction lifecycle paragraph
  drops `type` from the captured-field list.
- `docs/INTERNALS.md` §2.5 — signature paragraph moves `type`
  from "fields compared" to "fields excluded", with a note on
  why (hardware type is immutable per binding).

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No behaviour change on shipped presets
- `node test/run.js` green

---

## [v1.0.8] — 2026-11-01

Phrase-origin correction after a mid-session track swap; FX layout
unit 2 aligned with unit 1; chord/overlay and lab-bake docs
corrected.

## Bug fix

**Phrase colours stayed stale until play after a paused track
swap.** `_onTrackLoaded` and the `track_samples` observer both
ran `_deriveOriginFromPosition` and `_syncBeatCount` before
Mixxx's queued `duration` / `file_bpm` emissions had landed — so
`_phraseOrigin[ch]` and `st.count` were computed from the
outgoing track's metadata. The `duration` / `file_bpm`
observers cleared the cache and repainted LEDs but never
re-derived origin or count, so a paused deck kept the wrong
cascade colour until the user played, jogged, or seeked. Both
observers now re-read `playposition`, re-derive origin, and
re-sync count with settled metadata. User-visible: load a track
while paused and the phrase colours are correct immediately;
no play needed.

## Changed

- **`FX_LAYOUTS[2]` now shares unit 1's Moog → Echo → Moog
  layout.** The Bitcrusher overrides were commented out — unit 2
  is a copy of unit 1 for users running a duplicate FX chain on
  the second unit. `fx-presets/2-2ndEchoMoog.xml` added as the
  pairing preset for the shipped unit-2 layout.
  `fx-presets/2-EchoBit.xml` is retained but no longer pairs
  with the shipped layout — users who want the old Bitcrusher
  behaviour on unit 2 should restore the commented overrides in
  `xone-k3-cat-fx.js`.

## Docs

- `README.md` focus-mode cell table, Row 0: unit 2 column no
  longer bolds the four cells that used to differ from unit 1
  (`knob2_0`, `knob3_0`, `button2_0`, `button3_0`).
- `README.md` shipped FX presets table: `2-2ndEchoMoog.xml`
  added (Moog → Echo → Moog); `2-EchoBit.xml` row marked as
  pairing with the pre-v1.0.8 unit-2 layout.
- `README.md` §CHORD: `grid2_1` line corrected. The chord +
  slip cell is not declared on `CHORD`; it routes through
  `CUE_SHIFT.grid2_1` / `LOOP_SHIFT.grid2_1`, each branching
  on `modifiers.chord`.
- `docs/INTERNALS.md` §9: removed the `grid2_1` line from the
  CHORD cell list; added the shift-companion routing
  explanation.
- `docs/INTERNALS.md` §17: lab `colorSet` persistence note
  corrected — save/load paths strip it via `_cloneScheme`,
  bake paths do not use `_cloneScheme` but are safe because
  `bakeScheme` builds a fresh object from `segs[].color`.
- `xone-k3-kitten.js` header comment: corrected to describe the
  actual boot config (`initialActiveDeck` / `initialActiveFx`
  both `'A'`, not `'B'`).

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- **FX unit 2 default layout changed** — pair with the new
  `2-2ndEchoMoog.xml`, or restore the overrides in
  `xone-k3-cat-fx.js` to keep using `2-EchoBit.xml`
- No other config changes required beyond reloading the preset
- `node test/run.js` green

---

## [v1.0.7] — 2026-10-31

Chord + overlay LED fix. Config-only change; runtime untouched.
No .midi.xml changes.

## Bug fix

**Slip button stayed slip-coloured while an overlay was
active under chord.** `CHORD.grid2_1` had no `colorScheme`,
no `group`, no `outKey` — the binding's `_refresh` fell
through every branch and sent nothing, so the LED kept the
pre-chord frame (the slip colour) until shift or layer was
released. Chord is pushed last in `_buildStack`, so it
shadowed the overlay's own `grid2_1` — which has the correct
colour and CO. User-visible: with fxRouting or selectAB open
under chord, `grid2_1` now shows that overlay's colour and
on/off state (yellow / dim yellow for the FX2→Ch3 route;
cyan / dim cyan for `selectedFxB === 3`) from the moment the
overlay appears, matching the state after releasing shift and
layer.

## Behaviour

- `CHORD.grid2_1` removed. The binding now falls through to
  whichever overlay is active (`SELECT_AB_SHIFT` /
  `FX_ROUTING_SHIFT`), or to the slip companion
  (`CUE_SHIFT` / `LOOP_SHIFT`) when none is.
- `CUE_SHIFT.grid2_1` / `LOOP_SHIFT.grid2_1` dispatch
  `toggleLayerOverlay` when `modifiers.chord` is held,
  `toggleActiveDeck` otherwise. Chord + slip without an
  overlay still toggles hotcue2 / loopOdd, unchanged.
- Chord + slip **with** an overlay active now performs the
  overlay's own `grid2_1` action (toggle the FX2→Ch3 route;
  select FX unit 3 into slot B) instead of toggling the layer
  overlay. Overlay switching between fxRouting and selectAB
  already worked via `_addOverlayWithSiblingClear`; the LED
  was the only thing not reflecting the swap.

## Docs

- README §CHORD: `grid2_1` line updated.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No runtime changes
- No other config changes required

---

## [v1.0.6] — 2026-10-30

Modifier-state fallout, THEME mutation propagation, snake exit
ergonomics. Small config-adjacent changes; runtime touched in
five files. No .midi.xml changes.

## Correctness fixes

**`ledSelectMarker` read `ctrl.isShifted` — a property the
modifier-state rework removed.** Dead branch, so shift+press on
the colorLab marker LED behaved identically to normal press and
never cleared the marker. Switched to `ctrl.modifiers.shift`.
User-visible: shift+press now deletes the marker as `LAB.md`
advertises.

**In-place `THEME` array mutation didn't repaint.** Emitters
returned the raw `THEME.deck[n]` / `THEME.fx[n]` value; the
binding's ref-identity memo (`_evaluateScheme`) compared by
reference and skipped recompile. `THEME.deck[3][0] = 100` left
the LED stuck at the old colour. Added a content-keyed
`CAT.themeScheme(kind, n)` helper — same approach as the
existing `fxScheme` — and rerouted `slipScheme`,
`activeSlotButton`, `deckSelect`, `fxSelect`, and `FX_COLOR_MAP`
through it. Assignment-replacement worked before and still
works; in-place mutation now propagates on the next render.
User-visible: channels 3/4 deck themes and any array-valued
`THEME.fx` entry can now be recoloured at runtime without
assignment.

**`inspect('why', name)` blamed the wrong on-source.**
`_verdictFor` checked `outKey` ahead of `_csOn` conditionals,
and `state` ahead of `patchActive`, the reverse of `_evalCsOn`'s
priority. Reordered to patchActive → co → state → outKey.
Debug-only; no runtime behaviour change.

**Press dispatch used `this._func`, not the captured func.**
`Binding.input`'s press-path dispatch read the current binding's
func even after `_onBindingPress` could have rebound the binding
via a modifier-driven patch swap — so press ran the new func
while release (via `_dispatchCapturedRelease`) ran the old one.
Now reads `_transaction.func` / `funcArgs` when the transaction
is active, mirroring the release path. No shipped patch triggers
this; the constraint is now enforced in code rather than by
convention.

**Toggle-mode bounce guard missed the push→toggle rebind-mid-
hold case.** A push binding rebound to toggle while held had its
push guard skipped (the guard reads the *current* mode) so a
hardware bounce reached the toggle branch and dispatched the
captured push func a second time. The toggle guard now also
returns when `_transaction.active`. Release still routes through
`_dispatchCapturedRelease`, which ignores `_togglePressActive`.

**Snake overlay could be left stuck in `activePatches`.**
`F.snakeExit` cleared `ctrl._snake` before `_batchPatches` ran.
A throwing mutator (contract-allowed; `_batchPatches` re-throws)
left the overlay installed with `_snake === null`, and every
snake func — including `snakeExit` — was guarded by
`if (!ctrl._snake) return`. Two-part fix: null `_snake` before
the batch (so `CHORD.press2`'s `on: { state: '_snake' }` LED
reads false during the recompute — previously it stayed lit
until the next input), and restore on throw so a retry works.

## Snake exit ergonomics

**Any button except `layer` / `shift` now exits immediately.**
Previously only `press2` exited, and playfield cells exited only
when the game was dead or won. Now every button except `layer`
and `shift` — the two game controls, which stay as turn left /
turn right (and start) during play — exits on press, in any
pre-dead state. Fast-out for accidental chord + `press2` entry:
one tap on any other button. When the game is dead or won,
`layer` and `shift` also exit (press-any-key pattern unchanged).

## Hardening

**`_csOn` assigned before the CO listener is wired.**
`_parseCsOn` previously called `_wireCsOnConnection` before
setting `b._csOn`. Mixxx currently defers CO callbacks, so the
order didn't matter; a synchronous fire (future Mixxx, test
mock) would read `_csOn === null` and fall through to the
`outKey` branch. Reordered.

## Docs

- `docs/INTERNALS.md` §10 clock connection table: count
  corrected from 9 to 12; added `outro_end_position`,
  `duration`, `file_bpm` rows.
- `CHANGELOG.md` added, seeded at v1.0.6. History prior to
  v1.0.6 reconstructed from GitHub Releases.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No config changes required
- No shipped-preset behaviour change

---

## [v1.0.5] — 2026-10-30

Lab bake rework. Config-only change; runtime untouched. No
.midi.xml changes.

Replaces the sampled/wire bake levels with four levels that all
preserve the source stop count. Calibration is bisected into
stop brightness at bake time; export additionally bakes white
balance into rgb.

## Bake levels

| Slot | Name | Stops | interp | calibration |
|---|---|---|---|---|
| 12 | structural | source rgb+br | live (source) | live on reload |
| 13 | baked+interp | source rgb, bisected br | forced true | baked off |
| 14 | baked | source rgb, bisected br | forced false | baked off |
| 15 | export | wb-applied rgb, bisected br | live (source) | baked off |

`curve`, `schemePosition`, `ratio` stay as live fields on every
level. `brightnessScale` is live on structural, baked into the
bisect on the other three.

## Which one to paste

- **12 structural** — same stops as your edit buffer, everything
  still live. Use this to keep editing after paste.
- **13 baked+interp** — paste and forget for this runtime, smooth
  blending. Matches source for any tuning.
- **14 baked** — paste and forget, snapped bands.
- **15 export** — hand-off to a foreign script or machine. White
  balance baked in; reloading here double-applies wb — don't ship
  as a runtime scheme.

## Code

- `LAB_SLOT`: `SOURCE` / `SAMPLED` / `WIRE` gone.
  `STRUCTURAL=12`, `BAKED_INTERP=13`, `BAKED=14`, `EXPORT=15`.
- `LAB_SLOT_COLOURS`: 12 blue, 13 cyan, 14 magenta, 15 orange.
- `bakeScheme` — per-segment emit replaces the 23-point resample.
  `bakeCal` covers bakedInterp / baked / export; `bakeWb` only
  export.
- `_applyAutoBake` writes the four slots.
- `_previewLabel` returns `structural` / `baked+interp` / `baked`
  / `export`.

## Docs and tests

README and docs/LAB.md updated: cell colours, per-stage matrix,
"what each bake keeps", preview-vs-hardware, paste-which list.
Matrix "which one to paste" lives in README, not LAB.

`test/lab-bake.test.js` and `test/lab-model.test.js` updated to
the new slot keys and levels.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No runtime changes
- `node test/run.js` green

---

## [v1.0.4] — 2026-10-29

hotcue2 overlay. Config-only change; runtime untouched. No config
changes required beyond reloading the preset.

Replaces the hotcue916 chord + slip overlay on the cue layer.

## Layout

**Row 2** (unchanged): hotcues 9, 10, 11, 12 with
phrase-colour-on-create, clear on shift+press.

**Row 3** (new): intro_start / intro_end / outro_start /
outro_end markers, bound to Mixxx's _activate / _clear /
_enabled COs.

| Action | Behaviour |
|---|---|
| Press (unset) | Sets marker at playhead |
| Press (set) | Seeks playhead to marker |
| Shift+press | Deletes marker |
| LED | Lit while set, dark while unset |

Colours: green / lime / amber / orange. Shift layer red.

Marker activate seeks only — no jump-and-play variant. Matches
Mixxx UI.

## Renames

- `hotcue916` → `hotcue2` in CAT_LAYERS and the chord overlay.
- Helper funcs: `hotcuePhrase` / `hotcuePhraseClear` (was
  `hotcue916` / `hotcueClear916`); added `markerCell` /
  `markerCellShift`.

## Docs and tests

README, INTERNALS §9, CUSTOMISE §1.8, GLOSSARY, AI-HELPER
updated. 11 new row-3 tests.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No runtime changes

---

## [v1.0.3] — 2026-10-29

Correctness and defensive fixes. No config changes required.
**No shipped-preset behaviour change.**

Follow-up to v1.0.2. Sweep for edge-case bugs and defensive
guards the shipped presets don't hit but custom configs might.

## Correctness fixes

**`_refresh` outKey-only fallback sent `(127,0,0,0)` instead of
`(0,0,0,0)`.** A binding with `outKey` but no `colorScheme`
takes a fallback that reads `v ? 127 : 127` — always 127. The
LED is still dark (hw=0) but `_ledCache` dedupes against the
wrong tuple and `inspect('why')` shows a phantom R channel for
the off state. Shipped presets all have `colorScheme` on their
outKey bindings so this path never runs — custom config only.
One-character fix.

**`_refreshBeatLeds` gated on the base scheme's beat deck, not
the function scheme's.** A binding with both a base `scheme`
(beat on deck A) and a `schemeFromState` function (beat on
deck B) refreshed on the wrong channel's beat edges. Now uses
`_evaluateScheme()` — the same compiled scheme the render path
uses — as the single source of truth.

**`_loadSelectedOntoChannel` had no range guard.** `args[2] =
5` with loadArm held (pressR) wrote to a nonexistent
`[Channel5]`. Guard now rejects out-of-range before the write.

**`encQuickFxCycle` divided by zero when `QFX_CHAIN_LIST` was
empty.** `% 0` → NaN → `setValue(…, NaN)`. Early return.

## Defensive fixes

- `channelPerceptual` length validated at construction. Short
  array (`[1, 1]`) silently killed the blue channel; NaN
  coerced to 0 by the bit-AND in the sysex encoder. Warns once
  at boot, falls back to `[1,1,1]`.
- `Binding.input` no longer calls `getParameter` on unbound
  pots. Focus mode's `encoder2: null` was triggering a wasted
  call per MIDI event.
- `replacePatch(from, from)` early return. Previously fired a
  full recompute and a `_onPatchChange('cue', 'cue')` event for
  a semantic no-op.
- `_recompute` wraps `_afterRecompute` and `_refreshAllLeds` in
  try/catch. A throwing subclass hook (LabController) or a
  connection error in `_syncBeatClocks` no longer skips the
  trailing state stamp (which triggered spurious
  "outside a recompute" warnings) or the LED sweep.

## Cleanup

- Duplicate comment above `encBpmOrHeadMix` removed.
- Dead `X.VIRTUAL_CLOCKS` reset removed from `test/run.js`.

## Tests

**22 new tests.** Each fix has a direct regression test; plus
contract tests for `_applyBinding` skipRefresh, `_reapplyByTokens`
resolved-hash skip, `_batchPatches` mutator restrictions,
`_evalOnCoValue` cached value, shutdown captured-release
suppression, `_dispatchCapturedRelease` throw recovery, and a
custom-func co-match cache case.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No new script files
- No config changes required
- No shipped-preset behaviour change

---

## [v1.0.2] — 2026-10-29

Hardening + burst CO-read elimination. No config changes
required. No user-visible behaviour change on shipped presets.

Follow-up to v1.0.1.

## Hardening

**`PHRASE_HOTCUE_SLOTS` rejects non-integer entries.** A config
like `[9.5, 10, 11]` previously passed both the runtime slot
list and the boot validator, seeded a connection to a
nonexistent CO, and had no effect — silent. Now dropped at both
layers, with a warn naming the constraint (integer between 1
and `MIXXX_HOTCUE_LIMIT`).

**Toggle-mode bounce guard.** Push-mode was already protected
by the transaction model. Toggle-mode was not: a bouncing pad
fired the action twice with no release between, flipping the CO
back — one press, no change. `_togglePressActive` now rejects
the second `v>0` until the physical release clears it. Real
double-presses (with a release between) are unaffected.

The clear runs on every button release, not just when the
current mode is toggle. This closes the toggle→push→toggle
rebind case — without it, a binding pressed as toggle, rebound
to push mid-hold, released, then rebound back to toggle would
leave the flag stuck and swallow the next press.

## Burst CO-read elimination

Every LED render sweep re-read each binding's `outKey`, `on.co`,
`schemeFromState.co`, and (for deviation LEDs) the knob's
co-match value. Those COs already had listeners — the callback
only triggered a repaint, it never cached the value. So a burst
of `_refreshAllLeds` calls issued ~55-65 CO reads per sweep,
contending with the audio thread on Mixxx's CO mutex.

Four caches:

- `Binding._lastOutKeyValue` — seeded at bind, updated by the
  outKey listener
- `Binding._lastCoValue` — seeded at bind for knob/fader
  bindings, updated by the value listener
- `_csOn.cachedValue` — seeded at bind, updated by the on.co
  listener
- `sd.cachedValue` — seeded at bind, updated by the
  schemeFromState.co listener

Each falls back to a live read when undefined (before the first
listener fire). Staleness window is one event-loop turn — the
same deferral Mixxx's `makeConnection` already has.

`_lastCoValue` is also refreshed synchronously inside `input()`
after dispatch. Without this, a knob's own write updated the CO
synchronously but the cache only on the next event-loop turn,
so a deviation LED sampling the knob flashed a spurious
co-match gradient on every MIDI event. The read-back is in
`input()` rather than `_defaultInput`, so it covers both the
default path and custom funcs that write to the binding's own
CO.

**Net reads eliminated:**
- Track load (11 sweeps): ~600
- Focus change (1 sweep): ~55
- Patch swap (1 sweep): ~55
- Steady state: unchanged (listeners only fire on change)

## Bug fix

`_evalOnCoValue` restored in `lib-binding.js`. It had been
dropped during the multi-pass edits of the cache work. Any
`colorScheme` with `on: { co: ... }` would have thrown from
`_evalCsOn` and painted the LED black. No shipped preset uses
`on.co`, so no user-visible breakage — but the API was broken
and two test files hit it.

## Behaviour-preserving cleanups

- `_resetBeat` skips the redundant `_refreshBeatLeds` call
  after `_refreshAllLeds` (beat LEDs are a strict subset of
  that sweep), with a defensive fallback for the re-entrancy-
  guard case.
- `_buildStack` computes `_patchActive(name)` once per patch
  instead of twice per `_noModifiers` patch.

## Tests

- `_validatePhraseHotcueSlots`: non-array, out-of-range,
  duplicate, non-integer
- `_phraseHotcueSlots`: non-integer rejection
- Toggle bounce: no double-flip; release-then-press toggles
  correctly; toggle→push→release→toggle does not swallow the
  next press
- All four caches: seeded, updated, `_isOn` reads cache, stale
  window recovers, `coMatchSample` fallback, synchronous
  read-back after `input()`
- Integration tests updated for the bounce guard (add
  `H.release` between back-to-back `H.press` calls on toggle
  buttons) and for cached CO semantics (`H.fireCO` /
  `engine._trigger` where a CO change must be observed)

## Debounce

The time-based `DEBOUNCE_MS` approach from an earlier
iteration is NOT re-introduced. It swallowed fast legitimate
double-taps. The state-based `_togglePressActive` guard covers
the realistic hardware-bounce case without penalising fast
user actions. The remaining `press→release→press` window is a
broken-switch scenario, already accepted as out of scope.

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No new script files
- No config changes required

---

## [v1.0.1] — 2026-10-29

Polish and hardening release. No config changes required for
existing presets.

**No bugs in this release were observed in real use.** The fixes
are all edge cases, silent-failure paths, and configs nobody has
shipped. If v1.0.0 has been working for you, the behaviour you
see is identical.

## Behaviour shifts (narrow)

- Boot adapts to slow CO trees — catch-up reschedules up to
  `BOOT_MAX_ATTEMPTS` while boot-relevant fires are still landing
- Stale phrase origin after a track swap while beat LEDs were off
  is corrected at catch-up

## New tuneables

All defaults reproduce v1.0.0 behaviour — setting either to its
default is a no-op.

- `PHRASE_HOTCUE_SLOTS` — hotcue slots scanned for marker colours
  (default `[9, 10, 11, 12]`). Reduces observer connections from
  32 to 8 per channel. Range is fixed at boot; hotcue contents
  within those slots remain live via observers.
- `BOOT_SETTLE_MS` (100), `BOOT_MAX_ATTEMPTS` (5) — boot settle
  loop timing

## Silent-error hardening

Warns or falls back where the runtime previously misbehaved
silently:

- Uncaught throws from binding funcs, CO observers, and modifier
  hooks now warn-once and continue
- Scheme `offScheme` / `coScheme` cycle detection (was infinite
  recursion)
- `colorScheme.knob` pointing at a button/encoder (was stuck
  boot-white)
- Short `wbGain` config (was silent blue kill)
- Array scheme refs in `composeScheme` (was silent null)
- Non-finite `parseNum` results (was `Infinity` written to a CO)
- Fractional / non-finite `setTimeSig` args
- Out-of-range `initialDeckA/B` / `initialFxA/B`

## Additions

- `$DECK_ACTIVE$` support in the countdown scheme — countdown
  LEDs can follow deck focus
- Push-mode bounce guard — hardware bounce no longer resets
  per-press flags mid-hold

## Removed

- `HOTCUE_MAX` — deprecated in v1.0.0, superseded by
  `PHRASE_HOTCUE_SLOTS`

## Compatibility

- Mixxx 2.5
- Preset `.midi.xml` schema unchanged
- No new script files

---
