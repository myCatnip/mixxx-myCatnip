# AI-HELPER

Context for an AI assisting with this Xone K3 Mixxx mapping.
Presented alongside CONCEPTS, CUSTOMISE, INTERNALS, PERFORMANCE,
README, LAB, GLOSSARY. This file holds behavioural guidance —
rules, tone, and recognition patterns. Reference material lives
in the other docs; look it up when the request implies it.

---

## What the AI will do

- Verify Mixxx CO names against the manual — it will ask if it can't.
- Show diffs, not whole-file rewrites.
- Push back on requests the framework can't support.
- Remind the user to reload the preset after every edit.
- Say "I don't know" and ask rather than guess.

## What the AI won't do

- Rewrite the runtime to make one binding work — it'll say so first.
- Invent Mixxx control names.
- Change more than you asked for.

Reload after every edit: untick / re-tick the preset checkbox in
Preferences → Controllers.

---

## Doc map

When the request implies a topic, look it up:

| Topic | Doc |
|---|---|
| Binding, patch, stack, tokens, focus, colour schemes, timelines | CONCEPTS |
| How to change a colour / rebind / add a mode (recipes) | CUSTOMISE §1 |
| Field reference: binding fields, `on:` shapes, tokens, scheme fields, boot config, tunables, **annotated funcs** | CUSTOMISE §2 |
| Engine internals, caches, symptom table, limits | INTERNALS |
| What's cheap/expensive, what to tune, what you can't save | PERFORMANCE |
| colorLab editor | LAB |
| Physical layout, per-mode behaviour | README |
| One-line term lookup | GLOSSARY |

**Where changes happen.** Config files (cat-*, kitten, onek3,
onek3-minifx, colorlab) carry 95% of requested edits. Runtime
(xone-k3-lib-*.js) is shared — don't touch it unless asked.

---

## Rules

1. **DON'T EDIT THE RUNTIME** unless the user explicitly asks.
   If a request seems to need it, first check whether a config
   file can do it. If it genuinely can't, say so clearly and
   explain the blast radius.

2. **VERIFY EVERY MIXXX CONTROL NAME.** #1 failure mode. Do
   not invent inKey / outKey / group names. Look up in the
   config files you were given, or:

     https://manual.mixxx.org/2.5/en/chapters/appendix/mixxx_controls

   If you can't verify, ask. Never guess.

3. **PUSH BACK ON REQUESTS THAT DON'T FIT.** Say so plainly,
   explain why, suggest the closest workable thing. Do not
   silently rewrite the runtime to be "helpful".

4. **FRAME BEFORE ANSWERING.** If the request implies a wrong
   mental model, correct it in one sentence, then answer.

5. **SHOW THE EXACT DIFF.** Output the binding or scheme object
   that changes, with enough context to locate it. Don't
   rewrite whole files unless asked.

6. **ONE QUESTION** when ambiguous.

7. **REMIND THE USER TO RELOAD** after any edit — every time.

8. **OFFER FOLLOW-UPS IN ONE SENTENCE**, at the end.

9. **ADAPT TO THE USER'S LEVEL.**

---

## Style

- Answer first. Lead with the concrete thing, then explain.
- Never a preamble, never a summary, never a compliment.
- No paraphrasing the question back.
- Say the same thing once.
- Use tables, trees, code blocks when the answer has structure.
- Technical terms: gloss on first use.
- Match the user's level.
- Emphasis is for warnings, not decoration.
- Lead with the control, not the file.
- Info-dense doesn't mean minimal.
- It's fine to say "I don't know".

---

## Reading the user

  User phrasing                        → System concept
  ─────────────────────────────────────────────────────────────
  "page", "mode", "layout"             → patch or top-half mode
  "shift layer"                        → shift companion
  "temporary mode", "while held"       → overlay or shift
  "hold two keys to enter"             → chord
  "when X is on, show Y"               → colorScheme.schemeFromState
  "goes up with the knob"              → colorScheme.knob
  "flash" / "blink" / "pulse"          → scheme.beat
  "different colour for each X"        → schemeFromState with a list/map
  "combines both" / "does both"        → custom func
  "the colour of the pad"              → 'mixxx' scheme
  "expand this for a mode"             → overlay
  "route to whatever deck is selected" → tokens in group
  "keep the other controls live"       → overlay, not replacement
  "is this lit when X"                 → colorScheme.on
  "which deck / fx is live"            → activeDeck / activeFx
  "the other deck / fx"                → selected*Alt or $DECK_ALT$
  "swap the whole top half"            → setTopMode
  "single FX spanning both columns"    → mini mode / twoDeckMini
  "static LED shows blue"              → ramp on a static LED
                                          → FX_COLOR_MAP + schemeFromState
  "keep phrasing in sync through loop" → loop clock
  "anchor phrase at hotcue"            → PHRASE_MARKER_COLORS
  "which timeline am I showing"        → displaySource
  "is the loop clock running"          → activeLoopVirtual
  "swap mode flickers"                 → _batchPatches, not addPatch loop
  "beatjump doesn't fire after touching a loop control"
                                       → BEATJUMP_GAP_MS
  "beat LED out of sync on pitched"    → _channelRate reads
                                          rate_ratio, not rate
  "clear the main cue"                 → [ChannelN],cue_clear
  "set/clear intro or outro markers"   → [ChannelN],intro_start_activate /
                                          intro_start_clear (same trio
                                          for intro_end, outro_start,
                                          outro_end)
  "is the shift held" / "held button state"
                                       → modifiers.<name>
  "held across rebind / patch change"  → transaction

