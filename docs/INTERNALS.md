# Internals

Modify the runtime. Developer-only.

For concepts, see `CONCEPTS.md`. For shipped behaviour, see
`README.md`. For scheme fields, binding fields, colour spec, beat,
patches — see `CUSTOMISE.md`. This file is the engine.

---

# 1. Load order

```
xone-k3-lib-core.js               bootstrap, utilities, tokens,
                                  binding field table, palette,
                                  beat math, transfer-curve
                                  normaliser
xone-k3-lib-timing.js             TIMING constants, Pacing queue,
                                  applyPacing
xone-k3-lib-schemes.js            palette, scheme engine,
                                  coMatchSample
xone-k3-lib-binding.js            Binding primitive, colour render
                                  path, snapshot field list,
                                  transaction model
xone-k3-hw-k3.js                  K3 hardware descriptor:
                                  DEFAULTS, pacing, LED_TRANSFERS,
                                  buildBindings, wireInputs,
                                  writeLED, blank,
                                  anyPendingWrites, decodeLedCache,
                                  protocol primitives
xone-k3-lib-controller.js         constructor, patch resolution,
                                  focus, TOP_MODES, chord, binding
                                  application, scheme resolution,
                                  modifier states
xone-k3-lib-controller-colour.js  on: parser, schemeFromState
                                  closures, _setupColorScheme
xone-k3-lib-controller-beat.js    timeline, loop clock, display
                                  source, beat count, beat clocks,
                                  phrase hotcue slots, boot settle
xone-k3-lib-controller-render.js  pacer accessor, calibration
                                  math, ramp sampling, beatjump
                                  gate
xone-k3-lib-controller-boot.js    init / shutdown, boot, halt
xone-k3-lib-funcs.js              builders + XoneK3.FUNCS
xone-k3-lib-inspect.js            runtime state probes

xone-k3-cat-schemes.js            THEME, QFX_CHAIN_LIST,
                                  PHRASE_MARKER_COLORS, SCHEMES,
                                  PHRASE_HOTCUE_SLOTS
xone-k3-cat-fx.js                 FX layout tables + emitters
xone-k3-cat-top.js                focus / twoDeck / mini bases
xone-k3-cat-bottom.js             cue / loop / oddLoop layers
xone-k3-cat-overlays.js           selectAB / fxRouting / chord
xone-k3-cat.js                    CAT_LAYERS assembler + bootCat()

xone-k3-kitten.js / -onek3.js / -onek3-minifx.js   boot overrides
```

colorLab replaces cat-fx / cat-top / cat-bottom / cat-overlays /
cat with its own tree. `cat-schemes.js` still loads — the lab's
`SCHEME_REGISTRY` references scheme names registered there.

```
xone-k3-cat-schemes.js     THEME, QFX_CHAIN_LIST,
                           PHRASE_MARKER_COLORS, SCHEMES
xone-k3-lab.js             LabController, bakeScheme
xone-k3-colorlab.js        colorLab layers + boot
```

`lab.js` sits after `lib-funcs.js` — it references
`XoneK3.FUNCS.*` at load time for `LAB_PAINTER_FUNCS`.

**Why five controller files.** All extend `K3Controller.prototype`,
split by concern. Any change to the file list means editing five
`.midi.xml` plus `test/harness.js`.

**Cat split** — `cat-schemes → cat-fx → cat-top → cat-bottom →
cat-overlays → cat`. Each declares its own `_requireLoad` prereqs.

**Hardware split.** `hw-k3.js` loads after `lib-binding.js`
(buildBindings constructs `Binding` instances) and before
`lib-controller.js` (constructor references `XoneK3.HW_K3` as the
default descriptor). `timing.js` loads after `lib-core.js` and
before anything that reads `XoneK3.TIMING` — in practice, before
`lib-schemes.js` (which uses `CO_MATCH_EPSILON` via `coMatchSample`).

**Bootstrapping.** `lib-core.js` opens with `var XoneK3 = (typeof
XoneK3 !== 'undefined') ? XoneK3 : {};` — Mixxx shares one global
object across `<scriptfiles>`. Every other file opens with
`_requireLoad(file, prereqs)` which throws on missing symbols.

---

# 2. Architecture

## Request flow

```
   midi.on(note, v)          ← handler registered by hw.wireInputs
        │
        ▼
   Binding.input()
        │
        ├─ _onInput(b)
        ├─ push press? _captureTransaction → _onBindingPress
        ├─ push release? _dispatchCapturedRelease → _onBindingRelease
        ├─ bounce guard (v>0 while transaction active)
        ├─ func / default write (try/catch)
        │
        ├─ _ledObservers[i]._refresh()

   (config change)
        │
        ▼
   _recompute() → _buildStack → _resolveStack
               → _applyResolved → _refreshAllLeds
```

## Non-obvious state

Beyond the binding map and `activePatches`:

- `_lastLoopTouchMs[1..4]` — beatjump gate timestamps
- `_decks[1..4]` — per-channel timeline and beat state (see `_freshDeckState`)
- `_phraseOrigin[1..4]` — beat where "count 1" sits
- `_trackMetaCache{}` — `{duration, fileBpm, samples, outroEnd}`,
  cleared on `track_loaded` / `track_samples` /
  `outro_end_position`. Incomplete reads not cached (§6).
- `_rateCache[1..4]` — `rate_ratio` snapshot, listener-fed
- `_reverseCache[1..4]` — reverse flag, listener-fed
- `_bootSettledAt` / `_bootAttempt` / `_bootSettling` — per-channel
  boot-converge tracking (§3)
- `_flatCache{}` — `_flatTarget` cache, keyed on segments id + `_calibFingerprint()`, bounded at 1024 entries (§12)
- `_calibFingerprint()` — computed at call time. See PERFORMANCE for why.
- `_resolvedTargetHashCache` — WeakMap<cfg, {fingerprint, value}> (§8)
- `_resolvedPatchCache{}` — memoized patch merges
- `_ledCache{}` — packed-int LED dedupe. Framework-owned storage,
  hardware read/write via `hw.writeLED` / `hw.blank`.
- `_pacers{}` — named `Pacing` queues, lazily created via
  `ctrl.pacer(name)`. `'led'` is the sysex RGB queue. Only created
  if the hardware enqueues; a zero-throttle hardware never
  allocates one.
- `this.hw` — hardware descriptor, resolved at construction from
  `cfg.hw || XoneK3.HW_K3`. Preset may override. Framework reads
  it only to delegate the six HAL methods.
- `XoneK3.TIMING` — pacing constants. `XoneK3._TIMING_DEFAULTS` —
  immutable snapshot. `XoneK3.applyPacing(overrides)` resets from
  defaults then merges; idempotent, safe to call repeatedly.
- `_recomputeDepth`, `_recomputeCompletedAt`, `_refreshAllLedsDepth` —
  phase tracking and re-entrancy guards

## The recompute cycle

```
_recompute()
  _buildStack       → [stack names]
  _resolveStack     → merged binding map
  _applyResolved    → hash diff; _applyBinding per changed binding
  _afterRecompute   → subclass hook
  _refreshAllLeds   → _syncBeatClocks, then b._refresh() per binding
```

**Callers don't refresh after.** `_reapplyByTokens` ends with the
same call unless passed `{ skipRefresh: true }` (§8).

One physical control is one `Binding`.

## 2.5 Modifiers and transactions

**Transaction lifecycle.** A physical push-mode press is captured
by `_captureTransaction` before func dispatch — the binding's
current `group`, `inKey`, `_func`, `_funcArgs`, and `buttonMode`
are snapshot onto `b._transaction`. The captured config is
dispatched at physical release via `_dispatchCapturedRelease`,
which fires the press-time func (or default input) with the
captured args. `_orphanTransaction` runs on every rebind and
compares the captured signature against the current binding; a
mismatch marks the transaction orphaned. The transaction is
session-scoped: `_reset` doesn't wipe it, and it survives the
binding's unbind/rebind cycles.

