# Glossary

| Term | Meaning |
|---|---|
| **Active deck** | Which of the two deck slots (A / B) is currently live. |
| **Active FX** | Which of the two FX slots (A / B) is currently live. |
| **Alt** | The slot that isn't focused. `$DECK_ALT$`, `selectedFxAlt`, etc. |
| **Bake** | In colorLab, an automatic rewrite of the preview scheme into one of four output slots. See LAB.md. |
| **Beat cascade** | The colour sequence driven by the beat count: `prePhrase > phrase > bar > beat`. |
| **Beat count** | `floor(absolute beat) - phrase origin + 1`. Drives the cascade. |
| **Beat paused mode** | Same three values, applied when the deck is paused. Default `'solid'`. Set via `XoneK3.BEAT_PAUSED_MODE`. |
| **Beat playing mode** | What a beat LED shows while its deck plays: `'pulse'` (default), `'solid'`, or `'off'`. Set via `XoneK3.BEAT_PLAYING_MODE`. |
| **Beatjump gate** | Blocks a beatjump on a channel in an active loop when less than `BEATJUMP_GAP_MS` (130 ms) has passed since the last loop-touching event on that channel. |
| **Binding** | One physical control's full definition: which Mixxx CO it acts on, what its LED reads, what the LED looks like, optional custom func. |
| **Chord** | Shift + layer, held. Reaches overlays and top-half mode swaps. Tracked as a modifier state (see **Modifier state**). |
| **CO** | Mixxx control. `[Channel1],play`, `[EffectRack1_EffectUnit1],mix`, etc. |
| **Co-match** | A steering gradient shown on a deviation LED when the physical knob disagrees with its bound CO. Turn until they match. |
| **colorLab** | The LED ramp editor preset. Separate layer tree, no playback. |
| **Deviation LED** | An LED with a `knob:` reference in its `colorScheme`. Samples a ramp at the knob's position. |
| **Display source** | Which timeline feeds the beat count: `track` or `loop`. |
| **Focus** | Which slot (A / B) the top half points at. Two axes: deck and FX. |
| **Func** | A JavaScript function replacing a binding's default input handling. `XoneK3.FUNCS.*`. |
| **FX layout table** | The per-unit cell mapping for the middle cells, one table per mode. |
| **Gap** | In colorLab, an extension cell the user hasn't set. Fill paints gaps; saving collapses them into real stops. |
| **Group** | A Mixxx group string. `[Channel1]`, `[EffectRack1_EffectUnit2]`, etc. |
| **Host** | An overlay patch's `_host` field — the patches it may apply over. |
| **hotcue2 overlay** | Chord + slip overlay on the cue layer: row 2 shows hotcues 9–12 (phrase-colour on create), row 3 shows intro/outro markers (jump on press, set on shift+press). |
| **Loop clock** | The virtual timeline. Accumulates the musical progress a loop would have made, seeded from the playhead when the loop starts, through wraps. |
| **Loop-odd overlay** | Chord + slip overlay on the loop layer: rows 2–3 become odd loop sizes. |
| **Main cue** | The track's primary cue point. Cleared by writing `1` to `[ChannelN],cue_clear`; writing to `cue_point` moves it. |
| **Marker** | A colour band on a scheme. Hits when the deviation LED's knob is within a `markerWidth`-wide band around `markerPosition`. |
| **Modifier state** | A named held-state (`shift`, `chord`, `loadArm`) derived from active transactions on a declared set of bindings (`heldBy`). |
| **Origin** | The beat number where "count 1" sits. Derived from marker hotcues. |
| **Orphaned transaction** | A transaction whose binding's config changed between press and release. Release dispatches against the captured config, not the current one. Sticky. |
| **Overlay** | A patch with `_host`. Applies on top of its hosts while active. |
| **Patch** | A named bag of bindings. Can inherit from other patches. |
| **`patchActivate`** | Modifier config option — the modifier idempotently adds/removes the named patch on every press/release event. |
| **Phrase** | One full cycle of the beat cascade. Default 4 bars × 4 beats = 16 beats. |
| **QFX** | Mixxx Quick Effect Rack. One per deck. |
| **Ramp** | A multi-stop scheme. Deviation LEDs sample it; static LEDs pick `ramp[0]`. |
| **Real stop** | In colorLab, a stop the user set (pressed, non-black, or loaded from a saved scheme). Fill anchors on these. |
| **Scheme** | An LED's appearance. Static (one colour) or deviation (a ramp sampled by position). |
| **Shift companion** | A patch paired with a base via `_shift`. Applies while shift is held. |
| **Stack** | The flattened binding map built from `activePatches` + shift companions + chord. |
| **Static LED** | An LED with no `knob:` reference. On/off only. Picks `ramp[0]` if given a ramp. |
| **Token** | A `$NAME$` placeholder in a binding field that resolves at bind time. |
| **Top-half mode** | `focus`, `twoDeck`, or `twoDeckMini`. Inferred from which base patch is in `activePatches`. |
| **Track** | The default timeline: `playposition`, with beat 0 = file start. |
| **Transaction** | A physical push-mode press captured at press-time and dispatched at release against the captured config. Survives rebinds (as *orphaned*). |
| **Wire** | In colorLab, a bake level that freezes the calibration solve into each stop's brightness. |
| **`_noModifiers`** | Patch flag. When any active patch declares it, the entire modifier subsystem (shift companions, chord, enforcement) is suppressed. |