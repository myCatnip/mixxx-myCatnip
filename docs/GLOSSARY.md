# Glossary

| Term | Meaning |
|---|---|
| **Active deck** | Which of the two deck slots (A / B) is currently live. |
| **Active FX** | Which of the two FX slots (A / B) is currently live. |
| **Alt** | The slot that isn't focused. `$DECK_ALT$`, `selectedFxAlt`, etc. |
| **Bake** | In colorLab, an automatic rewrite of the preview scheme into one of four output slots. Bakes the perception brightness solve (and optionally WB) into the emitted stops. See LAB.md. |
| **Beat cascade** | The colour sequence driven by the beat count: `prePhrase > phrase > bar > beat`. |
| **Beat count** | `floor(absolute beat) - phrase origin + 1`. Drives the cascade. |
| **Beat paused mode** | Same three values, applied when the deck is paused. Default `'solid'`. Set via `myCatnip.BEAT_PAUSED_MODE`. |
| **Beat playing mode** | What a beat LED shows while its deck plays: `'pulse'` (default), `'solid'`, or `'off'`. Set via `myCatnip.BEAT_PLAYING_MODE`. |
| **Beatjump gate** | Blocks a beatjump on a channel in an active loop when less than `BEATJUMP_GAP_MS` (130 ms) has passed since the last loop-touching event on that channel. The timestamp lives in `shared.lastLoopTouchMs[ch]` — two controllers on the same channel share the gate. |
| **Binding** | One physical control's full definition: which Mixxx CO it acts on, what its LED reads, what the LED looks like, optional custom func. |
| **Brightness solve** | The perception step that bisects the wire `hw` byte to hit a target perceived luminance. Runs on deviation LEDs and co-match; static LEDs pass the scheme's brightness through. Part of `myCatnip.perception.solveBrightness`. |
| **Chord** | Shift + layer, held. Reaches overlays and top-half mode swaps. Tracked as a modifier state (see **Modifier state**). |
| **CO** | Mixxx control. `[Channel1],play`, `[EffectRack1_EffectUnit1],mix`, etc. |
| **Co-match** | A steering gradient shown on a deviation LED when the physical knob disagrees with its bound CO. Turn until they match. |
| **colorLab** | The LED ramp editor preset. Separate layer tree, no playback. |
| **Deviation LED** | An LED with a `knob:` reference in its `colorScheme`. Samples a ramp at the knob's position. |
| **Display source** | Which timeline feeds the beat count: `track` or `loop`. |
| **Focus** | Which slot (A / B) the top half points at. Two axes: deck and FX. |
| **Func** | A JavaScript function replacing a binding's default input handling. `myCatnip.FUNCS.*`. |
| **FX layout table** | The per-unit cell mapping for the middle cells, one table per mode. |
| **Gap** | In colorLab, an extension cell the user hasn't set. Fill paints gaps; saving collapses them into real stops. |
| **Group** | A Mixxx group string. `[Channel1]`, `[EffectRack1_EffectUnit2]`, etc. |
| **HAL / hardware descriptor** | The plain-JS object a hardware provides: six methods (`buildBindings`, `wireInputs`, `send`, `blank`, `anyPendingWrites`, `decodeLedCache`) plus optional data blocks (`DEFAULTS`, `PERCEPTION`, `PALETTE`, `LED_TRANSFERS`, `MIXXX_COLORS`, `pacing`, `DEFAULT_RGB_BRIGHTNESS`). See HARDWARE.md. |
| **Host** | An overlay patch's `_host` field — the patches it may apply over. |
| **hotcue2 overlay** | Chord + slip overlay on the cue layer: row 2 shows hotcues 9–12 (phrase-colour on create), row 3 shows intro/outro markers (jump on press, set on shift+press). |
| **K2** | The K3's coarse discrete-colour transport fallback. Enabled with `sysex: false` on the whole controller. Three note buckets (red / amber / green) chosen by the r-g difference, plus a velocity dim scalar — not a perception-model wire. Disables perception mix end-to-end and discards the brightness solve's resolution. |
| **`labToggleMix`** | colorLab func that flips `ctrl._perceptionMixActive`. Clears `_ledCache` on toggle. (Was `labToggleWb` in v2.0.x; alias kept with warn-once.) |
| **Loop clock** | The virtual timeline. Accumulates the musical progress a loop would have made, seeded from the playhead when the loop starts, through wraps. |
| **Loop-odd overlay** | Chord + slip overlay on the loop layer: rows 2–3 become odd loop sizes. |
| **Main cue** | The track's primary cue point. Cleared by writing `1` to `[ChannelN],cue_clear`; writing to `cue_point` moves it. |
| **Marker** | A colour band on a scheme. Hits when the deviation LED's knob is within a `markerWidth`-wide band around `markerPosition`. |
| **Mix** | The perception step that corrects colour mix. Uses `wbGain` if present on the hardware's `PERCEPTION`, else an inverse LUT derived from the curves. Runs once per render in `ctrl.sendLED`. `PERCEPTION.mode.mix` declares whether it runs. |
| **Model A** | The K3-style emit model. Applies mix, then a weighted per-channel sum of the curves at `hw`, then gamma, then saturation boost. Dispatched when any of `wbGain` / `weights` / `gamma` / `hkBoost` is present on the hardware's `PERCEPTION`. |
| **Model B** | The simple per-channel sum emit model. Samples each curve at `rgb × hw / 127` and adds. Dispatched when no model params are present. A hardware with only `samples` gets Model B. |
| **Modifier state** | A named held-state (`shift`, `chord`, `loadArm`) derived from active transactions on a declared set of bindings (`heldBy`). |
| **Origin** | The beat number where "count 1" sits. Derived from marker hotcues. |
| **Orphaned transaction** | A transaction whose binding's config changed between press and release. Release dispatches against the captured config, not the current one. Sticky. |
| **Overlay** | A patch with `_host`. Applies on top of its hosts while active. |
| **Patch** | A named bag of bindings. Can inherit from other patches. |
| **`patchActivate`** | Modifier config option — the modifier idempotently adds/removes the named patch on every press/release event. |
| **Perception** | The model of how a hardware's wire bytes appear to the eye. Corrects colour mix and solves the wire brightness byte. Lives on the hardware's `PERCEPTION` block; applied by `myCatnip.perception.*` before `hw.send`. See PERCEPTION.md. |
| **`PERCEPTION`** | The hardware descriptor's data block: `curves` or `samples` or `custom`, plus optional `wbGain`, `weights`, `gamma`, `hkBoost`, and `mode: { mix, brightness }`. Absent = raw output. |
| **`_perceptionMixActive`** | Per-controller boolean kill-switch for the perception mix step. Default `(sysex !== false)`. Flipped by `labToggleMix`. Brightness solve is unaffected — only mix. |
| **Phrase** | One full cycle of the beat cascade. Default 4 bars × 4 beats = 16 beats. |
| **QFX** | Mixxx Quick Effect Rack. One per deck. |
| **Ramp** | A multi-stop scheme. Deviation LEDs sample it; static LEDs pick `ramp[0]`. |
| **Real stop** | In colorLab, a stop the user set (pressed, non-black, or loaded from a saved scheme). Fill anchors on these. |
| **Scheme** | An LED's appearance. Static (one colour) or deviation (a ramp sampled by position). |
| **`shared`** | Session-scoped state visible to every controller: `shared.timeSig[ch]`, `shared.lastLoopTouchMs[ch]`, `shared.warned`, `shared.controllers[label]`, `shared.rw`. Owner-write, everyone-read. |
| **`shared.controllers[label]`** | Per-controller published block: label, hw, midiChannel, activeDeck/Fx, selected* slots, activePatches, topMode, modifiers. Deleted on shutdown. Used for cross-controller LEDs. |
| **`shared.timeSig[ch]`** | Per-channel time signature `{ barBeats, phraseBars }`. Set via `setTimeSig(bb, pb, ch?)`. Read by the beat cascade and countdown schemes. `null` = use scheme defaults. |
| **`shared.lastLoopTouchMs[ch]`** | Per-channel beatjump throttle timestamp. Shared across controllers on the same channel. See **Beatjump gate**. |
| **Shift companion** | A patch paired with a base via `_shift`. Applies while shift is held. |
| **Stack** | The flattened binding map built from `activePatches` + shift companions + chord. |
| **Static LED** | An LED with no `knob:` reference. On/off only. Picks `ramp[0]` if given a ramp. Brightness solve is **skipped** — the scheme's `hw` passes through. |
| **Time signature** | Per-channel, stored in `shared.timeSig[ch]`. Set with `myCatnip.setTimeSig(barBeats, phraseBars, ch?)`. Reads as `{ barBeats, phraseBars }`. `null` = use scheme defaults. |
| **Token** | A `$NAME$` placeholder in a binding field that resolves at bind time. |
| **Top-half mode** | `focus`, `twoDeck`, or `twoDeckMini`. Inferred from which base patch is in `activePatches`. |
| **Track** | The default timeline: `playposition`, with beat 0 = file start. |
| **Transaction** | A physical push-mode press captured at press-time and dispatched at release against the captured config. Survives rebinds (as *orphaned*). |
| **Wire** | In colorLab, a bake level that freezes the perception brightness solve into each stop's brightness. |
| **`_noModifiers`** | Patch flag. When any active patch declares it, the entire modifier subsystem (shift companions, chord, enforcement) is suppressed. |