**Bounce guard (push-mode).** A `v > 0` event arriving while a
transaction is already active is treated as hardware bounce — no
func dispatch, no default input, no state change. The eventual
real release still dispatches the captured release normally.
Without this, a bouncing pad resets per-press flags
(`_bpmHeldTurned`, `shutdownHold`'s timer) mid-hold and changes
user-visible behaviour.

**Bounce guard (toggle-mode).** Toggle-mode bindings don't
capture transactions, so the push-mode guard doesn't cover them.
A hardware bounce would fire `_defaultInput` (or the binding's
func) twice, flipping the CO back to its original state — user
sees one press, no change. `_togglePressActive`, a session-
scoped press-state flag, is set on the first `v > 0` and cleared
on **any** button release, regardless of the binding's current
mode. Clearing unconditionally (not just when the mode is
toggle) closes the `toggle → push → toggle` rebind case: a
binding pressed as toggle, rebound to push mid-hold, then
released, then rebound back to toggle would otherwise leave the
flag stuck `true` and swallow the next press. A real
double-press (with a release between) works normally because
the release clears the flag. Protects both func-bound and
default-input toggle bindings.

**Signature.** Fields compared: `group`, `inKey`, `func`,
`funcArgs`, `buttonMode`. Fields excluded (changes don't orphan):
`colorScheme`, `outKey`, `noLED`, `softTakeover`, `valueCurve`,
`type` — none of these change what the release does at the CO.
`type` is fixed per hardware control (an encoder is always an
encoder), so it can never change between press and release. Args
are compared by `===` on each element; a non-primitive arg always
orphans (safe default — a rebind that passes the same object
reference doesn't; a rebind that passes a
structurally-equal-but-different object does, which is the
intended conservative behaviour).

**Orphaned is sticky.** Once set, `orphaned` is never cleared by
a later matching rebind. Rationale: the release that eventually
fires must dispatch the press-time config, not whatever the
binding happens to be now. If a rebind swapped the func away and
a subsequent rebind swapped it back, the release still fires
against the originally-captured func — this is what makes
rebind-during-hold safe regardless of how many rebinds happen
between press and release.

**Modifier states.** Declared in `cfg.modifierStates.<name>`.
Each entry has:

- `heldBy` — array of binding names. The modifier is active
  while every one of them has an active transaction.
- `patchActivate` — patch name (optional). The modifier
  idempotently enforces that the patch is in `activePatches`
  whenever the state is true, and removed whenever it's false.
  Fired on every press and release, not just on state edges:
  a config func that removes the patch out of band (snake does
  this) gets corrected.
- `recompute` — boolean (optional). State change triggers a
  standalone `_recompute`. Needed when a func reads
  `ctrl.modifiers.<name>` in its hot path.
- `onActivate` / `onDeactivate` — hooks (optional). Called with
  `ctrl` as `this` and argument.

`_updateModifiers` runs from `_onBindingPress` / `_onBindingRelease`
on every physical press and release. All patch changes from one
pass batch into one `_batchPatches`. If a pass has state changes
with `recompute: true` but no patch changes, a standalone
`_recompute` runs at the end. Both `_onBindingPress` and
`_onBindingRelease` wrap the call in try/catch (`updateModifiersPressThrow:` /
`updateModifiersReleaseThrow:` warn-once) — a throwing
`onActivate` / `onDeactivate` hook must not propagate through the
MIDI handler.

If the throw happened partway through the pass, `modifiers` may
contain a state flip whose `patchActivate` enforcement didn't
apply. That's tolerated: the next press or release re-runs
`_updateModifiers` on the full held set, `patchActivate` is
idempotent (it re-checks `activePatches` against current state
every time), and the divergence self-heals. Rollback on throw
was considered and rejected — the divergence window is bounded
by the next user input, the observable difference is nil, and
the snapshot cost on every press/release would buy nothing.

**`_noModifiers` patch flag.** A patch can declare
`_noModifiers: true`. While any active, `_patchActive`-satisfying
patch carries it, `_hasNoModifierPatch()` returns true and three
things are suppressed: shift companions aren't appended by
`_buildStack`, chord isn't appended, and `_updateModifiers` skips
patchActivate enforcement entirely. Both `_buildStack` and
`_hasNoModifierPatch` gate on `_patchActive` so a `_noModifiers`
patch whose `_host` isn't satisfied is inert. Snake ships with
this — the game owns the surface and must not have chord re-added
mid-play.

**Order independence.** Chord activates regardless of whether
shift or layer went down first. The modifier is a set-membership
check (`every heldBy has an active transaction`), not a state
machine with an enter/exit edge. This is deliberate: users press
shift-then-layer and layer-then-shift interchangeably, and any
edge-based model leaks a stuck state when the second button's
press arrives before the first is released.

**Shadow dispatch.** `_dispatchCapturedRelease` temporarily
installs the captured `group` / `inKey` / `_func` / `_funcArgs` /
`buttonMode` onto `this`, calls the func or default input, then
restores the current binding's fields in a `finally`. Funcs see
the press-time surface — `this.group` inside the func is the CO
the press was bound to, not whatever the binding now points at.
`this._transaction.orphaned` is readable from inside the func to
branch on the orphan case (suppress a user-facing side effect,
skip a menu open, etc.).

**Shutdown.** Captured releases are not dispatched on shutdown.
`Binding.input` short-circuits on `_shuttingDown`, so a held
button's release never reaches the dispatch path. Any CO a
captured release would have written 0 to stays at its press-time
value. Queued-software clean-up (a shutdown sweep that writes 0
to these COs) is deferred to a future software-adapter pass.

---

# 3. Boot and multi-device

`_bootWith(devices, Ctor, label)` resets boot-scoped state
(`_schemeCache`, `_compiledCache`, `_warned`, `_modeSeen`,
`_funcIdCounter`, `_funcIdMap`, `_segsCacheCounter`), applies
the hardware's pacing overrides via
`XoneK3.applyPacing(primaryHw.pacing)` (idempotent — also
called by `bootCat` before `XoneK3.boot`, so a custom-hw preset
lands on the right values before any framework code reads
`TIMING`), constructs controllers, calls `init()`, wires MIDI
inputs via `ctrl.hw.wireInputs(ctrl)`.

`init()` blanks LEDs, runs `_recompute`, `_initExtra`,
`_validateBindings`, and schedules a **250 ms beat-clock reopen**.
Mixxx's first CO tree read at startup can register connections
that never fire; the reopen lets them fire. `_shuttingDown` guards
a reload landing inside the window. `_funcIdCounter` / `_funcIdMap`
reset per boot — otherwise `inspect()` prints ids whose value
depends on reload count.

The reopen calls `_startBootSettle()` after `_syncBeatClocks`.
After the initial catch-up, `_checkBootChannel(ch)` reschedules
`_catchUpChannel` while any boot-relevant CO (`track_loaded`,
`play_indicator`, `loop_enabled`, `rate_ratio`, `reverse`) fired
within `BOOT_SETTLE_MS` (100 ms) of the last fire, capped at
`BOOT_MAX_ATTEMPTS` (5). Warn-once per channel on cap hit. On a
fast-settling tree this costs one extra catch-up and stops; on a
slow tree it re-reads before the state goes stale. Fixes the
silent failure where `_loadedState[ch] = false` or
`st.playing = false` from a stale boot read leaves a loaded
deck looking dead until the next unrelated event fires.

`halt()` calls `shutdown()` on every controller and clears the
array.

## Shutdown drain

`shutdown()` sets `_shuttingDown` (blocks every other send path),
runs `_blankLeds()` (clears pacers, clears `_ledCache`, then
delegates the blank sweep to `hw.blank`), then polls
`hw.anyPendingWrites(self)` at 20 ms intervals until drained (or
2000 ms max). On drain, clears remaining pacers, closes beat
clocks, calls `_shutdownExtra`. Framework never inspects a queue
directly — `anyPendingWrites` is the abstraction. For K3 that's
`ctrl._pacers.led.length() > 0`. A zero-throttle hardware that
sends synchronously returns `false` immediately, so shutdown
proceeds without a drain wait.

---

# 4. Patches

`activePatches` is an ordered list of patch names. The stack is
those (chord held aside, `_host` filtered), then shift
companions, then chord last. `_noModifiers` patches suppress
both the shift-companion append and the chord append (§2.5).

- `_host` — overlay gate. Applies only while one of its hosts is active.
- `layerButton, from, to` — swap. Press early-returns when
  `modifiers.chord` is active; no release branch (§9).

Three single mutations plus one batched:

```js
addPatch(name), removePatch(name), replacePatch(from, to)
_batchPatches(mutator)     // N edits, one recompute
```

`_batchPatches` gives the mutator a **copy**. Nested calls throw;
`addPatch` / `removePatch` / `replacePatch` throw inside a mutator.

Resolution: `_resolvePatch(name, seen)` shallow-merges parents in
order, then overlays the patch's own bindings. Cycle detection via
`seen`.

**Memoization.** `_resolvePatch` caches per name in
`_resolvedPatchCache`. Patches are fixed at construction, so a
resolved patch is stable per controller. Returning the cached
object makes `_applyResolved`'s `oldCfgs[name] === cfg`
short-circuit fire.

**Sibling layers do not inherit.** CUE / LOOP are siblings.
`twoDeckMini` inherits from `twoDeck` via `patch: ['twoDeck']`.

## Patch name constants

`XoneK3.PATCH_NAMES` in `lib-core.js`. Layout names built with
`PN.FOCUS_LAYOUT + n`.

---

# 5. Top-half modes

```
focus mode:     topShared   + fxLayout<n>
twoDeck mode:   twoDeck     + fxLayoutA<n> + fxLayoutB<n>
mini mode:      twoDeckMini + fxMini<n>
```

`XoneK3.TOP_MODES` in `lib-controller.js`. `owns` = every patch
name for unwind; `activate(ctrl)` = the list to add.

Mode inferred from `activePatches` via `currentTopMode()`. There
is no `this.topMode`.

`setTopMode(mode)` unwinds every patch owned by any mode, then
re-inserts the target's activate list at the position where the
first owned patch sat. Non-owned patches keep relative order. One
`_batchPatches`.

`F.toggleTopMode`: focus → twoDeck family → focus.
`F.toggleMiniFx`: twoDeck ↔ mini; focus → no-op.

`_resolveFxPatchName` returns `undefined` (not mine), `null`
(mine but missing), or the target name. `_syncFxLayout` warns once
per boot on `null`.

Adding a new layout family: extend the regex, add a branch.

Boot picks via `initialPatches` — see `BOOT_DEFAULTS` in
`cat.js`.

---

# 6. Timeline

Two timelines per channel. They describe *where the phrase
colouring reads from*; they don't move the playhead.

- **TRACK** — `playposition`. Beat 0 = file start. Origin sets where "count 1" sits. Default.
- **LOOP CLOCK** — accumulates playhead movement through wraps.

Per-channel state shape: `_freshDeckState()` in `lib-controller.js`.

## Origin

Derived from marker hotcues (`PHRASE_MARKER_COLORS`) by
`_deriveOriginFromPosition`. Only hotcues listed in
`PHRASE_HOTCUE_SLOTS` (default `[9, 10, 11, 12]`) are seeded,
watched, and scanned; other hotcues can carry a marker colour
without affecting origin. Runs on every throttled playposition
tick, `track_loaded`, any `track_samples` change, and any hotcue
colour / position change on a listed slot.

**Reads only `st.hotcueState`, never the COs.** Frozen in loop
mode. `_resetBeat` is the only hard reset. No manual setter.

## Beat maths

Metadata cached per channel (`duration`, `fileBpm`, `samples`,
`outroEnd`). Content bounds now read from the cache; the
`outro_end_position` listener invalidates on drag.

**Three-state load model.** `_loadedState[ch]` gates all metadata
reads — set by `track_loaded`, seeded by `_catchUpChannel` at
boot. When false, `_trackMeta` returns synthetic empty meta
without reading any CO, so an unloaded deck can't leak the
previous track's duration. `_loadSettlingAt[ch]` is stamped by
every metadata-relevant CO fire (`track_loaded`,
`track_samples`, `duration`, `file_bpm`). Inside
`META_SETTLE_MS` of the last stamp, `_trackMeta` reads live but
skips the cache write, so the mixed old/new tuple from a swap
never poisons the cache. `duration` / `file_bpm` observers fire
after the new metadata has landed on every path — they clear
and refresh, correcting any pre-settle read.

See `_beatF` and `_trackBeatF` in `lib-controller-beat.js` for
the formula.

`bounds.start = 0` unconditionally. `bounds.end` feeds only the
track-end countdown, never the cascade or origin.

## Source selection

`_cascadeCount(ch, trackBeatF)` — see code. The pulse is not the
count; pulse phase always comes from `playposition`'s fractional
beat, in both modes.

## Playback rate

`_channelRate(ch)` returns the deck's multiplier. Prefers
`rate_ratio`; falls back to `1 + rate`.

**`[ChannelN],rate` is the slider position (~−0.08..+0.08), not
a multiplier.** A `<= 0` guard on it silently returns unity on
every pitch-down — see §21.

## Loop clock accumulation

`clock.pos` advances by the amount the playhead would have moved
if the loop played through in sequence.

Real seconds, `dt × rate / duration`. Forward-only; the wall
clock doesn't know the playhead wrapped, and doesn't reverse when
the deck does — the loop clock is a session clock, not a position
readout. Rate-scales with the deck's effective tempo.

## Derived flags

`activeDeckVirtual`, `activeLoopVirtual`, `activeDisplaySource`.

`_refreshDisplayFlags()` is the only writer. Called from
`_refreshActiveAlt` (inside recompute), `_resolveDisplaySource`,
`_resetBeat`, and `cycleDisplaySource` when the channel is the
active deck. The latter three call `_refreshAllLeds` themselves —
flag-reading LEDs have no CO connection.

## Beat display modes

Two tunables, one per deck state:

| | Default |
|---|---|
| `XoneK3.BEAT_PLAYING_MODE` | `'pulse'` |
| `XoneK3.BEAT_PAUSED_MODE`  | `'solid'` |

`'pulse'` — bright first half, dim second (from `trackFrac < 0.5`).
`'solid'` — cascade colour held. `'off'` — off-ramp, no cascade.

`Binding._isBeatOffPhase` reads the one matching `st.playing`.
For a beat LED to light while paused, its `logicalOn` source must
read 1 while stopped. Shipped `layer` / `shift` cells use
`outKey: 'track_loaded'`; `play_indicator` blacks the LED
regardless of mode.

## Display cycle

`cycleDisplaySource` toggles track ↔ loop while the loop clock
runs. **The loop clock runs iff `loopActive && playing`.** Pause
is exit; resume is entry.

All four start/stop call sites route through `_syncVirtualClock`.
Returns `true` when state changed.

| Caller | Uses return? |
|---|---|
| `_onLoopEnabled` | No — `_resolveDisplaySource` repaints |
| `_onPlayIndicator` | No — always calls `_refreshBeatLeds` after |
| `_catchUpChannel` | No |
| `_onTrackLoaded` | No |

`displaySource` is always `'track'` while the clock is stopped.
Pausing inside a loop resets the iteration count — resume lands
on whatever loop beat the playhead is on. Jogging while paused
moves the resume point. A manual `cycleDisplaySource` to
`'track'` while playing is overwritten by resume re-seed.

---

# 7. Focus

Two independent axes: deck focus (A/B) and FX focus (A/B). Each
slot holds an assignment (`selectedDeckA/B`, `selectedFxA/B`).

`_refreshActiveAlt()` recomputes the four derived fields and calls
`_refreshDisplayFlags`. Called from the constructor,
`setSelectedFor`, `setActiveDeck`, `setActiveFx`.

## `_afterFocusChanged`

All three setters route through one helper:

```
_refreshActiveAlt()
_reapplyByTokens(tokens, { skipRefresh: true })
if !_syncFxLayout().swapped: _refreshAllLeds(reason)
```

One repaint per focus change on every path.

## `_syncFxLayout`

Scans `activePatches` for fx-pattern entries, resolves each via
`_resolveFxPatchName`, swaps via one `_batchPatches`. Returns
`{ swapped, reason }`. `swapped: false` means the caller refreshes
itself.

---

# 8. Routing via tokens

Bindings reach focus via `$TOKEN$` in their group string. Tokens
resolve at bind time; `_reapplyByTokens` re-applies any binding
whose `_usedTokens` include the changed token.

Three short-circuits keep `_reapplyByTokens` cheap:

- **Resolved-target equality.** `_resolvedTargetHash(cfg,
  fingerprint)` resolves every token-bearing field against
  current focus and hashes the result. `b._resolvedTargetHash`
  is written by `_applyBinding` at bind, cleared on unbind. A
  focus flip that resolves to the same channel skips the rebind.
- **Memoization.** `_resolvedTargetHashCache` is a WeakMap keyed
  on the cfg object, holding `{fingerprint, value}`. The
  fingerprint is a positional snapshot of every `TOKENS` state
  field. Any state change that could alter a token's value
  changes the fingerprint, invalidating the entry.
- **Shared fingerprint.** `_reapplyByTokens` computes the
  fingerprint once and passes it to `_applyOneSafe` →
  `_applyBinding` → `_resolvedTargetHash`, so the WeakMap still
  hits.

**Every rebind routes through `_applyOneSafe`.** One throwing
binding is caught and warned; the pass continues.

`_usedTokens` and `_validateBindings` both walk
`XoneK3._tokenFields(cfg)`, derived from `_BINDING_FIELDS` rows
carrying a `token:` label. `_resolvedTargetHash` walks the same
rows. Adding a token-bearing field is one row.

`skipRefresh: true` — all three focus setters use it, then
refresh via `_syncFxLayout`'s recompute or their own trailing
`_refreshAllLeds`.

---

# 9. Chord

Chord is a modifier state, not a `layerButton` branch. It's
declared in the boot config as `modifierStates.chord` with
`heldBy: ['shift', 'layer']` and `patchActivate: 'chord'`. The
modifier is active while both the shift binding and the layer
binding have an active transaction — regardless of press order
(see §2.5 for the transaction model).

`F.layerButton` runs on physical layer press. It early-returns
when `modifiers.chord` is true, and swaps the layer patch
otherwise:

```js
if (!this._ctrl._isPress(v, s)) return;
if (this._ctrl.modifiers.chord) return;
this._ctrl.replacePatch(args[0], args[1]);
```

No release branch. The captured layer press's release dispatches
through the transaction system (`_dispatchCapturedRelease`), which
sees the same early-return on release — chord exit is handled by
the modifier state going false when either shift or layer
releases.

`F.layerExitOverlay` used to replicate the layer release branch
for overlays that occupied the `layer` cell. That branch is gone.
The func itself still exists: press removes the overlay, release
is a no-op (the overlay isn't in `activePatches` anymore, and
nothing in the release path re-adds it). Any overlay declaring
`layer: { func: F.layerExitOverlay }` still works because the
press path is unchanged; the release-path caveat — "any binding
that can occupy `layer` must replicate the release branch" — is
gone.

**Chord wins over shift companions.** `_buildStack` holds the
`chord` patch aside and appends it after shift companions, unless
a `_noModifiers` patch is active (§2.5).

The CHORD patch in `cat-overlays.js` declares no `layer` binding
— layer's press is a no-op under chord. Its cells:

- `press0` — toggle `fxRouting` overlay (clears `selectAB`)
- `press1` — toggle `selectAB` overlay (clears `fxRouting`)
- `press3` — `shutdownHold`
- `pressR` — `toggleTopMode`
- `pressL` — `toggleMiniFx`

`grid2_1` is **not** a CHORD cell. Under chord it routes through
`CUE_SHIFT.grid2_1` / `LOOP_SHIFT.grid2_1` — each is a closure
that checks `ctrl.modifiers.chord` and dispatches
`toggleLayerOverlay(['hotcue2', 'loopOdd'])` on match; under
shift-only it flips the active deck. The shift companion reaches
through the chord stack; the chord patch itself declares nothing
on that cell. `toggleLayerOverlay` picks target by
`_patchActive('cue')` / `_patchActive('loop')`. Both overlays may
sit in `activePatches` simultaneously; `_host` gates visibility.

`shutdownHold` is a 2 s hold. Releasing shift, layer, or the
binding cell cancels the timer via `Binding._reset` — the same
path that fires any push-mode release.

`_pulseCo(group, co)` fires a CO high, clears on `TIMING.pulseCoMs`.

---

# 10. Beat pipeline

## Count and pulse — separate sources

- **Cascade count** — 1-based beat number. Track mode: from
  `playposition`. Loop mode: from `loopClock.pos`.
- **Pulse phase** — bright half vs dim half. Always from
  `playposition`'s fractional beat, in both modes.

## The four-case matrix

| logicalOn | beatOffPhase | isOn | LED shows |
|---|---|---|---|
| true | false | 1 | on-ramp + cascade |
| true | true | 0 | off-ramp |
| false | false | 0 | off-ramp |
| false | true | — | black (early return) |

The gate for "is this deck producing beats" is `st.hasBeat`, not
`st.count > 0`.

## Phase helpers

`Binding._beatStateFor(compiled)` — shared preamble. Returns the
deck state when the deck has seen a beat, else null.

`Binding._isBeatOffPhase(compiled)` — wraps with `!st.active`.

## Two writers of `st.active`

- `beat_active` handler — high → true, low → false.
- `_repaintFromPosition` — `active = trackFrac < 0.5`.

Both write from track frac, so they agree.

The position handler skips the pulse repaint when playing
forward and a recent `beat_active` edge exists (within
`BEAT_STALL_MS`) — that's what prevents the flicker at loop
wrap, where `trackFrac` jumps 1 → 0, and at other trackFrac
discontinuities. It still calls `_syncBeatCount` before
returning. The guard is not gated on loop state; outside a
loop it acts as a pure dedupe, inside a loop it's the wrap
protection.

The guard prevents double-writer flicker. Without it,
`_repaintFromPosition` writes `st.active` on every throttled
playposition tick **and** `_onBeatActive` writes it on every
edge. The two fire on different schedules and disagree briefly
at beat boundaries — the LED flickers, sometimes showing two
pulses per beat. When `beat_active` has been heard from recently
(< `BEAT_STALL_MS`), the guard fires and only
`_syncBeatCount` runs: `st.active` is written solely by
`_onBeatActive`. When `beat_active` has stalled (no fires for
`BEAT_STALL_MS`), the guard fails and `_repaintFromPosition`
takes over to avoid a frozen pulse phase.

The stalled-beat_active case is rare in practice; the
double-writer flicker is not.

The guard also requires the playhead not moving backward —
`beat_active` fires irregularly on backward jog, and the guard
would freeze `st.active` while count kept moving. Backward
bypasses the guard so `_repaintFromPosition` runs.

`st.lastPlayPos` is the per-tick `playposition` snapshot;
undefined until the first tick.

## Clock connections

Twelve per channel — one on `_beatConns` (`beat_active`) and
eleven on `_playConns` — wired in `_openChannelBeatClocks`:

| Array | CO | Effect |
|---|---|---|
| `_beatConns` | `beat_active` | Pulse source. |
| `_playConns` | `playposition` | Advances loop clock; position-tick repaint. |
| `_playConns` | `play_indicator` | Sets `st.playing`. |
| `_playConns` | `track_loaded` | Clears `_trackMetaCache`, resets beat state. |
| `_playConns` | `loop_enabled` | Starts / stops loop clock. |
| `_playConns` | `slip_enabled` | Count resync. |
| `_playConns` | `rate_ratio` | Updates `_rateCache[ch]`. |
| `_playConns` | `reverse` | Updates `_reverseCache[ch]`. |
| `_playConns` | `track_samples` | Track identity changed; invalidates meta and re-seeds hotcues. |
| `_playConns` | `outro_end_position` | Invalidates `_trackMetaCache`. No repaint (drag fires at UI rate). |
| `_playConns` | `duration` | Clears meta, restarts settle window, refreshes beat LEDs. |
| `_playConns` | `file_bpm` | Clears meta, restarts settle window, refreshes beat LEDs. |

`track_samples` fires when a new track replaces the current one
and when the outgoing track unloads. `duration` and `file_bpm`
fire *after* `track_samples` on swap — they're what corrects the
cache once the new metadata has landed. The settle window
(`META_SETTLE_MS`) spans the last metadata-relevant fire
regardless of which one it was.

Plus hotcue colour / position observers when
`PHRASE_MARKER_COLORS` is non-empty — two observers per slot in
`PHRASE_HOTCUE_SLOTS` (4 slots → 8 connections per channel by
default). Wired once at clock-open; changing
`PHRASE_HOTCUE_SLOTS` after boot extends the per-tick derive
scan but not the observer set.

Each observer updates one `st.hotcueState` field and re-derives
origin from the cache — no scan.

`_openBeatClocks` ends with a **catch-up loop**: re-reads loop
state, starts the loop clock where already active, re-reads
`play_indicator` into `st.playing`, populates `_rateCache`,
syncs count. CO connections fire on change, not on setup — a
preset reload during playback would otherwise render paused mode
on a playing deck.

At boot, `init`'s 250 ms reopen runs the catch-up once, then
`_startBootSettle()` reschedules it while boot-relevant CO fires
are still landing (see §3). A single catch-up against a still-
populating CO tree would leave `_loadedState[ch]` or
`st.playing` wrong until the next unrelated event; the settle
loop reads the correct values before the state goes stale.

Catch-up also re-seeds the hotcue cache and re-derives origin
when the cache is empty. That state arises when the beat clocks
were closed (no beat LEDs active) across a track load:
`track_loaded` and `track_samples` observers weren't wired, so
neither fired, leaving `_phraseOrigin` at the previous track's
value. Without the re-derive, a paused deck after reopen would
show the wrong phrase colour until the next `playposition` tick
or manual play. The guard (empty cache → seed + derive) skips
the redundant seed on the normal boot path where
`_wireHotcueObservers` already seeded.

`_syncBeatClocks` is the only caller of open / close. Gate is
`_needsBeatClocks` — returns `_beatLeds.length > 0`, with a
fallback scan of `_applied` when the array is empty. Dead code in
the shipped path; safety net only.

---

# 11. Scheme pipeline

`compileScheme(ref, overrides, seen)` resolves the raw scheme
(string → `SCHEMES[name]` + defaults; object with `.colors` →
as-is; object without `.colors` → warn + null), then either
builds segments and the tmap (full scheme) or falls back to a
single-colour ramp.

**Cycle detection.** `offScheme` and `coScheme` can name other
schemes. A scheme that names itself — directly, or through a
chain — would otherwise recurse until the JS stack overflows on
first render. `compileScheme` threads a `seen` Set through
`_compileFullScheme`. Strings match by value, objects by
reference. The cycle breaks at the innermost back-reference: the
referencing field compiles to null and warn-onces
(`schemeCycle:<name>`); the outer call finishes normally. `seen`
is deleted on exit so the cache stays usable for future calls.
Without this, a bad config crashes at bind time with a stack
trace that points nowhere useful.

Bare palette names resolve to single-colour schemes. Cached by
name when `ref` is a string and no overrides were passed.

Off-ramp is either `offScheme` compiled, or `on` with brightness
dropped to `DEFAULT_RGB_BRIGHTNESS_OFF`.

**Transfer curves.** Raw [hw, luminance] pairs used by the
calibration solve live on `XoneK3.HW_K3.LED_TRANSFERS` (or
whichever descriptor the preset boots with). Framework's
`_buildTransferRGB` (in `lib-core.js`) normalises them into the
lookup table the constructor stores on `_transfer` from
`this.hw.LED_TRANSFERS[cfg.calibration]`. `DEFAULT_RGB_BRIGHTNESS`
/ `_OFF` stay in `lib-core.js` (framework defaults; hardware may
override at module load, K3 doesn't).

## t-composer

`sampleT(compiled, t)` shifts position first, clamps, then warps.
Position-first is what makes `schemePosition` slide the whole
curve — pivot included — through knob space. Out-of-range clamps
to 0 or 1 and holds the boundary segment.

## Co-matching

`XoneK3.coMatchSample` — shared helper for both
`Binding._renderCoMatch` and `LabController._renderCoMatch`.

## `_funcId`

Boot-scoped. Reset in `_bootWith` (§3).

---

# 12. Render

Every render goes through `Binding._refresh`. The whole body is
wrapped in try/catch (`refreshThrow:<name>` warn-once) — CO
observers registered via `_bindConns`, `_wireCsOnConnection`, and
`_buildCsFromStateClosure` call `_refresh` directly with no outer
wrapper, so a throw would escape through Mixxx's CO event loop.
The external wrappers (`_safeBinding`, `_refreshBeatLeds`'s
inline try/catch) remain for their own pre/post work but no
longer see throws from this body.

1. `_csActive`? → `_refreshColorScheme()`
2. `outKey`? → read `outKey`, send on/off
3. Neither → nothing

`_refreshColorScheme` resolves `_isOn()`, `_evaluateScheme()`,
checks the beat-off-phase gate, then dispatches to
`_renderStatic` or `_renderDeviation`. See the function for the
exact branch order.

The beat gate sits **above** the ramp selection.

`_evaluateScheme()` resolves base + closure + ref-identity memo
into one compiled scheme. A scheme function returning a fresh
object twice with identical content fires
`_warnOnce('csSchemeFresh:<binding>')` — fix is `composeScheme`
or hoisting the object.

## Output dispatch

Every render's terminal step is `_sendColor(entry, isOn)`, which
resolves rgb (including `mixxx`-typed stops by reading the pad's
hotcue colour CO) and calls `_send(r, g, b, hw)` on the binding.
`_send` gates on `idx < 0` / `_noLED` and delegates to
`ctrl.sendLED(idx, r, g, b, hw)`.

`ctrl.sendLED` is framework-side dispatch: shutdown gate + idx
guard + `this.hw.writeLED(this, idx, r, g, b, hw)`. It never sees
a note number or a sysex byte. All transport-level concerns live
in the hardware descriptor.

`hw.writeLED` decides the transport:

- `ctrl.sysex === false` (K2 MIDI mode) → `hw.sendK2Note` on the
  discrete-colour palette. No white balance (K2 is coarse).
- `ctrl.sysex === true` → sysex RGB path:
  1. White balance if `ctrl.calibrationMode !== 'off'` and
     `ctrl.wbActive`.
  2. Pack `(r,g,b,hw)` to a 28-bit int for `_ledCache` dedupe.
     Cache hit → return (no frame).
  3. `buildSysExLED(idx, r, g, b, hw)` → frame bytes.
  4. `ctrl.pacer('led').enqueue(idx, msg); start()`.

`ctrl.pacer(name)` is a lazy accessor for `XoneK3.Pacing`
instances. `'led'` uses `TIMING.sysexThrottleMs` as the drain
interval; the pacer calls `midi.sendSysexMsg(msg, msg.length)` at
that rate. `onDrop` — the pacer's overflow handler — clears
`_ledCache[idx]` for the dropped frame, so a future render with
the same payload re-enqueues instead of hitting a stale cache
entry and silently losing the LED.

A zero-throttle hardware (`throttleMs <= 0`) sends synchronously
on each `writeLED` and never allocates a timer. `anyPendingWrites`
returns false immediately; shutdown doesn't drain-wait.

`hw.blank(ctrl)` is the counterpart used by `_blankLeds`: it
sends the sweep appropriate to the transport. K3 always sends
the short-message blank (a previous session may have left K2
notes lit — sysex blanks can't reach those) and, in sysex mode,
queues a zero-frame sweep for every LED index via the pacer.

`hw.anyPendingWrites(ctrl)` is the shutdown drain poll — the
framework doesn't know what a queue is, only whether the
hardware has work outstanding. For K3 that's
`ctrl._pacers.led.length() > 0`.

`hw.decodeLedCache(val)` is the diagnostic reverse of the
packed-int cache key. Used by `inspect('why', name)` to print
what was last written to an LED index.

## Calibration

`_emitAt(rgb, hw)` = white-balance × transfer × channelPerceptual,
summed to Y, `pow(Y, lumGamma)`, boosted by `hkBoost × saturation`.

## Flat target

`_flatTarget(segs)` scans stops for minimum perceived luminance.
Cached per controller in `_flatCache`, keyed on `segs._cacheId`
then `_calibFingerprint()`, bounded at 1024 entries — overflow
evicts one entry, same discipline as `_hwCache`. The cap matters
for colorLab: every input event allocates a fresh `segs` array
(`_version++` invalidates the compile cache), so entries
accumulate during a tuning session. Misses still recompute
`_minSegmentEmit` — the cap only bounds memory, not per-render
CPU.

`_calibFingerprint()` is a method, not a stored string. Every
`_emitAt` input is included — curve name, calibrationMode,
wbActive, wbGain, channelPerceptual, hkBoost, lumGamma — so a
runtime tuning mutation invalidates the cache. See PERFORMANCE
for the rationale.

## Hardware solve

`_calibratedHw(rgb, targetLum)` bisects `_emitAt` over 12
iterations. Cached in `_hwCache`, bounded at 1024 entries.

## `_isOn`

Three sources, checked in order: `colorScheme.on` (unconditional
`true` / `false`, or `{ patchActive | state | co }` with optional
`equals` / `contains`), then `group + outKey`, else 0.

Numeric `on.state` without `equals` warns once per binding, from
`_isOn` on first render.

`on.co` gets its own `engine.makeConnection` in `_parseCsOn`,
pushed onto `b._conns`. `_bindConns` skips the `outKey` connection
when `_csOn` is set.

## `schemeFromState.list`

Uses the CO value directly (0-based). `loaded_chain_preset` is
0-based. Out-of-range clamps to the last entry.

---

# 13. Input mods

`Binding.input()` order: `_onInput(b)` → normalized update (knobs /
faders) → push-mode transaction capture (if applicable) → bounce
guard → func dispatch or default → observer repaints. The func /
default dispatch is wrapped in try/catch (`inputThrow:<name>`
warn-once) so a throwing user func or an invalid CO write can't
escape through the MIDI handler.

## valueCurve

Applies at write time, after `_scaleValue`. `_normalized` stays
uncurved.

---

# 14. Binding hash

`_applyResolved` diffs hashes, not object identity.

`_BINDING_CFG_FIELDS` is derived from `_BINDING_FIELDS` — every
row with `hash: true`, in table order. Fields starting with `_`
are omitted.

`_hashBindingValue(field, v)`: `undefined` → empty;
`func` → `_funcId`; objects → key-sorted `_stableStringify`;
strings → `JSON.stringify` (quoted, so `|` inside can't shift the
field boundary); everything else → `String`.

`_hashBinding` joins parts with `\u0001` (SOH).

`_applyResolved` also caches the cfg object reference per binding
name: `oldCfgs[name] === cfg` skips the hash recompute. Works
because `_resolvePatch` memoizes its output — a repeated
recompute over the same stack returns the same `resolved[name]`
references.

Each per-binding `_applyBinding` call is wrapped via
`_applyOneSafe`, a named method with its own try/catch. Warns once
via `_warnOnce('applyBindThrow:<name>')` / `applyUnbindThrow` and
doesn't stop the pass. `_unbindRemoved` sweeps `_appliedHashes`
for missing entries.

`_safeBinding` is used by `_refreshAllLeds` and `_refreshBinding`.
`_refreshBeatLeds` has its own inline try/catch (`refreshBeatThrow:`
warn key) because it inspects each binding's scheme before
refreshing — not the same call shape.

`_auditBindingCfg` runs per rebind, gated on `_debugPrintsOn`.

---

# 15. `_bindingDefaults`

Standalone factory returning every reset-able Binding field at
default. Called by the constructor and `_reset`. Adding a reset-
able field means editing one list.

Session-scoped state lives outside the factory:

```
_normalized, _ledObservers, _transaction, _togglePressActive,
_lastOutKeyValue, _lastCoValue
```

`_transaction` is the one that must survive a rebind: the
captured press config it holds is what will fire at physical
release, and that firing must happen against the press-time
surface regardless of how many rebinds happened in between
(§2.5). `_normalized` and `_ledObservers` are session-scoped for
different reasons — `_normalized` persists knob position across
rebinds for soft-takeover bridging, `_ledObservers` is the
observer registration list. `_togglePressActive` persists across
rebinds so a toggle-mode binding rebound mid-hold still clears
correctly on the physical release — without it, a rebind would
reset the flag and the next `v > 0` on the new binding would
fire a spurious toggle from the leftover press. `_lastOutKeyValue`
and `_lastCoValue` are re-seeded by `_bindConns` /
`_armOwnConn` at every bind, so surviving a `_reset` doesn't
preserve stale data — it just avoids a transient `undefined`
between `_reset` and the seed.

---

# 16. `_snapshotBinding`

Before every `_reset`, `_applyBinding` captures fields that
`_unbind` and `_rearmSoftTakeover` need after the wipe.

`_SNAPSHOT_FIELDS` is derived from `_BINDING_FIELDS` — every row
with a `snapshot:` clause, expanded to `[source, dest, transform]`.
`_SNAPSHOT_IGNORED` is derived from `ignored: true` rows. Anything
reset-able not classified as either triggers a boot-time warning
when `_debugPrintsOn` is set.

Transform names are implemented in `XoneK3._snapshotTransform`.
Adding one means editing that function plus the table row.

`_resolvedTargetHash` is controller-set, not in `_bindingDefaults`,
so the audit doesn't see it.

---

# 17. Lab internals

`LabController extends K3Controller`.

## State

`this._lab = { slots[16], edit, previewSource, previewing,
saveArmed, previewPos, previewKnown, previewOn, selectedSegment,
ratioEdit, schemeName, beatTarget, _version }`.

- `slots[0..15]` — saved schemes. 0/1/2/3 = on/off/co/co-off.
- `edit` — working buffer. May carry `colorSet` (parallel bool
  array; real stop vs gap). Lab editing state, never persisted.
  Save / load paths go through `_cloneScheme`, which strips it.
  Bake paths (`_applyAutoBake` → `bakeScheme`) do not use
  `_cloneScheme`; they go `resolveScheme` → `_buildSegments` →
  fresh `{ colors, ... }` object built from `segs[].color`, so
  `colorSet` on the input is never copied to the bake output.
  Safe by field-picking, not by cloning.
- `previewSource` — `'edit'`, 0..15, or a registry name.
- `_version` — bumped on every input event, keys the preview
  compile cache.

## Gates and overrides

`_commitPreview()` returns `_lab.edit` when
`previewSource === 'edit'`, else null (warn once). Edit funcs are
no-ops while previewing.

`_selectSlot` guards against a null `_previewScheme()` — clears
the arm and falls through to normal preview.

`_renderPreviewLED` wraps in try/catch — a user scheme that
throws paints black and warns once.

`_onPatchChange` handles auto-bake when leaving `colorLab` and
the mode prints.

`_applyAutoBake()` runs when preview lands on `'edit'` or slots
0..11.

`_needsBeatClocks` is overridden to keep beat connections open
whenever `_onBeat` is set.

## Preview compile cache

Keyed on `_lab._version` and `previewSource`. Beat-driven renders
between inputs hit the cache.

## Preview LED render

`_renderPreviewLED` is a try/catch wrapper so a body throw's stack
points at the actual failing call. The body is
`_renderPreviewLedBody`: cache read, beat-state check,
stopped-beat-target branch, four-case matrix, then `_previewFrame`.

`_previewFrame` = co-match → marker → ramp. First branch to paint
wins.

## Slot-0 preview chain

When `previewSource === LAB_SLOT.ON`, `_previewCompiled` wires
slots 1/2/3 as `offScheme` / `coScheme` / co-`offScheme`
overrides. Missing slots fall through to engine defaults.

## Binding discovery

Renderers don't hardcode cells — they ask via `_findCellsByFunc`.
`LAB_PAINTER_FUNCS` lists painter-owned funcs.

## Bake

`bakeScheme(ref, ctrl, level)` — lab only. Three levels: structural
(one stop per segment), sampled (23 uniform points), wire (sampled
+ calibration solve, marks `calibration: false`). Structural
preserves `ratio`, `curve`, `schemePosition`.

## Shutdown dump

`LabController.shutdown` is overridden to run the slot dump
synchronously before the parent's async sysex drain.

## Mode prints

`XoneK3.modePrint(line)` / `modePrintFirst(mode, hint)`. Gated on
`MODE_PRINTS`, flipped on by colorLab's boot config.

---

# 18. Debugging

## Print channels

| Channel | Gate | Reset on boot |
|---|---|---|
| `debugPrint` | `_debugPrintsOn` | no |
| `modePrint` / `modePrintFirst` | `MODE_PRINTS` | via `_bootWith` |
| `_warnOnce` | none | via `_warned` |

`debugPrint` walks `PRINT_TABLES`, first matching table wins.
`_warnOnce(key, msg)` prints `[k3] <msg>` once per key.

`_syncBeatClocks` prints one diagnostic line when
`_debugPrintsOn`:

```
[k3] _syncBeatClocks want=1 have=1 _beatLeds=2 applied=45
```

Mismatch at boot = open/close decision wrong. `_beatLeds=0` with
`applied=45` = a binding threw during `_applyResolved`; safety net
carrying the load.

The beatjump gate prints when `_debugPrintsOn`:

```
[k3] beatjump gated: 87ms / 130ms
```

## Probes

See `lib-inspect.js` header. `inspect('why', name)` walks the
render pipeline for one binding and prints where it stopped.
Read-only.

## Symptom table

| Symptom | Cause |
|---|---|
| Nothing lights | Preset not loaded. Reload. |
| `Xone K3: <file> requires <symbols>` at load | `<scriptfiles>` order wrong. |
| `Xone K3: xone-k3-lib-controller.js requires HW_K3` | `hw-k3.js` not loaded before `lib-controller.js`. Add `<file filename="xone-k3-hw-k3.js"/>` after `lib-binding.js`. |
| `Xone K3: xone-k3-lib-controller-render.js requires Pacing` | `timing.js` not loaded. Add after `lib-core.js`. |
| `hw.buildBindings stub` warn at boot | `hw-k3.js` was not updated for v1.1.0. Check the file on disk. |
| `hw.writeLED` swallows every LED after a custom-hw swap | Custom hw's `writeLED` is a stub. Implement the six HAL methods. |
| `TIMING` doesn't reflect `hw.pacing` after manual boot | Bypassed `bootCat` / `_bootWith`, so `applyPacing` didn't fire. Call `XoneK3.applyPacing(hw.pacing)` before `XoneK3.boot`. |
| LEDs half-update on patch switch | A binding field missing from `_BINDING_CFG_FIELDS`. |
| Soft takeover stops working after a rebind | A reset-able field missing from `_SNAPSHOT_FIELDS`. |
| Fader stuck at endpoint after deck switch | `_rearmSoftTakeover` bridge didn't fire. Check `b._normalized !== undefined` at rebind. |
| No beat after Mixxx startup until reload | Init-time beat-clock open raced the CO tree. `init`'s 250 ms reopen fixes; the boot settle-aware catch-up (§3) makes it robust against slow trees. |
| Beat LEDs stay dark after the 250 ms reopen | `_trackMeta` caching incomplete values. Check the `if (meta.duration > 0)` guard. |
| Loop clock doesn't resume after a preset reload during an active loop | `_openBeatClocks`'s catch-up loop reads loop state on open. |
| Beat colour sticks while playing; correct when jogged | Position-tick guard returned before syncing count. `_syncBeatCount` must run before the early return. |
| Beat LED fires faster/slower on pitched deck, loop reading only | `_advanceVirtualClock` scaled by `[ChannelN],rate`. Must read `rate_ratio`. |
| Two decks drift out of phase in loop mode at same tempo | Both decks on the same accumulation strategy? Check `_cascadeCount` reads `clock.pos`. |
| Beat count jumps backward on tight loops | Wrap detection direction-based? Check `reversing` is read correctly. |
| Beat LED drifts across loop iterations, both decks at unity | `duration × fileBpm / 60` not an integer. Snap `duration` to a beat-multiple, or switch to `trackTempo: true`. |
| Beatjump doesn't fire after touching a loop control | Gated by `_beatjumpAllowed` — less than `BEATJUMP_GAP_MS` since last loop-touching event. Set `_debugPrintsOn` for the gate line. |
| `[k3] _batchPatches mutator threw: …` | Mutator hit an exception. `activePatches` not modified (copy). |
| `[k3] _applyBinding(<name>) threw: …` | One binding's bind path threw; rest continued. |
| `[k3] _syncFxLayout: fx-pattern patch … has no matching target` | An fx-family patch is in `activePatches` but missing from `patches:`. |
| `[k3] colorScheme scheme function on X returns a fresh object each call` | Wrap with `composeScheme` or hoist the object. |
| Play doesn't respond after a hotcue pad press; recovers after mouse-seek | Transaction stays active across rebind, dispatches captured release at physical release. If still stuck, check `_transaction.active` on the binding via `inspect('why', name)`. |
| Modifier state stuck / patch oscillates | Check `modifierStates.<name>.heldBy` references a binding that exists, and `_hasNoModifierPatch()` isn't suppressing enforcement unexpectedly. |
| `[k3] binding func threw on <name>` | The binding's func or default input threw. `Binding.input`'s try/catch logged it. The observer repaint for that tick was skipped — LED state may diverge for that binding until the next input. Check the func for invalid CO reads or missing args. |
| `[k3] refresh threw on <name>` | A CO observer's repaint threw. `Binding._refresh`'s try/catch logged it. The binding's LED stays stale until the next refresh event (scheme re-eval, focus change, patch swap, or another CO fire). Usually a bad scheme closure or an engine CO that no longer exists. |
| `[k3] _onBindingPress(<name>) threw` / `[k3] _onBindingRelease(<name>) threw` | A modifier hook (`onActivate` / `onDeactivate`) or `patchActivate` enforcement threw. The press or release transaction still cleared, but the modifier state or patch swap was skipped. Check `modifierStates` hooks and `patchActivate` targets. |
| `[k3] XoneK3.TIME_SIG contains invalid barBeats/phraseBars` | TIME_SIG was assigned directly with non-integer or out-of-range values (bypassing `setTimeSig`). The cascade falls back to scheme defaults. Use `setTimeSig(4, 4)` or provide integers ≥ 1. |
| `[k3] scheme "<name>" references itself in its offScheme / coScheme chain` | A scheme's `offScheme` or `coScheme` names itself (directly or through a chain). The back-reference field renders as null instead of infinitely recursing. Break the cycle by pointing at a different scheme or setting the field to null. |
| `[k3] colorScheme: knob "<name>" on <binding> is type "<type>"` | A `colorScheme.knob` reference points at a button or encoder. Only knobs and faders track `_normalized`; the LED stays on boot-white forever. Point `knob:` at a knob or fader binding. |
| `[k3] sampling a scheme containing a `mixxx` colour stop` | A `mixxx` stop sits in a sampled ramp. `mixxx` is static-only — see §22 Limits. LED falls back to the nearest valid stop's colour. |
| `[k3] colorScheme.schemeFromState on X must be an object` | `schemeFromState` is a string, number, or array. It's dropped; the base scheme (if any) renders instead. |
| `[k3] colorScheme.on on X has equals but no state/co/patchActive` | `on:` has a comparator but no source to compare. LED stays off. Add `state: '...'`, `co: '...'`, or `patchActive: '...'`. |

Full behaviour-driven symptoms: CUSTOMISE §3.

---

# 19. Adding things

## Adding a scheme field

1. Add to `SCHEME_DEFAULTS`.
2. Consume in `compileScheme`.
3. If it affects render, read in `_refreshColorScheme` or `sampleT`.
4. If bake should preserve it, add to `bakeScheme`'s output.

## Adding a binding field

1. Add a row to `_BINDING_FIELDS` in `lib-core.js`:
   - `hash: true` if it affects runtime behaviour or LED output
   - `token: '<label>'` if it can carry a `$TOKEN$`
   - `snapshot: { dest, transform? }` if `_unbind` /
     `_rearmSoftTakeover` needs it after rebind
   - `ignored: true` if reset-able but neither snapshotted nor hashed

   `_BINDING_CFG_FIELDS`, `_SNAPSHOT_FIELDS`, `_SNAPSHOT_IGNORED`,
   `_tokenFields`, `_resolvedTargetHash` all derive from this table.
2. If `_bindCore` should read it, add a branch.
3. If reset-able, add to `_bindingDefaults`.
4. Turn on `_debugPrintsOn` and reload. Boot-time audits fire if
   a reset-able field isn't classified.

## Adding a modifier state

1. Declare in `cfg.modifierStates` with `heldBy`, plus
   `recompute` / `patchActivate` / `onActivate` / `onDeactivate`
   as needed.
2. `heldBy` bindings must be `type: 'push'` somewhere in the
   reachable patch stack — otherwise their transactions never
   activate and the modifier stays false.
3. If `patchActivate`, ensure the patch exists in `patches:` —
   `_validateBindings` warns at boot otherwise.
4. Read the state from config as `ctrl.modifiers.<name>` or from
   a binding's `on: { state: 'modifiers.<name>' }`.

## Adding a func

```js
XoneK3.FUNCS.myFunc = function(args, ch, c, v, s) {
    // this = Binding, args = cfg.args, v = MIDI value, s = status
};
```

Loop-touching funcs: `this._ctrl._touchLoop(this.group)` after
the write. Beatjump funcs: `this._ctrl._beatjumpAllowed(this.group)`
first, bail if false.

## Adding a top-half mode

1. Base patch + `_shift` in `cat-top.js`.
2. Layout patches inheriting from the base, emitters in
   `cat-fx.js`.
3. Add all to `CAT_LAYERS` in `cat.js`.
4. Entry in `XoneK3.TOP_MODES` in `lib-controller.js`.
5. Extend `_resolveFxPatchName`'s regex.
6. Swap func (or extend `toggleTopMode` / `toggleMiniFx`).
7. Bind on a chord cell.
8. Add any new files to every `.midi.xml` and to `test/harness.js`.

CUSTOMISE §1.9 has the schema detail.

## Adding a hardware

1. New file `xone-k3-hw-<name>.js`, loaded after
   `lib-binding.js` (buildBindings constructs Binding instances)
   and after `lib-timing.js` (uses `Pacing`), before
   `lib-controller.js` (default descriptor reference).
2. Descriptor shape: `name`, `DEFAULTS`, `pacing`,
   `LED_TRANSFERS`, plus the six HAL methods:
   - `buildBindings(ctrl)` → `{ name: Binding, ... }`
   - `wireInputs(ctrl)` → registers Mixxx input handlers
   - `writeLED(ctrl, idx, r, g, b, hw)` → dispatch (K2 vs sysex,
     or whatever transport the hardware has)
   - `blank(ctrl)` → blank sweep on shutdown/init
   - `anyPendingWrites(ctrl)` → bool for shutdown drain poll
   - `decodeLedCache(val)` → diagnostic string for `inspect('why')`
3. Add to every `.midi.xml` after `lib-binding.js`, before
   `lib-controller.js`.
4. Preset config passes `hw: XoneK3.HW_<NAME>` in its overrides
   object, or `bootCat({ hw: ... })`.
5. Config layers stay unchanged. Bindings the new hardware
   doesn't provide simply go dark (existing graceful
   `_applyBinding` skip + `_validateBindings` warn).

Config files never see a note number or a sysex byte. If you find
yourself reaching for those in a preset layer, the concern belongs
in the hardware descriptor.

## Adding a controller concern

Sixth controller file. Pattern:

```js
'use strict';
if (typeof XoneK3 === 'undefined') throw new Error(...);
if (typeof XoneK3._requireLoad !== 'function') throw new Error(...);
XoneK3._requireLoad('xone-k3-lib-controller-<name>.js',
    ['K3Controller', ...prereqs]);

(function() {
    XoneK3.K3Controller.prototype.myMethod = function() { ... };
})();
```

Add filename to every `.midi.xml` (5 files) and `test/harness.js`.

---

# 20. Tests

`node test/run.js`. Files share one vm sandbox. `run.js` resets
mutable globals before every test — tunables, debug flags,
`_warned`, `_modeSeen`, `_funcIdCounter`, `_funcIdMap`,
`_schemeCache`, `_compiledCache`, `VIRTUAL_CLOCKS`, `TIME_SIG`,
`BEATJUMP_GAP_MS`, `BOOT_SETTLE_MS`, `BOOT_MAX_ATTEMPTS`, mocks,
controllers array, print log, `_phraseHotcueSlotsCache*`.

With v1.1.0, `resetGlobals()` also resets `XoneK3.TIMING` from
`XoneK3._TIMING_DEFAULTS`:

```js
if (XoneK3.TIMING && XoneK3._TIMING_DEFAULTS) {
    Object.assign(XoneK3.TIMING, XoneK3._TIMING_DEFAULTS);
    // refresh compat aliases
    XoneK3.SYSEX_THROTTLE_MS = XoneK3.TIMING.sysexThrottleMs;
    XoneK3.BEAT_REPAINT_THROTTLE_MS = XoneK3.TIMING.beatRepaintThrottleMs;
    XoneK3.PULSE_CO_MS = XoneK3.TIMING.pulseCoMs;
    XoneK3.BEATJUMP_GAP_MS = XoneK3.TIMING.beatjumpGapMs;
    XoneK3.BEAT_STALL_MS = XoneK3.TIMING.beatStallMs;
    XoneK3.META_SETTLE_MS = XoneK3.TIMING.metaSettleMs;
    XoneK3.BOOT_SETTLE_MS = XoneK3.TIMING.bootSettleMs;
    XoneK3.BOOT_MAX_ATTEMPTS = XoneK3.TIMING.bootMaxAttempts;
    XoneK3.CO_MATCH_EPSILON = XoneK3.TIMING.coMatchEpsilon;
    XoneK3.TAKEOVER_EPSILON = XoneK3.TIMING.takeoverEpsilon;
}
```

`applyPacing` — called by `bootCat` / `bootLab` / `_bootWith` —
resets `TIMING` from `_TIMING_DEFAULTS`, which would clobber the
test's `sysexThrottleMs = 0` write. `resetGlobals` sets
`XoneK3._pacingTestOverride = { sysexThrottleMs: 0,
beatRepaintThrottleMs: 0 }`; `applyPacing` merges that hook at
highest priority (after `_TIMING_DEFAULTS` and after
`hw.pacing`). Production code never sets `_pacingTestOverride`.

Do not reset: `XoneK3.HW_K3` (static descriptor),
`XoneK3._TIMING_DEFAULTS` (immutable snapshot), `XoneK3.Pacing`,
`XoneK3.applyPacing` (stateless).

Mock controllers should set `hw: XoneK3.HW_K3` (or a fake with the
six HAL methods stubbed) before use.

`SCHEMES` is reset by `lib-schemes.js` on every reload — config
files re-register their own.

Adding a new mutable global on `XoneK3` means adding a reset line
to `resetGlobals()` in `run.js`. `_phraseHotcueSlotsCache` and
`_phraseHotcueSlotsCacheSrc` in particular need resetting — they
are memoized module-scoped state and would otherwise leak
between tests.

Coverage: see test file list. Not tested: real Mixxx, real LED
bytes, config contents as data, lab round-trip state machine.

## Lint

`eslint.config.js`, flat config, no plugins. `no-implicit-globals`
on for runtime files; the single `var XoneK3` in `lib-core.js`
carries an inline disable.

---

# 21. Non-obvious

## Timelines

- **`_beatF` has no `pos < 0` guard.** Negative playposition
  returns a negative fractional beat. `_cascadeCount` floors it,
  `beatLevel` normalises via modulo. Pre-start scrub cycles
  backward through the phrase instead of freezing the LED.
- **The loop clock is a session clock, not a position readout.**
  Accumulates dt × rate / duration, forward-only. Doesn't reverse
  on deck reverse, doesn't need wrap detection.
- **`_cascadeCount(ch, trackBeatF)` is the single count
  selector.**
- **`beat_active` drives the pulse in both modes.** Cascade reads
  `clock.pos` in loop mode; pulse reads track fraction.
- **`_syncVirtualClock(ch)` is the single start/stop decision.**
  Returns `true` if state changed. Four call sites route through it.
- **`_refreshDisplayFlags` is the only writer of the three
  derived flags.**
- **All three focus setters refresh exactly once on every path.**
- **`_advanceVirtualClock` clamps `dt` to zero.** `Date.now()` is
  not monotonic; a backward NTP step would shift the loop-mode
  count backward.
- **`_advanceVirtualClock` reads zero COs.** Uses `st.playing`
  and `_channelRate` — both cached by listeners. No reverse
  read; reverse doesn't move the session clock.
- **`_onPlayposition` reads one CO per fire — `playposition`**,
  above the throttle gate so the direction check has a fresh
  value. Once past the throttle the body is CO-free.
- **`_beatF` reads zero COs.** Uses cached track metadata only.
- **`_repaintFromPosition(ch, pos)` accepts `pos`.** Saves one
  CO read per throttled tick. Falls back to live read when
  `undefined`.
- **`_syncBeatCount(ch, pos)` accepts `pos`.** Same convention.
- **The loop clock scales by `_channelRate(ch)`, not
  `[ChannelN],rate`.** Mixxx's `rate` is the slider position. A
  `<= 0` guard silently returns unity.
- **`_closeBeatClocks` preserves `_phraseOrigin`.** Playhead
  hasn't moved.
- **`hasBeat` means "position is meaningful", not "deck is
  playing".** `st.playing` mirrors `play_indicator` and picks
  `BEAT_PLAYING_MODE` / `BEAT_PAUSED_MODE`.
- **The loop clock is the only virtual timeline.**
- **Boot-time beat-clock reopen.** See §3. Settle-aware — after
  the initial reopen, `_startBootSettle` reschedules
  `_catchUpChannel` while boot-relevant CO fires are still
  landing, so a slow CO tree converges before the state goes
  stale.
- **`_openBeatClocks` catches up state on open.** See §10.
- **`st.lastPlayPos` gates the beat-edge guard.** Backward motion
  bypasses the `BEAT_STALL_MS` guard so `_repaintFromPosition`
  runs. The guard is not gated on loop state — where `trackFrac`
  is continuous (outside a loop) it deduplicates
  `_repaintFromPosition`'s `st.active` writes; where it jumps
  (loop wrap) it's what prevents the flicker.
- **`_catchUpChannel` re-seeds the hotcue cache and re-derives
  origin when the cache is empty.** That state arises when clocks
  were closed across a track load. See §10.

## Beatjump gate

- **One gate, one value.** `TIMING.beatjumpGapMs` in
  `lib-timing.js`.
- **Stamped by:** beatjump (on pass, in loop), `encLoopMove`,
  `pressSetValue` on `beatloop_size`,
  `beatloopActivateResetAnchor`, `reloopToggleResetAnchor`.
  NOT by `beatjump_size`, hotcues, play, EQ, faders.
- **Outside a loop every beatjump fires and nothing is stamped.**
- **Gate lives in `lib-controller-render.js`.**
- **No per-binding override.**

## Caches

- **`_decks[ch].hotcueState`** — per-channel hotcue snapshot,
  keyed by hotcue index. Only slots in `PHRASE_HOTCUE_SLOTS`
  (default 9–12) are present. Seeded at clock-open,
  `track_loaded`, `track_samples`. Observers read `_decks[ch]`
  fresh on every fire (`_resetBeat` replaces the object).
  `_deriveOriginFromPosition` reads only this — zero COs per
  tick.
- **`_trackMetaCache`** — reset on `track_loaded`, `track_samples`,
  `duration`, `file_bpm`, and `outro_end_position`. Gated by
  `_loadedState[ch]` (return empty, skip COs, when not loaded)
  and by `_loadSettlingAt[ch]` (reads live, skips the cache
  write, within `META_SETTLE_MS` of any metadata fire). Mixxx
  fires `track_samples` before `duration` on swap and
  `track_loaded = 0` before `duration = 0` on unload; the gates
  enforce intent regardless of that ordering and remain correct
  if Mixxx changes it. `track_samples` does **not** fire on
  eject — the load gate covers unload, not `track_samples`.
  `outro_end_position` invalidates mid-track on drag without a
  repaint — the next beat edge renders with the new bounds.
  Un-invalidated cache symptom: beats advance at wrong rate for
  every track after the first, clears on restart.
- **`_rateCache[1..4]`** — `rate_ratio` snapshot. Listener-fed,
  seeded by `_catchUpChannel`. Removes a CO read from
  `_advanceVirtualClock`.
- **`_reverseCache[1..4]`** — reverse flag. Listener-fed,
  seeded by `_catchUpChannel`. Removes a per-tick CO read from
  the beat-edge guard in `_onPlayposition`.
- **`Binding._lastOutKeyValue`** — cached outKey CO value, seeded
  at bind by `_bindConns` and updated by the outKey listener.
  Removes one CO read per `_isOn` call (every LED render).
  Undefined means "not seeded yet"; `_isOn` falls back to a live
  read.
- **`Binding._lastCoValue`** — cached `getParameter` value for a
  knob/fader binding's own CO, seeded at bind by `_armOwnConn`
  and updated by the value listener. Only populated for
  knob/fader types (the only valid `colorScheme.knob` targets).
  Removes one `getParameter` read per co-match render;
  `coMatchSample` falls back to a live read when undefined.
- **`_csOn.cachedValue` / `sd.cachedValue`** — cached `on.co`
  and `schemeFromState.co` CO values, seeded and updated by
  their respective listeners. Remove one CO read per render.
  Reset naturally on rebind because `_parseCsOn` /
  `_buildCsFromStateClosure` create fresh objects.
- **`_flatCache`** — keyed on `segs._cacheId` then
  `_calibFingerprint()`. Bounded at 1024. See §12.
- **`_hwCache`** — bounded at 1024.
- **`_ledCache`** — per-controller. Packed int
  `(r<<21 | g<<14 | b<<7 | hw)`. Framework-owned storage,
  hardware read/write via `hw.writeLED` / `hw.blank`. Reversed
  for `inspect('why')` by `hw.decodeLedCache(val)`.
- **`_pacers{}`** — per-controller, named `Pacing` instances.
  `ctrl.pacer('led')` returns the sysex frame queue (throttle
  `TIMING.sysexThrottleMs`). Cap `TIMING.pacingMaxQueue` — overflow
  evicts the oldest via `Pacing.onDrop`, which the framework
  registers to clear the corresponding `_ledCache` slot. Zero
  throttle (`throttleMs <= 0`) flushes immediately on each
  `writeLED` and never holds a timer.
- **`_blankLeds`** — clears all pacers, clears `_ledCache`, then
  delegates to `hw.blank(this)`. K3's implementation sends the
  short-message sweep unconditionally (previous session may have
  left K2 notes lit) and the sysex sweep only in sysex mode.
- **`_resolvedPatchCache`** — set once at construction.
- **`_resolvedTargetHashCache`** — WeakMap keyed on cfg,
  invalidated by token fingerprint.
- **`_funcIdCounter` / `_funcIdMap`** — reset every boot.
- **`_phraseHotcueSlotsCache` / `_phraseHotcueSlotsCacheSrc`** —
  memoized by `PHRASE_HOTCUE_SLOTS` array identity. Reset in
  `test/run.js` between tests.
- **`XoneK3._TIMING_DEFAULTS`** — immutable snapshot of the
  framework TIMING defaults. `applyPacing` resets from this
  before merging overrides. Do not mutate. Do not reset between
  tests (it's the source of truth for the reset itself).
- **`SCHEMES`** — cleared by `lib-schemes.js` on every evaluation.
  Compiled-scheme references on live bindings are object
  references, not names — they survive the clear.

## Beat math

- **`sampleT` order is position → curve.** Preserves curve shape
  at every position; holds boundary segment out of range.
- **The beat gate sits above ramp selection.**
- **Marker bypasses the flat solve but DOES beat-apply.**
  Co-match does not — cascade flashes defeat its purpose.
- **`st.hasBeat` is that channel's "deck is producing beats"
  test,** not `count > 0`.
- **`Binding._beatStateFor` is the shared preamble.**

## Patches and bindings

- **Sibling layers do not inherit.**
- **`_recompute` always calls `_refreshAllLeds` internally.**
- **`_reapplyByTokens` short-circuits on resolved target.** See §8.
- **`_refreshAllLeds` is re-entrancy-guarded.** Only legitimate
  nested path is `_refreshAllLeds → _syncBeatClocks →
  _openBeatClocks → _startVirtualClock → _resolveDisplaySource →
  _refreshAllLeds('display-source')`.
- **`_safeBinding`** — shared per-binding try/catch. Method
  reference and args passed separately, safe under re-entrancy.
- **`_batchPatches` gives the mutator a copy and enforces the
  contract in code.**
- **`setTopMode` preserves position.** Non-owned patches keep
  relative order.
- **Numeric `on.state` without `equals` warns once per binding,
  from `_isOn` only.**
- **`_applyBinding` refreshes only when the caller asks.** Batch
  callers pass `skipRefresh: true`. `_applyResolved` gates on
  `_recomputeDepth > 0` so direct callers still get a per-binding
  refresh.
- **Hash cache relies on cfg object identity being stable.**
- **`_hashBinding` uses `\u0001` as separator and JSON-quotes
  strings.**
- **`_onInput(b)` runs before the binding's func.**
- **Soft-takeover bridge.** `_rearmSoftTakeover` writes CO's own
  value back to itself: diff zero, Mixxx's check passes,
  `initialized` flips. `TAKEOVER_EPSILON = 2/127` >
  `CO_MATCH_EPSILON = 1/127` — LED "matched" implies control
  live.
- **First bind also rearms soft takeover.**
- **Held push buttons use the transaction model (§2.5).** A
  rebind during a hold orphans the transaction; the captured
  release fires at physical release against the press-time
  config. The CO stays at its press-time value until then —
  deliberate. `this._transaction.orphaned` is readable from a
  func to branch on the orphan case.
- **Push-mode bounce guard.** A `v > 0` event arriving while a
  transaction is already active is treated as hardware bounce
  and skipped — no func dispatch, no default input, no state
  change. Prevents per-press flag resets (`_bpmHeldTurned`,
  `shutdownHold`'s timer) mid-hold. The real release still
  dispatches the captured func normally. See §2.5.
- **`valueCurve` doesn't touch `_normalized`.**
- **LED on/off state comes from `colorScheme.on`, `outKey`, or
  nothing.**
- **`_isOn` returns `v ? 1 : 0`** for state without comparators.
- **`_patchActive` is the source of truth.**
- **`_buildStack` puts chord last.**
- **Beat clocks are lazy but effectively always open in shipped
  presets.**
- **`on.co` gets its own connection.**
- **Lab renderers discover cells by func reference.**
- **`track_loaded` also resets a channel's beat counter and
  `_lastLoopTouchMs[ch]`.**
- **Routing is token-based, not func-based.**
- **`_resolveFxPatchName` returns `undefined` for "not mine",
  `null` for "mine but missing", string for the target.**
- **`_syncFxLayout` batches all swaps into one `_batchPatches`.**
- **Group-enable cells use a single-colour scheme, not a ramp.**
- **`_warnOnce` dedupes per key per boot.**
- **`_sendColor` short-circuits `mixxx`-typed LEDs when
  `isOn === 0`.**
- **THEME is read live by every shipped emitter.**
- **`_bootWith` spawns one controller per entry.**
- **`_tokenFields(cfg)` is the single field enumerator.**
- **Every file after `lib-core.js` throws on missing prereqs.**
- **`this.bindings` is the only name for the binding map.**
- **`_bindConns` skips the `outKey` connection when `_csOn` is
  set** — including `on: false`.
- **`countdownScheme` derives its A / B family from the raw
  group token,** not the resolved group. `$DECK_ACTIVE$` is also
  matched — the suffix comes from `ctrl.activeDeck` and follows
  focus changes on every LED repaint.
- **`Pacing`'s drain timer bails on empty queue only.** Shutdown
  polls `hw.anyPendingWrites`. The framework doesn't touch the
  pacer's timer directly.
- **`_validateBindings` token warnings go through `_warnOnce`.**
- **`LabController.shutdown` runs the slot dump synchronously**
  before the parent's async sysex drain.
- **`_evaluateScheme` warns on fresh-object identity.**

## Pacing and hardware

- **`XoneK3.TIMING` is the single source of truth for timing
  constants.** Compat re-exports on `XoneK3.*` mirror it for
  existing read sites; `applyPacing` refreshes them after merge.
- **`applyPacing` resets from `_TIMING_DEFAULTS` before merging.**
  Without the reset, loading preset A (custom pacing) then B
  (defaults) would leave A's values poisoning B.
- **`applyPacing` is idempotent.** Called from both `bootCat`
  and `_bootWith`; second call is a no-op if overrides are the
  same.
- **Epsilon invariant** — `takeoverEpsilon > coMatchEpsilon`.
  Broken override → warn-once + restore both defaults.
- **`ctrl.pacer(name)` is lazy.** First call creates the
  instance with `TIMING.sysexThrottleMs` as its throttle. K2
  mode never calls it — no pacer is allocated.
- **`Pacing.onDrop` clears `_ledCache[idx]`.** Registered by
  `ctrl.pacer` when the instance is created. Without it, a
  dropped frame's cache slot stays populated and a future
  render with the same payload would hit the dedupe and silently
  drop the LED.
- **Framework never sees note numbers or sysex bytes.** Protocol
  primitives live in `HW_K3`; `sendLED` only passes
  `(idx, r, g, b, hw)` to `hw.writeLED`.
- **Blank sweeps are hardware-side.** K3 sends the short-message
  sweep unconditionally (previous session may have left K2 notes
  lit — sysex can't reach those). Sysex sweep only when
  `ctrl.sysex !== false`.

---

# 22. Limits

- `chain_selector` only steps ±1. Not a readable index.
- Boot-white is session-scoped.
- Beat displays on paused decks too; `BEAT_PLAYING_MODE` /
  `BEAT_PAUSED_MODE` pick the behaviour. A beat LED whose
  `logicalOn` reads 0 while paused blacks out regardless of mode.
- `barBeats` / `phraseBars` clamped 1..32 in the lab.
- `prePhraseBeats` clamped 0..`phraseLen - 1`.
- Bake: structural samples at segment count; sampled / wire at
  23 points.
- No BPM read for the pulse.
- The four `fxLayout*` / `fxMini*` patterns are the only top-half
  layout families the runtime knows about. Adding a fifth means
  extending `_resolveFxPatchName` and the mode table.
- **Sub-beat loops work for the count.** Pulse may look erratic.
- **Two layer trees.** Playback presets share `CAT_LAYERS`;
  colorLab has its own.
- **Controller split is load-order sensitive.**
- **Loop-boundary encoders are ungated.** They stamp
  `_lastLoopTouchMs[ch]` but the gate only restricts beatjumps.
- **`mixxx` stops are static-only.** `mixxx` resolves its rgb
  from the pad's hotcue colour at render time, and only
  `_renderStatic` handles that path. In a sampled ramp — a
  deviation LED's `knob:` scheme, a multi-stop scheme with a
  `mixxx` entry, or a calibration solve — there is no rgb to
  sample. The stop is skipped with a `sampleSegsMixxx`
  warn-once; a snap sample returns the previous valid stop's
  colour, a blend sample interpolates between the nearest valid
  stops, and the whole ramp renders black if no valid stops
  exist.
- **Hardware descriptor contract.** Six HAL methods:
  `buildBindings(ctrl)`, `wireInputs(ctrl)`,
  `writeLED(ctrl, idx, r, g, b, hw)`, `blank(ctrl)`,
  `anyPendingWrites(ctrl)`, `decodeLedCache(val)`. Three data
  blocks: `DEFAULTS` (boot defaults, incl. `midiChannel`,
  `sysex`, calibration data), `pacing` (TIMING overrides),
  `LED_TRANSFERS` (raw transfer curves). Framework never reads a
  note number, a sysex byte, or a physical-note constant — all
  live inside the hardware descriptor. See
  `xone-k3-hw-k3.js` file-header docblock for the K3's shape.
- **Bindings the hardware doesn't provide go dark silently.**
  `_applyBinding` skips unknown names; `_validateBindings`
  warns at boot if a modifier's `heldBy` references a missing
  binding. Config files are portable across hardware by
  construction — a preset that uses `grid*` on a hardware with
  no grid just leaves those cells dark.
- **Pacing is global (`XoneK3.TIMING`).** Multiple devices with
  different `hw.pacing` values would need per-device
  restructuring if that ever becomes a real case. Today
  `_bootWith` applies the first device's `hw.pacing` for all.
- **`hw.DEFAULTS` merges shallowly.** `midiChannel`, `sysex`,
  calibration fields — a preset override replaces the whole
  field. `wbGain` and `channelPerceptual` are arrays; a preset
  override must supply a full 3-element array (validation warns
  + falls back to `[1,1,1]` otherwise).