---

## When to say no

See CONCEPTS §10 for the model boundaries; below are the exact
phrasings plus the closest workaround.

  "Swap the whole top half when I press a button."
  → setTopMode (chord + pressR) or toggleMiniFx (chord + pressL).
    For a fourth mode: add to XoneK3.TOP_MODES and extend
    _resolveFxPatchName.

  "Keep the faders and encoders live while I show a different layout."
  → Overlay. Set `_host`.

  "Show the currently-routed FX on this knob."
  → Put `$FX_ACTIVE_N$` in the group string.

  "Make this knob follow the active deck."
  → Put `$DECK_ACTIVE$` in the group string.

  "Make this knob control the *other* deck."
  → Put `$DECK_ALT$` in the group string.

  "Make this knob control two things at once."
  → A func can write to two COs.

  "My beatjump doesn't fire after touching a loop control."
  → Beatjump gate. _beatjumpAllowed blocks it if less than
    BEATJUMP_GAP_MS has passed since the last loop-touching
    event on that channel. Set _debugPrintsOn for the gate line.

  "Make this fader feel more natural."
  → Add valueCurve. 2.0 exp, 0.5 log.

  "Make this button not double-fire."
  → No debounce field. Wrap the func with your own state.

  "Bind this to my custom Mixxx script."
  → I need the exact CO. Tell me the group and key.

  "Add a chord that does X."
  → Chord is a patch. Add a binding to CHORD.

  "Show a routing grid that sets which deck each side controls."
  → SELECT_AB. Same mechanics as a grid of k3Select.

  "Make the LED lit when X."
  → Add `on:` to the colorScheme.

  "My group-enable LED is always blue."
  → Ramp scheme on a static LED. Use schemeFromState alone
    with map: FX_COLOR_MAP. Don't pair it with a scheme: field
    — that fires csDoubleDynamic and the function is ignored.

  "A warning printed only once and now I can't see it."
  → _warnOnce dedupes. Reload the preset.

  "Print this warning every time."
  → Warnings are warn-once by design. For per-event output use
    debugPrint with a table entry.

  "Keep phrasing in sync through a loop."
  → The loop clock does this. Origin is also frozen during an
    active loop so count marches monotonically.

  "Anchor the phrase to a hotcue."
  → Add the hotcue's colour to PHRASE_MARKER_COLORS.

  "Set the phrase origin to X manually."
  → Origin is derived, not user intent. Move the playhead to
    X, or place a marker hotcue there and let
    _deriveOriginFromPosition do it on the next tick.

  "Which timeline am I showing right now?"
  → activeDisplaySource is 'track' or 'loop'.

  "Track pitch changes in the phrase clock."
  → Already does. _channelRate reads rate_ratio, so the loop
    clock scales with the deck's effective tempo.

  "The beat LED drifts on a pitched deck, loop reading only."
  → Verify _channelRate reads rate_ratio, not rate. Reading
    rate with a `<= 0` guard silently disables scaling.

  "Make a func see the *current* config on release after a rebind."
  → It sees the captured config by design; that's what makes
    rebind-during-hold safe. Read `this._transaction.orphaned`
    to branch when the press was orphaned by a rebind.

  "Track a held modifier in a func."
  → Read `this._ctrl.modifiers.<name>` — the state is derived
    from transaction activity on the declared `heldBy` bindings.
    See INTERNALS §2.5.

---

## AI failure modes

Five items where an AI is likely to guess plausibly but wrongly.
Verified against code or the Mixxx manual. The full INTERNALS
gotcha list is §21.

- **`chain_selector` is not an index.** It's a relative ±1
  encoder control with no readable value. For "which QFX chain
  is loaded", read `loaded_chain_preset` (0-based).

- **`[ChannelN],rate` is the slider position**, ~−0.08..+0.08,
  not a multiplier. Use `rate_ratio` for the deck's actual
  rate. A `<= 0` guard on `rate` silently returns unity on
  every pitch-down.

- **Main cue is not a hotcue slot.** To clear it, write `1` to
  `[ChannelN],cue_clear` (a `type: 'push'` binding handles the
  0 release). Writing to `cue_point` *moves* the cue; it
  doesn't clear it.

- **Intro / outro markers use a different CO trio than hotcues.**
  Naming pattern: `intro_start`, `intro_end`, `outro_start`,
  `outro_end`. Each has `_activate` (seek-if-set / set-if-unset,
  no play-mode variant like hotcue activate has), `_clear`
  (delete), and `_enabled` (read-only set/unset flag). `_position`
  is read-only for setting — writing it is silently ignored, so
  a `playposition` read/write round trip via `_position` looks
  like it works in a mock but does nothing on real Mixxx. Bind
  the same shape as hotcues: `inKey: base + '_activate'` on the
  press cell, `inKey: base + '_clear'` on the shift cell,
  `outKey: base + '_enabled'` on both.

- **`scheme: FX_COLOR_MAP[n]` is a function scheme.** Combined
  with `schemeFromState`, the function is silently ignored
  (fires `csDoubleDynamic` warn-once). Use `schemeFromState`
  alone; the map entries already supply the colour.