# Internals

How the runtime actually works, for someone modifying it. If
you're just customising a preset, `CUSTOMISE.md` has everything
you need — this file is the engine room.

Companion docs:

- `CONCEPTS.md` — the mental model (bindings, patches, stack)
- `CUSTOMISE.md` — field reference and recipes
- `HARDWARE.md` — the descriptor contract
- `PERCEPTION.md` — the perception model
- `README.md` — shipped behaviour per preset

---

## §0 — Known artifacts

The physical files have `.js` extensions (v2.1.x port from
`.mjs`), but some comment headers still say `.mjs`. That's a
cosmetic leftover from the port — the load order and behaviour
described in this file is correct for the `.js` files on disk.

The lab controller lives in `config/k3-lab.js`, not `lib/`. It
extends `Controller` but ships with the config tree — load it
after `lib/funcs.js` (its `LAB_PAINTER_FUNCS` list captures
`myCatnip.FUNCS.*` at load time).

---

## §1 — Files and load order

Presets load the library, one hardware descriptor, the controller
modules, and finally their own config layers. Any change to this
list means editing **five** `.midi.xml` files and `test/harness.js`
(the five playback presets share it; colorLab is separate).

```
lib/core.js                    myCatnip global, shared state,
                               tokens, binding field table,
                               palette hooks, beat math
lib/timing.js                  TIMING, Pacing queue, applyPacing
lib/schemes.js                 scheme engine: compile, sample,
                               palette resolution
lib/perception.js              perception model + per-HW caches
lib/binding.js                 Binding primitive, colour render
                               path, transaction model
hw/k3.js                       K3 hardware descriptor
lib/controller.js              Controller core: constructor,
                               patch resolution, focus, modes,
                               modifiers, shared publication
lib/controller-colour.js       on: parser, schemeFromState,
                               _setupColorScheme
lib/controller-beat.js         timelines, origin, beat clocks,
                               boot settle
lib/controller-render.js       pacer, sendLED, brightness solve
                               delegator, beatjump gate
lib/controller-boot.js         init / shutdown / boot / halt
lib/funcs.js                   builders + myCatnip.FUNCS
lib/inspect.js                 inspect() probes

config/k3-cat-schemes.js       THEME, QFX_CHAIN_LIST,
                               PHRASE_MARKER_COLORS, SCHEMES
config/k3-cat-fx.js            FX layout tables + emitters
config/k3-cat-top.js           focus / twoDeck / mini bases
config/k3-cat-bottom.js        cue / loop / oddLoop layers
config/k3-cat-overlays.js      selectAB / fxRouting / chord
config/k3-cat.js               CAT_LAYERS assembler + bootCat()

k3-cat.js / k3-kitten.js / k3-onek3.js / k3-onek3-minifx.js
                               entry modules (boot overrides)
```

**colorLab replaces the cat-* layer tree** with its own. Scheme
data still loads from `cat-schemes.js` — the lab's
`SCHEME_REGISTRY` references scheme names registered there.

```
config/k3-cat-schemes.js       THEME, QFX_CHAIN_LIST,
                               PHRASE_MARKER_COLORS, SCHEMES
config/k3-lab.js               LabController, bakeScheme
                               (loads after lib/funcs.js)
k3-colorlab.js                 colorLab layers + boot
```

**Why several controller files.** Each extends
`Controller.prototype` with a distinct concern (colour parsing,
beat pipeline, render path, boot lifecycle). Splitting them
keeps each file ~400–600 lines. The `_requireLoad` mechanism
declares the dependency order, so a wrong `.midi.xml` order
throws at load with a message naming the missing symbols.

**Bootstrapping.** `lib/core.js` opens with
`var myCatnip = (typeof myCatnip !== 'undefined') ? myCatnip : {};`
— Mixxx shares one global across all `<scriptfiles>`. Every other
file calls `_requireLoad(file, prereqs)` which throws if a
prerequisite symbol is missing.

---

## §2 — The shape of a controller

A `Controller` holds:

- **Bindings** — one `Binding` per physical control (`this.bindings`).
  Each carries current `group`/`inKey`/`outKey`, its func, its
  colour-scheme state, its CO connections, and its transaction.
- **Active state** — `activePatches` (ordered list),
  `activeDeck`/`activeFx`, `selectedDeck*`/`selectedFx*`,
  `modifiers` (boolean per declared state).
- **Per-controller caches** — `_ledCache` (last LED value per
  idx), `_pacers` (pacing queues), `_decks` (per-channel beat
  state), and the scheme/patch caches.
- **The hardware descriptor** (`this.hw`) — resolved at
  construction from `cfg.hw || myCatnip.HW_K3`. Framework reads
  it only to delegate the six HAL methods and to consult
  `PERCEPTION` / `PALETTE` / etc.

Session-wide state lives on `myCatnip.shared`:
`shared.timeSig[ch]`, `shared.lastLoopTouchMs[ch]`,
`shared.warned`, `shared.controllers[label]`. Owner-write,
everyone-read (see `HARDWARE.md` §4).

**The unit of work.** One physical control is one `Binding`. When
the patch stack changes, some bindings rebind, some don't, and a
few may unbind entirely. The recompute cycle (§4) is what
reconciles `activePatches` → `bindings`.

---

## §3 — Boot and shutdown

### Boot

`myCatnip.boot(devices)` / `myCatnip.bootLab(devices)` call
`_bootWith`. That:

1. Shuts down any previously-running controllers.
2. Resets global caches (`_schemeCache`, `_compiledCache`,
   `_funcIdCounter`/`_funcIdMap`, `_modeSeen`) and session state
   (`shared.timeSig`, `shared.lastLoopTouchMs`, `shared.warned`,
   `shared.controllers`).
3. Applies the first device's `hw.pacing` to `TIMING` (idempotent
   — `bootCat` also calls it before `myCatnip.boot`).
4. Constructs one controller per device, calls `init()`, then
   `ctrl.hw.wireInputs(ctrl)`.

`init()` blanks LEDs, runs an initial `_recompute`, calls
`_validateBindings` (warn-once per misconfiguration), and
schedules a **250 ms beat-clock reopen**.

**Why the reopen.** Mixxx's first CO tree read at startup can
register connections that never fire. Closing and reopening the
beat clocks 250 ms later lets them fire against a settled tree.
A `_shuttingDown` guard prevents a reload landing inside the
window.

The reopen triggers `_startBootSettle()`, which reschedules
`_catchUpChannel(ch)` for any channel where boot-relevant COs
are still firing (within `BOOT_SETTLE_MS` of the last fire),
capped at `BOOT_MAX_ATTEMPTS`. Warns once per channel on cap
hit. Prevents a slow CO tree from leaving `_loadedState[ch]`
or `st.playing` wrong until the next unrelated event.

### Shutdown

`shutdown()` sets `_shuttingDown` (which gates every other
send path), runs `_blankLeds()` (clears pacers, clears
`_ledCache`, calls `hw.blank(ctrl)`), then polls
`hw.anyPendingWrites(ctrl)` every 20 ms until drained (or 2000 ms
max). On drain: clears remaining pacers, closes beat clocks,
calls `_shutdownExtra()`.

The framework never inspects a queue directly. `anyPendingWrites`
is the abstraction — for K3 that's
`ctrl._pacers.led.length() > 0`. A synchronous hardware returns
`false` immediately, so shutdown doesn't wait.

`halt()` is `shutdown()` on every controller, then a full reset
of `myCatnip.controllers`.

---

## §4 — The recompute cycle

The heart of the runtime. **Config changes** (focus moves, patch
adds/removes, shift pressed/released, modifier state flips) route
through `_recompute`. Physical input doesn't — it goes through
`Binding.input` and touches only what the binding dispatches.

```
_recompute()
  _buildStack       → [stack names, order matters]
  _resolveStack     → merged binding cfg map
  _applyResolved    → hash-diff each binding; rebind what changed
  _afterRecompute   → subclass hook (Lab uses this)
  _refreshAllLeds   → sync beat clocks, repaint every LED
```

**Callers don't repaint after.** `_reapplyByTokens` is the one
exception — it ends with the same refresh unless passed
`{ skipRefresh: true }`, because focus setters call it and want
to control their own refresh.

`_buildStack` filters by `_host` (overlay gating), collects shift
companions if shift is held, and appends chord last. A
`_noModifiers` patch (§8) suppresses the companion and chord
appends entirely.

`_applyResolved` diffs each binding's hash against the previous
one. Three short-circuits keep it cheap:

- `oldCfgs[name] === cfg` (object identity) skips the hash
  entirely. Works because `_resolvePatch` memoizes its output per
  patch name.
- `oldHashes[name] === newHash` skips the rebind.
- `_applyOneSafe` wraps each `_applyBinding` in try/catch, so one
  throwing binding doesn't stop the pass (warns once).

`_refreshAllLeds` is re-entrancy-guarded. The only legitimate
nested call is
`_refreshAllLeds → _syncBeatClocks → _openBeatClocks →
_startVirtualClock → _resolveDisplaySource → _refreshAllLeds`
(the display-source resolution during clock-open triggers its own
repaint on the active deck).

**The rule:** change anything about the config, call
`_recompute()`. Change anything about physical input, let the
binding dispatch. Nothing else.

---

## §5 — Patches

`activePatches` is an ordered list. The stack resolves it as:

- **Parents first.** A patch can declare `patch: ['a', 'b']` and
  each parent is merged in order, then the patch's own bindings
  on top.
- **Siblings don't inherit.** CUE and LOOP are siblings — a cell
  defined in CUE isn't visible when only LOOP is active.
- **`_host` gates overlays.** A patch with `_host: [...]` only
  applies while one of those hosts is in `activePatches`.
- **`_shift` names a companion.** Applies while shift is held,
  inheriting the base's parent chain.
- **`_noModifiers`** disables the modifier system (shift
  companions, chord, `patchActivate`) while that patch is active.

Resolution is memoized per patch name in `_resolvedPatchCache`.
Patches are fixed at construction, so a resolved patch is stable
per controller. This is what makes `_applyResolved`'s identity
check fire.

Four mutations:

```js
addPatch(name)                // adds to end
removePatch(name)             // removes
replacePatch(from, to)        // in-place swap
_batchPatches(mutator)        // N edits, one recompute
```

`_batchPatches` gives the mutator a **copy** of `activePatches`.
Nested calls throw, and `addPatch`/`removePatch`/`replacePatch`
throw inside a mutator (you mutate the array argument instead).
On return, if the array changed, the runtime commits it and runs
one `_recompute` plus one `_onPatchChange` per add/remove.

---

## §6 — Top-half modes

```
focus:       topShared   + fxLayout<n>
twoDeck:     twoDeck     + fxLayoutA<n> + fxLayoutB<n>
mini:        twoDeckMini + fxMini<n>
```

`myCatnip.TOP_MODES` declares each mode's `owns` (every patch
name) and `activate(ctrl)` (the list to add for the current
focus state). Mode is inferred from `activePatches` via
`currentTopMode()` — there is no `this.topMode`.

`setTopMode(mode)` unwinds every patch owned by any mode, then
re-inserts the target's activate list at the position where the
first owned patch sat. Non-owned patches keep their relative
order — so overlays, cue/loop layer, chord, and any custom
patches stay where they were in the stack.

`_syncFxLayout` runs from `_afterFocusChanged`. It scans
`activePatches` for fx-family entries (`fxLayout<n>`,
`fxLayoutA<n>`, `fxLayoutB<n>`, `fxMini<n>`), resolves each to
the current focus's target, and swaps in one `_batchPatches`. If
nothing needed to change it returns `{ swapped: false }` and the
caller repaints itself.

---

## §7 — Focus and tokens

Two independent focus axes: deck focus (A/B) and FX focus (A/B).
Each slot holds a *pinned* assignment (`selectedDeckA`,
`selectedDeckB`, `selectedFxA`, `selectedFxB`). Switching
`activeDeck` or `activeFx` picks which pinned slot is live
without changing the pins themselves.

`_refreshActiveAlt` recomputes the four derived fields
(`selectedDeckCurrent`, `selectedDeckAlt`, `selectedFxCurrent`,
`selectedFxAlt`) and refreshes the display flags (which also
depend on the current channel's loop state).

**Three setters, one helper.** `setSelectedFor`, `setActiveDeck`,
`setActiveFx` all route through `_afterFocusChanged`:

```
_refreshActiveAlt()
_reapplyByTokens(changedTokens, { skipRefresh: true })
if !_syncFxLayout().swapped: _refreshAllLeds(reason)
_publishShared()
```

One repaint per focus change, on every path.

### Tokens

A binding's group string can carry `$DECK_ACTIVE$` etc. These
resolve at bind time. `_reapplyByTokens` re-applies bindings
whose `_usedTokens` include the changed token.

Three short-circuits keep this cheap:

1. **Resolved-target hash.** For each candidate binding, compute
   a hash of every token-bearing field *after* resolving. If the
   hash matches the binding's previous one, no rebind — the focus
   change didn't actually move this binding's CO.
2. **Memoization.** The hash is cached per cfg object in a
   WeakMap, keyed on a token-fingerprint (a positional snapshot
   of every token state field). If the fingerprint hasn't changed
   since the last call, the cached hash is used directly.
3. **Shared fingerprint.** `_reapplyByTokens` computes the
   fingerprint once and threads it through every call, so
   bindings processed in one pass all share the same key.

`_tokenFields(cfg)` is the single enumerator — it walks
`_BINDING_FIELDS` rows that carry a `token:` label. Adding a new
token-bearing field means one row in that table; `_usedTokens`,
`_validateBindings`, and `_resolvedTargetHash` all derive from
it automatically.

---

## §8 — Modifiers and transactions

### Transactions

A physical push-mode press is a **transaction**. It's captured
at press, dispatched at release. That's what makes rebinds,
patch changes, and layer shifts safe to perform while a button
is down.

**Press:**
- `_captureTransaction` snapshots the binding's `group`, `inKey`,
  `_func`, `_funcArgs`, `buttonMode` onto `b._transaction`.
- `_onBindingPress` fires (runs `_updateModifiers`, §8.3).

**During the hold:**
- Subsequent `v > 0` on the same binding is a bounce — no
  dispatch, no state change (§8.2).
- Any rebind through `_applyBinding` calls `_orphanTransaction`,
  which compares the captured signature to the current binding.
  A mismatch marks `_transaction.orphaned = true`.

**Release:**
- `_dispatchCapturedRelease` installs the captured surface
  temporarily, fires the press-time func or default input, then
  restores the current surface in a `finally`. The func sees the
  press-time config — `this.group` inside is the CO the press
  was bound to, not whatever the binding now points at.
- `_onBindingRelease` fires.
- `_transaction.active = false`. Orphaned is **sticky** — once
  set, it stays set until the next press.

The transaction is session-scoped. `_reset` doesn't wipe it. The
captured config survives the binding's unbind/rebind cycle, which
is the whole point: the release must dispatch what was pressed,
not what the binding happens to be at release time.

If a func wants to know "was I orphaned during this hold?", it
reads `this._transaction.orphaned`. Useful for suppressing a
user-facing side effect that no longer makes sense.

### Bounce guards

Push-mode and toggle-mode both need a bounce guard. They're
different mechanisms:

- **Push-mode:** `v > 0` while a transaction is active → bounce,
  skip dispatch. Prevents mid-hold flag resets that would change
  user-visible behaviour (e.g. `_bpmHeldTurned`, the
  `shutdownHold` timer). The real release still dispatches
  normally.
- **Toggle-mode:** `_togglePressActive` is a session-scoped
  boolean set on the first `v > 0` and cleared on **any** button
  release. Prevents a hardware bounce from double-firing the
  toggle (which would flip and un-flip the CO, so the user sees
  no change). The "clear on any release" rule handles the
  `toggle → push → toggle` rebind case: even if the binding
  changed mode mid-hold, the release still clears the flag.

### Modifier states

Declared in `cfg.modifierStates.<name>`:

- `heldBy` — array of binding names. Modifier is active while
  every one has an active transaction.
- `patchActivate` — patch name. Idempotently enforced: the
  runtime checks `activePatches` against `modifiers.<name>` on
  every press and release, and adds/removes the patch if it's
  out of sync. A config func that removes the patch out of band
  gets corrected on the next press/release.
- `recompute` — if true, a state change triggers a standalone
  `_recompute`.
- `onActivate` / `onDeactivate` — hooks, called with `ctrl` as
  `this`.

`_updateModifiers` runs from `_onBindingPress` /
`_onBindingRelease`. All patch changes from one pass batch into
one `_batchPatches`. If there were state changes with
`recompute: true` but no patch changes, a standalone
`_recompute` runs at the end.

**Order independence.** Chord activates regardless of whether
shift or layer went down first. The state check is set
membership (`every heldBy is held`), not an enter/exit edge.
Users press shift-then-layer and layer-then-shift
interchangeably, and any edge-based model would leak a stuck
state when the second button's press arrives before the first
is released.

**Throw safety.** `_onBindingPress` / `_onBindingRelease` wrap
the call in try/catch. A throwing `onActivate` / `onDeactivate`
hook or `patchActivate` enforcement must not propagate through
the MIDI handler. If a throw leaves `modifiers` inconsistent
with `activePatches`, the next press or release re-runs
`_updateModifiers` on the full held set — `patchActivate` is
idempotent, so the divergence self-heals. Rollback on throw was
considered and rejected: the divergence window is bounded by
the next user input, the observable difference is nil, and the
snapshot cost on every press/release would buy nothing.

### `_noModifiers` patch flag

A patch can declare `_noModifiers: true`. While any
`_patchActive`-satisfying patch carries it,
`_hasNoModifierPatch()` returns true and three things are
suppressed: shift companions aren't appended, chord isn't
appended, and `patchActivate` enforcement is skipped entirely.
A `_noModifiers` patch whose `_host` isn't satisfied is inert —
both `_buildStack` and `_hasNoModifierPatch` gate on
`_patchActive`. Shipped by snake, whose game owns the surface
and mustn't have chord re-added mid-play.

---

## §9 — Chord

Chord is a modifier state, not a layer button branch. Declared in
the boot config as `modifierStates.chord` with
`heldBy: ['shift', 'layer']` and `patchActivate: 'chord'`. Active
while both shift and layer are physically held, regardless of
press order.

`F.layerButton` runs on physical layer press. It early-returns
when `modifiers.chord` is true, and swaps the layer patch
otherwise. There is **no release branch** — the captured layer
press's release goes through the transaction system, which sees
the same early-return. Chord exits by the modifier state going
false when either shift or layer releases.

**Chord wins over shift companions.** `_buildStack` holds the
chord patch aside and appends it after shift companions, so a
cell declared in chord overrides the same cell in a shift
companion.

**`grid2_1` is special.** It's not a CHORD cell. Under chord it
routes through `CUE_SHIFT.grid2_1` / `LOOP_SHIFT.grid2_1` — each
is a closure that checks `ctrl.modifiers.chord` and dispatches
`toggleLayerOverlay(['hotcue2', 'loopOdd'])` on match; under
shift-only it flips the active deck. This lets the shift
companion reach through the chord stack on one specific cell.

`layerExitOverlay` still works for overlays that occupy `layer`
— press removes the overlay, release is a no-op (the overlay
isn't in `activePatches` anymore). The old release-branch caveat
is gone.

---

## §10 — Timeline and beat

### Two timelines per channel

- **Track** — `playposition`. Beat 0 = file start. Origin sets
  where "count 1" sits. Default.
- **Loop clock** — accumulates musical progress through loop
  wraps. Forward-only, rate-scaled. Runs only while the loop is
  active **and** the deck is playing.

The loop clock is a *session clock*, not a position readout.
`clock.pos` advances by `dt × rate / duration` per tick — what
the playhead *would* have moved if the loop played through
sequentially. It doesn't reverse when the deck reverses, and it
doesn't need wrap detection. That's the whole design: the loop
is a musical figure that resets the playhead but doesn't reset
the count.

**Display source.** `st.displaySource` is `'track'` or `'loop'`
and picks which timeline the cascade reads from. It's resolved
by `_resolveDisplaySource`, which fires whenever the loop clock
starts/stops or the deck starts/stops playing. Manual cycle via
`cycleDisplaySource` (loop `grid2_0`).

**The pulse is not the count.** Bright/dim phase always comes
from the *track* position's fractional beat, in both display
sources. The loop clock moves the beat number, not the phase.

### Origin

The beat number where "count 1" sits. Derived from marker
hotcues:

- Only hotcues in `PHRASE_HOTCUE_SLOTS` (default `[9,10,11,12]`)
  are seeded, watched, and scanned.
- Only hotcues whose colour appears in `PHRASE_MARKER_COLORS`
  count as markers.
- Origin = the last marker at or before the playhead, or — before
  the first marker — the *next* marker ahead (so pre-phrase
  playback shows a negative count that reaches zero at the first
  marker).

`_deriveOriginFromPosition` reads `_decks[ch].hotcueState` — a
cache seeded at clock-open and updated by per-slot observers. It
never reads the COs directly. Zero COs per tick.

**Frozen in loop mode.** While the loop clock runs, origin is
not re-derived, so the count marches monotonically through the
loop's iterations.

**No manual setter.** Origin is user intent expressed as
markers. Move the playhead, or place a marker.

### Beat maths

Metadata cached per channel: `duration`, `fileBpm`, `samples`,
`outroEnd`. `_loadedState[ch]` gates all metadata reads — set by
`track_loaded`, seeded by `_catchUpChannel` at boot. When false,
`_trackMeta` returns synthetic empty meta without reading any
COs, so an unloaded deck can't leak the previous track's
duration.

`_loadSettlingAt[ch]` is stamped by every metadata-relevant CO
fire (`track_loaded`, `track_samples`, `duration`,
`file_bpm`). Inside `META_SETTLE_MS` of the last stamp,
`_trackMeta` reads live but skips the cache write, so the mixed
old/new tuple from a track swap never poisons the cache.

**`[ChannelN],rate` is the slider position** (~−0.08..+0.08), not
a multiplier. `_channelRate` prefers `rate_ratio`; falls back to
`1 + rate`. A `<= 0` guard on `rate` silently returns unity on
every pitch-down — see §20.2.

### Clock connections

Twelve CO connections per channel, opened when a beat LED is
attached to any binding (`_needsBeatClocks`):

| CO | Effect |
|---|---|
| `beat_active` | Pulse source |
| `playposition` | Advances loop clock; position-tick repaint |
| `play_indicator` | Sets `st.playing` |
| `track_loaded` | Clears meta cache; resets beat state |
| `loop_enabled` | Starts / stops loop clock |
| `slip_enabled` | Count resync |
| `rate_ratio` | Updates `_rateCache[ch]` |
| `reverse` | Updates `_reverseCache[ch]` |
| `track_samples` | Track identity changed; invalidates meta and re-seeds hotcues |
| `outro_end_position` | Invalidates meta cache. No repaint (drag fires at UI rate) |
| `duration` | Clears meta, restarts settle, refreshes beat LEDs |
| `file_bpm` | Clears meta, restarts settle, refreshes beat LEDs |

Plus, when `PHRASE_MARKER_COLORS` is non-empty, two observers per
slot in `PHRASE_HOTCUE_SLOTS` (8 connections per channel by
default) that update `st.hotcueState` and re-derive origin.

### Two writers of `st.active`

- `_onBeatActive` writes it from the `beat_active` CO.
- `_repaintFromPosition` writes it from `trackFrac < 0.5`.

Both write from track fraction, so they agree. But they fire on
different schedules, and without a guard they'd briefly disagree
at beat boundaries — the LED flickers, sometimes showing two
pulses per beat.

The guard: skip the pulse repaint if `beat_active` has fired
recently (within `BEAT_STALL_MS`), playing forward, not
reversing. `_syncBeatCount` still runs (count updates continue),
only the `st.active` write is skipped. When `beat_active` has
stalled, the guard fails and `_repaintFromPosition` takes over,
so the pulse phase doesn't freeze.

**Backward motion bypasses the guard.** `beat_active` fires
irregularly on backward jog; without bypassing, the guard would
freeze `st.active` while count kept moving.

### Boot settle

`_startBootSettle()` (called from the 250 ms reopen) reschedules
`_catchUpChannel` while boot-relevant COs are still firing
within `BOOT_SETTLE_MS`, capped at `BOOT_MAX_ATTEMPTS`.
Warn-once per channel on cap hit. A single catch-up against a
still-populating CO tree leaves state wrong until the next
unrelated event fires; the settle loop reads the correct values
before the state goes stale.

`_catchUpChannel` also re-seeds the hotcue cache and re-derives
origin when the cache is empty. That state arises when beat
clocks were closed (no beat LEDs active) across a track load —
`track_loaded` and `track_samples` observers weren't wired, so
neither fired, leaving `_phraseOrigin` at the previous track's
value.

---

## §11 — Scheme compilation

`compileScheme(ref, overrides, seen, ctrl)` resolves a scheme
reference into a compiled object with `on` / `off` segments,
optional `co` companion, optional `marker`, and the tmap
(position + curve).

**Cycle detection.** `offScheme` and `coScheme` can name other
schemes. A scheme that names itself — directly or through a
chain — would recurse infinitely without protection.
`compileScheme` threads a `seen` Set through
`_compileFullScheme`. Strings match by value, objects by
reference. The cycle breaks at the innermost back-reference:
the referencing field compiles to null and warns once; the
outer call finishes normally. Without this, a bad config
crashes at bind time with a stack trace that points nowhere
useful.

**Per-HW compile cache.** `_compiledCacheByHw` is a WeakMap
keyed on the HW descriptor object. Two descriptors with
different `PALETTE` tables compile schemes independently —
important if two hardware run in one session. When no `ctrl`
is passed (tests, direct callers), it falls back to the global
`_compiledCache`.

**Bare palette names** resolve to single-colour schemes.
`{ colors: [[127, 0, 0]] }` is the minimal full scheme.

**Off-ramp** is either `offScheme` compiled, or generated from
the on-ramp at `hw.DEFAULT_RGB_BRIGHTNESS_OFF` (or the framework
default if the hardware doesn't override).

**`perception` field.** The compiled object carries
`perception: undefined | null | false | { mix?, brightness? }`
through to render. `compileScheme` translates legacy
`scheme.calibration: false` to `{ brightness: 'off' }` — filter
schemes from v2.0.0 keep their behaviour.

### Sampling

`sampleT(compiled, t)` shifts position first (via
`schemePosition`), clamps to `[0,1]`, then warps (via `curve`).
Position-first is what makes `schemePosition` slide the whole
curve — pivot included — through knob space.

`sampleSegs(segs, t, interp)` is snap (`interp: false`) or blend
(`interp: true`). Blend interpolates between the nearest valid
colour centres. `mixxx`-typed stops are skipped during sampling
with a warn-once, because they resolve their rgb from the pad's
hotcue colour at render time and there's nothing to sample.

---

## §12 — The render path

Every LED render goes through `Binding._refresh`. The whole body
is wrapped in try/catch — CO observers call `_refresh` directly
with no outer wrapper, so a throw would escape through Mixxx's
CO event loop.

```
_refresh()
  _csActive?      → _refreshColorScheme()
  outKey set?     → read outKey, send 0 or 127
  neither         → nothing
```

`_refreshColorScheme` is the interesting path:

```
1. _isOn()                  → logical on/off (0 or 1)
2. _evaluateScheme()        → compiled scheme (base + closure + memo)
3. _isBeatOffPhase()        → gate for the pulse
4. dispatch:
     _csDeviation?          → _renderDeviation(scheme, isOn)
     else                   → _renderStatic(scheme, isOn)
```

The beat gate sits **above** the ramp selection — a beat-off-phase
LED renders the off-ramp regardless of the current scheme
sampling.

`_evaluateScheme()` resolves the base + closure + memo into one
compiled scheme. If a scheme function returns a fresh object
twice with identical content, warns once
(`csSchemeFresh:<binding>`) — the fix is `composeScheme` or
hoisting the object out of the closure.

### Static vs deviation

**Static** (no `knob:` reference): picks `ramp[0]`, applies the
beat cascade if the scheme has one, sends. Brightness is the
scheme's brightness verbatim — **no perception brightness
solve**.

**Deviation** (`knob:` present): samples the ramp at the knob's
`_normalized` position. Runs co-match first (steering gradient
when the knob disagrees with its bound CO), then marker band,
then the ramp itself. **Brightness solve runs** on this path —
`_sampleRamp` calls `_solveHw` on every sample.

Both paths call `_sendColor` → `_send` → `ctrl.sendLED` →
`hw.send`. Mix correction runs on **both** paths — it's resolved
in `sendLED`, not in the render path.

### Output dispatch

```
_sendColor(entry, isOn, perceptionOverride)
  resolves rgb (including mixxx stops)
  resolves hw (isOn ? brightness : brightnessOff)
  calls _send(r, g, b, hw, perceptionOverride)

_send(r, g, b, hw, perceptionOverride)
  gates on idx < 0 / noLED
  calls ctrl.sendLED(idx, r, g, b, hw, perceptionOverride)

sendLED(idx, r, g, b, hw, perceptionOverride)
  shutdown gate + idx guard
  resolves mixMode (perceptionOverride → _perceptionMixActive kill-switch → HW default)
  applies applyMix if 'correct'
  calls hw.send(ctrl, idx, [r',g',b'], hw)
```

`sendLED` never sees a note number or a sysex byte. All
transport-level concerns live in the hardware descriptor.

`_solveHw` (in `controller-render.js`) is the counterpart for
brightness. It's called only from `_sampleRamp` (deviation and
co-match paths), resolves `brightnessMode` and `mixMode`, and
delegates to `myCatnip.perception.solveBrightness`.

### Pacers and dedupe

The framework dedupes LED writes on `(idx, packed rgb + hw)`
before calling `hw.send`. `_ledCache[idx]` holds the packed int;
a repeat render hits the cache and returns without a hardware
call.

Changed frames go through `ctrl.pacer('led', { sendFn })`, which
queues payloads and drains them at `TIMING.sysexThrottleMs`.
`Pacing.onDrop` (registered by `ctrl.pacer`) clears the
corresponding `_ledCache` slot when a frame is dropped from the
queue — without this, a dropped frame's cache slot would stay
populated and a future render with the same payload would hit
the dedupe and silently lose the LED.

A zero-throttle hardware sends synchronously and never allocates
a timer. `anyPendingWrites` returns `false` immediately, so
shutdown doesn't drain-wait.

### `_isOn`

Three sources, checked in order:

1. `colorScheme.on` — unconditional `true` / `false`, or
   `{ patchActive | state | co }` with optional `equals` /
   `contains`.
2. `group + outKey` — read the CO.
3. Neither — LED is off (0).

`on.co` gets its own `engine.makeConnection` and caches the
value. Numeric `on.state` without `equals` warns once per
binding on first render — a state that resolves to a non-bool
number will always be truthy, so the LED will never turn off.

---

## §13 — The input path

`Binding.input()` order:

1. `_onInput(b)` — hook for subclasses (Lab bumps its version).
2. `_readPhysicalInput(v)` — updates `_normalized` (knobs/faders)
   and clears `_togglePressActive` on button release.
3. `_maybeOpenTransaction(v, isPush)` — on the first `v > 0` of a
   push-mode button, captures the transaction and fires
   `_onBindingPress`.
4. `v === 0 && transaction active`? — dispatch the captured
   release, clear the transaction, fire `_onBindingRelease`,
   repaint observers, return.
5. `_isBounce(...)` — push-mode bounce (v>0 while held) or
   toggle-mode bounce (`_togglePressActive` still set from a
   previous press) → no dispatch, no state change.
6. `_dispatchInput(ch, cc, v, s)` — func if bound, else
   `_defaultInput` (CO write). Wrapped in try/catch.
7. `_postInputRefresh()` — updates `_lastCoValue` for knobs /
   faders, repaints observers.

### Default input

For a binding with `group + inKey` and no func:

- Button (push): writes `v > 0 ? 1 : 0`.
- Button (toggle): on `v > 0`, reads current CO value and writes
  the opposite.
- Knob / fader: writes `_applyValueCurve(_normalized)` via
  `engine.setParameter`.

### Soft takeover

`_rearmSoftTakeover` runs on every rebind for knobs / faders. It
writes the CO's own value back to itself — diff zero, Mixxx's
check passes, `initialized` flips. Combined with
`engine.softTakeover(group, key, true)`, this means a rebind
never leaves the control uninitialized. The invariant
`takeoverEpsilon > coMatchEpsilon` guarantees LED "matched"
implies the control is live.

### Observer pattern

A knob or fader carries `_ledObservers` — the LED bindings whose
`colorScheme.knob` references it. On input, `_refreshObservers`
repaints every observer. Each repaint is try/catch-guarded, so
one bad scheme doesn't block the others.

### valueCurve

`output = input ^ curve`. Applied at write time, after
`_scaleValue`. `_normalized` stays uncurved, so co-match and
`on:` comparisons see the physical position, not the warped one.

---

## §14 — Binding bookkeeping

Three interlocking pieces of state per binding: the **hash**, the
**defaults**, and the **snapshot**.

### `_BINDING_FIELDS`

One table in `lib/core.js` drives everything. Each row declares
how a field participates:

```js
{ name: 'group', hash: true, token: 'group', snapshot: { dest: 'group' } }
```

- `hash: true` — included in `_BINDING_CFG_FIELDS`, used by the
  rebind diff.
- `token: 'label'` — included in `_tokenFields`, which
  `_usedTokens`, `_validateBindings`, and `_resolvedTargetHash`
  all walk.
- `snapshot: { dest, transform? }` — captured before `_reset`
  so `_unbind` / `_rearmSoftTakeover` can see the previous
  state.
- `ignored: true` — reset-able but neither hashed nor
  snapshotted (deliberately, e.g. `buttonMode` because it can't
  change mid-press).

Adding a field is one row. `_BINDING_CFG_FIELDS`,
`_SNAPSHOT_FIELDS`, `_SNAPSHOT_IGNORED`, and `_tokenFields` all
derive from the table at load time.

### Hash

`_hashBinding(cfg)` joins each hashed field's value with `\u0001`
(SOH). Values: functions by `_funcId` (a WeakMap counter),
objects by key-sorted `_stableStringify`, strings by
`JSON.stringify` (quoted, so a `|` inside can't shift the field
boundary), everything else by `String()`.

`_applyResolved` checks `oldCfgs[name] === cfg` (identity) first,
then the hash. Identity hits when `_resolvePatch` returns the
same object — its memoization guarantees this across
recomputes over the same stack.

The boot-time audit (`_auditBindingCfg`, gated on
`_debugPrintsOn`) prints if a cfg key isn't in the table. Add
the field to the table if it should be hashed.

### Defaults

`_bindingDefaults()` returns every reset-able field at default.
Called from the constructor and `_reset`. Adding a field means
adding one line to that factory.

`_reset` wipes every defaulted field, then re-applies the
snapshot's rearm data (via `_rearmSoftTakeover` at next bind).

**Session-scoped state** lives outside the factory — not wiped
by `_reset`:

- `_normalized` — persists knob position across rebinds for
  soft-takeover bridging.
- `_ledObservers` — observer registration.
- `_transaction` — the captured press config, must survive
  rebinds (§8).
- `_togglePressActive` — bounce guard state, must clear on the
  physical release regardless of how many rebinds happened.
- `_lastOutKeyValue`, `_lastCoValue` — re-seeded at every bind
  by `_bindConns` / `_armOwnConn`; surviving `_reset` just avoids
  a transient `undefined` before the seed.

---

## §15 — Lab

`LabController` extends `Controller` and lives in `config/k3-lab.js`.
It replaces the cat-* layer tree with its own editor tree.

`this._lab` holds the editor state:

- `slots[0..15]` — 16 saved schemes. 0/1/2/3 = on/off/co/co-off;
  4..11 user saves; 12..15 auto-bake outputs.
- `edit` — the working buffer.
- `previewSource` — `'edit'`, a slot index, or a registry scheme
  name.
- `_version` — bumped on every input event, keys the preview
  compile cache.

### Preview vs edit

The LED strip shows `previewSource`. The edit buffer is only
editable when `previewSource === 'edit'` — `_commitPreview`
returns the edit buffer in that case, else null (warns once,
edit is a no-op). Shift+pressR loads the preview into edit.

### Auto-bake

When `previewSource` lands on `'edit'` or a slot 0..11, `_applyAutoBake`
recomputes slots 12..15 from the current preview:

- **12 structural** — source stops, everything live.
- **13 baked+interp** — brightness solved into the stops,
  interp forced `true`.
- **14 baked** — brightness solved, interp forced `false`.
- **15 export** — brightness solved, WB baked into rgb.

`bakeScheme` uses `perception._flatTarget` / `perception._bisectHw`
with the current mixMode threaded. A scheme-level
`perception: false` or `{ brightness: 'off' }` override skips
the calibration bake (matching render behaviour).

### Preview LED render

`_renderPreviewLedBody` runs the four-case matrix on the preview
scheme. Co-match first (if a preview CO is bound), then marker
band, then ramp sample. Beat-edit mode has a "stopped target"
branch — if the deck hasn't produced a beat, paint the selected
beat target's colour solid so you can see what you're editing.

All wrapped in try/catch — a user scheme that throws paints
black and warns once.

### Shutdown dump

`LabController.shutdown` runs the slot dump **synchronously**
before the parent's async sysex drain. On preset unload, every
populated slot prints to the console.

---

## §16 — Debugging

### Print channels

| Channel | Gate | Reset on boot |
|---|---|---|
| `debugPrint` | `_debugPrintsOn` | no |
| `modePrint` / `modePrintFirst` | `MODE_PRINTS` | via `_bootWith` |
| `_warnOnce` | none | via `shared.warned` |

`debugPrint` walks `PRINT_TABLES`, first matching table wins.
`_warnOnce(key, msg)` prints `[myCatnip] <msg>` once per key per
boot. Reload to re-arm.

Two structural diagnostic lines fire when `_debugPrintsOn`:

```
[myCatnip] _syncBeatClocks want=1 have=1 _beatLeds=2 applied=45
[myCatnip] beatjump gated: 87ms / 130ms
```

The first: mismatch at boot means the open/close decision is
wrong. `_beatLeds=0` with `applied=45` means a binding threw
during `_applyResolved` — the safety net is carrying the load.

The second: the beatjump gate fired. Check
`shared.lastLoopTouchMs[ch]` if it shouldn't have.

### `inspect()`

Read-only probes on any controller:

```js
ctrl.inspect()                  // root: focus, modifiers, bindings, shared
ctrl.inspect('patches')         // activePatches, stack, all patches
ctrl.inspect('beat')            // per-channel beat state, clock status
ctrl.inspect('tokens')          // token usage map
ctrl.inspect('dark')            // bindings not in the active stack
ctrl.inspect('perception')      // mode, curves, fingerprint
ctrl.inspect('shared')          // session state + all controller blocks
ctrl.inspect('why', 'layer')    // full pipeline walk for one binding
ctrl.inspect('grid0_0')         // one binding's details
```

`inspect('why', name)` is the workhorse. It shows every
intermediate state along the render path — bound, idx, type,
colorScheme resolution, perception settings, `_isOn()` result,
clock status, last LED write, and a verdict saying where the
pipeline stopped.

### Symptom table

Common symptoms and their likely causes:

| Symptom | Cause |
|---|---|
| Nothing lights | Preset not loaded. Reload. |
| `myCatnip: <file> requires <symbols>` at load | `<scriptfiles>` order wrong. |
| `myCatnip: lib/controller.js requires HW_K3` | `hw/k3.js` not loaded before `lib/controller.js`. |
| LEDs half-update on patch switch | A binding field missing from `_BINDING_CFG_FIELDS`. |
| Soft takeover stops working after a rebind | A reset-able field missing from `_SNAPSHOT_FIELDS`. |
| Fader stuck at endpoint after deck switch | `_rearmSoftTakeover` bridge didn't fire. Check `b._normalized !== undefined` at rebind. |
| No beat after Mixxx startup until reload | Init-time beat-clock open raced the CO tree. The 250 ms reopen fixes; boot settle makes it robust. |
| Loop clock doesn't resume after a preset reload during an active loop | `_openBeatClocks`'s catch-up loop reads loop state on open. |
| Beat colour sticks; correct when jogged | Position-tick guard returned before syncing count. `_syncBeatCount` must run before the early return. |
| Beat LED fires faster/slower on pitched deck, loop reading only | `_advanceVirtualClock` scaled by `[ChannelN],rate`. Must read `rate_ratio`. |
| Two decks drift out of phase in loop mode at same tempo | Both decks on the same accumulation strategy? Check `_cascadeCount` reads `clock.pos`. |
| Beat count jumps backward on tight loops | Wrap detection direction-based? Check `reversing` is read correctly. |
| Beat LED drifts across loop iterations, both decks at unity | `duration × fileBpm / 60` not an integer. Snap `duration` to a beat-multiple. |
| Beatjump doesn't fire after touching a loop control | Gated by `_beatjumpAllowed`. Set `_debugPrintsOn` for the gate line. |

Warning prefixes (all `_warnOnce`, all print once per key per
boot):

| Warning key | Cause |
|---|---|
| `_batchPatches mutator threw` | Mutator hit an exception. `activePatches` not modified (mutator got a copy). |
| `_applyBinding(<name>) threw` | One binding's bind path threw; rest continued. |
| `_syncFxLayout: fx-pattern patch ... has no matching target` | An fx-family patch is in `activePatches` but missing from `patches:`. |
| `colorScheme scheme function on X returns a fresh object` | Wrap with `composeScheme` or hoist the object. |
| `binding func threw on <name>` | The binding's func or default input threw. Observer repaint for that tick skipped. |
| `refresh threw on <name>` | A CO observer's repaint threw. LED stays stale until next refresh event. |
| `_onBindingPress(<name>) threw` / `_onBindingRelease(<name>) threw` | A modifier hook or `patchActivate` enforcement threw. |
| `shared.timeSig[N] invalid` | Direct assignment bypassed `setTimeSig`. Use `setTimeSig(4, 4)` with integers ≥ 1. |
| `scheme "<name>" references itself in its offScheme / coScheme chain` | A cycle in the scheme graph. Break it. |
| `colorScheme: knob "<name>" on <binding> is type "<type>"` | A `colorScheme.knob` points at a non-knob/fader. Only those track `_normalized`. |
| `sampling a scheme containing a mixxx colour stop` | A `mixxx` stop sits in a sampled ramp. `mixxx` is static-only. |
| `colorScheme.schemeFromState on X must be an object` | `schemeFromState` is a string, number, or array. Dropped. |
| `colorScheme.on on X has equals but no state/co/patchActive` | Comparator with no source. LED stays off. |
| `colorScheme.on.state "X" resolves to a value ... that is truthy by construction` | Numeric `on.state` without `equals` — always-on LED. |
| `colorScheme.on has no recognised fields` | `on:` object has no known keys. |
| `perception curve channel "X" not monotonic` | Curve data has a decreasing entry. Flattened. |
| `perception: LED_TRANSFERS["X"] not found` | Named block missing. Whole PERCEPTION treated as absent. |
| `perception: samples array has fewer than 2 entries` | One sample = no curve information. |
| `perception: duplicate wire value N` | Two samples with the same `hw` for a channel. First wins. |

Full behaviour-driven symptoms: `CUSTOMISE.md` §3.

---

## §17 — Extending

### Adding a scheme field

1. Add to `SCHEME_DEFAULTS` in `lib/schemes.js`.
2. Consume in `compileScheme` (usually `_compileFullScheme`).
3. If it affects render, read in `_refreshColorScheme` or
   `sampleT`.
4. If bake should preserve it, add to `bakeScheme`'s output
   (`config/k3-lab.js`).

### Adding a binding field

1. Add a row to `_BINDING_FIELDS` in `lib/core.js`:
   - `hash: true` if it affects runtime behaviour or LED output
   - `token: '<label>'` if it can carry a `$TOKEN$`
   - `snapshot: { dest, transform? }` if `_unbind` /
     `_rearmSoftTakeover` needs it after rebind
   - `ignored: true` if reset-able but neither snapshotted nor
     hashed
2. If `_bindCore` should read it, add a branch.
3. If reset-able, add to `_bindingDefaults`.
4. Turn on `_debugPrintsOn` and reload. Boot-time audits fire if
   a reset-able field isn't classified.

### Adding a modifier state

1. Declare in `cfg.modifierStates` with `heldBy`, plus
   `recompute` / `patchActivate` / `onActivate` / `onDeactivate`
   as needed.
2. `heldBy` bindings must be `type: 'push'` somewhere reachable —
   otherwise their transactions never activate and the modifier
   stays false.
3. If `patchActivate`, ensure the patch exists in `patches:` —
   `_validateBindings` warns at boot otherwise.
4. Read the state from config as `ctrl.modifiers.<name>` or from
   a binding's `on: { state: 'modifiers.<name>' }`.

### Adding a func

```js
myCatnip.FUNCS.myFunc = function(args, ch, c, v, s) {
    // this    = the Binding
    // args    = cfg.args array
    // v       = MIDI value (0..127)
    // s       = MIDI status
};
```

Loop-touching funcs: `this._ctrl._touchLoop(this.group)` after
the write. Beatjump funcs: `this._ctrl._beatjumpAllowed(this.group)`
first, bail if false.

### Adding a top-half mode

1. Base patch + `_shift` in `config/k3-cat-top.js`.
2. Layout patches inheriting from the base, emitters in
   `config/k3-cat-fx.js`.
3. Add all to `CAT_LAYERS` in `config/k3-cat.js`.
4. Entry in `myCatnip.TOP_MODES` in `lib/controller.js`.
5. Extend `_resolveFxPatchName`'s regex.
6. Swap func (or extend `toggleTopMode` / `toggleMiniFx`).
7. Bind on a chord cell.
8. Add any new files to every `.midi.xml` and to `test/harness.js`.

`CUSTOMISE.md` §1.9 has the schema detail.

### Adding a hardware

1. New file `hw/<name>.js`, loaded after `lib/binding.js` and
   after `lib/perception.js`, before `lib/controller.js`.
2. Descriptor shape: `name`, `DEFAULTS`, `pacing`,
   `LED_TRANSFERS`, `PERCEPTION`, `PALETTE`, `MIXXX_COLORS`, plus
   the six HAL methods (see `HARDWARE.md` §2).
3. Add to every `.midi.xml` in the correct position.
4. Preset config passes `hw: myCatnip.HW_<NAME>` in its overrides
   object, or `bootCat({ hw: ... })`.
5. Config layers stay unchanged. Bindings the new hardware
   doesn't provide go dark gracefully (`_applyBinding` skip +
   `_validateBindings` warn).

Config files never see a note number or a sysex byte. If you find
yourself reaching for those in a preset layer, the concern belongs
in the hardware descriptor.

### Adding a controller concern

Sixth controller file. Pattern:

```js
'use strict';
myCatnip._requireLoad('lib/controller-<name>.js',
    ['Controller', ...prereqs]);

(function() {
    myCatnip.Controller.prototype.myMethod = function() { ... };
})();
```

Add filename to every `.midi.xml` (5 files) and `test/harness.js`.

---

## §18 — Tests

`node test/run.js`. Files share one vm sandbox. `run.js` resets
mutable globals before every test — tunables, debug flags,
`shared.warned`, `_modeSeen`, `_funcIdCounter`/`_funcIdMap`,
`_schemeCache`/`_compiledCache`/`_compiledCacheByHw`,
`shared.timeSig`, `shared.lastLoopTouchMs`, `shared.controllers`,
`TIMING`, mocks, controllers array, print log,
`_phraseHotcueSlotsCache*`.

**`TIMING` reset** — `resetGlobals()` restores from
`_TIMING_DEFAULTS` and re-runs `_refreshAliases()`, so any test
that overrides a tunable must reset it. `applyPacing` would
clobber the reset otherwise; `_pacingTestOverride` (set by
`resetGlobals`) merges at the highest priority in `applyPacing`
so test-specific overrides survive.

**What not to reset:**

- `myCatnip.HW_K3` — static descriptor.
- `myCatnip._TIMING_DEFAULTS` — immutable source of truth.
- `myCatnip.Pacing`, `myCatnip.applyPacing` — stateless
  constructors.

Mock controllers should set `hw: myCatnip.HW_K3` (or a fake with
the six HAL methods stubbed) before use.

`SCHEMES` is cleared by `lib/schemes.js` on every reload — config
files re-register their own. Compiled-scheme references on live
bindings are object references, not names — they survive the
clear.

Adding a new mutable global on `myCatnip` means adding a reset
line to `resetGlobals()` in `run.js`. `_phraseHotcueSlotsCache`
and `_phraseHotcueSlotsCacheSrc` in particular need resetting —
they're memoized module-scoped state and would leak between
tests.

Coverage: see test file list. Not tested: real Mixxx, real LED
bytes, config contents as data, lab round-trip state machine.

**Lint.** `eslint.config.js`, flat config, no plugins.
`no-implicit-globals` on for runtime files; the single
`var myCatnip` in `lib/core.js` carries an inline disable.

---

## §19 — Performance

### 19.1 The design

The CO mutex is the thing every performance decision protects.
Mixxx runs the audio thread against it; every CO read from the
UI thread contends with audio. So the design philosophy is:

1. **Cache at the listener, not on read.** A CO that rarely
   changes gets read once when it changes, then cached. Reads
   elsewhere hit the cache.
2. **Invalidate at the change, not on a timer.** No TTLs. A
   cache clears when a specific CO fires, or when a specific
   input event arrives. A TTL either serves stale data or wastes
   reads.
3. **Don't cache "not loaded yet".** `_trackMeta` skips caching
   when `duration == 0` because at boot the CO tree may not
   have settled — caching the zero would pin it for the track's
   lifetime.
4. **Dedupe → coalesce → throttle, in that order.** `_ledCache`
   drops unchanged frames; `_enqueueSysEx` folds queued updates
   for the same LED; the drain throttles the wire. At most one
   wire write per LED per drain interval, no matter how many
   times render fires.
5. **Hash the fields that matter; skip the ones that don't.**
   `_BINDING_CFG_FIELDS` derives from one `_BINDING_FIELDS`
   table. Structural fields are deliberately excluded.
6. **Object identity is the cheapest hash.** `oldCfgs[name] ===
   cfg` skips the whole hash path when a patch memo returns the
   same object across recomputes.
7. **Probe at refresh, not at bind.** A scheme function's
   compiled shape can change at runtime (`countdownScheme` idle
   → beat). Freezing at bind time is faster but wrong for that
   case.
8. **Bound every cache.** An unbounded cache is a leak with
   extra steps.

The biggest single win is `_decks[ch].hotcueState`. Before it,
every `playposition` tick re-scanned 16 hotcues (up to 33 CO
reads per deck per tick), and every hotcue change re-triggered
the scan. Now the per-slot observers update one field per fire,
and `_deriveOriginFromPosition` iterates the cache with zero CO
reads per tick.

The second-biggest win is `_refreshBeatLeds` scheme-probing each
binding before refreshing. Before it, every beat edge repainted
every binding in `_beatLeds` — including FX cells, group-enable
cells, press row, slip cells, none of which carry a `beat:`
block. Now they're skipped in one function call plus a cache
hit.

### 19.2 On a slow machine

If the controller feels slow or sysex output lags, the beat
pipeline is the first place to look. It carries nearly all
per-tick work — hotcue observers, origin derivation, per-beat
LED refresh, loop clock accumulation.

Three edits, ordered by impact:

**1. Disable phrase markers.** In `config/k3-cat-schemes.js`:

```js
myCatnip.PHRASE_MARKER_COLORS = [];
```

Kills the per-slot hotcue observers (2 CO reads + 1 connection
per slot per channel, at clock-open) and the per-tick origin
derive. Phrase colours stop tracking marker hotcues — origin
stays at file start.

**2. Remove countdown from layer and shift.** In
`config/k3-cat-bottom.js` (`layerButton` helper) and
`config/k3-cat-top.js` (the `shift:` binding in `TOP_SHARED` and
`TWO_DECK`), replace:

```js
colorScheme: { scheme: CAT.countdownScheme() }
```

with a static scheme, e.g. `{ scheme: 'green' }`. Kills the
track-end countdown (LED goes solid) and removes the only beat
blocks in the shipped config.

**3. Replace the play button's scheme.** In
`config/k3-cat-schemes.js`, replace `PLAY_LED_SCHEME` with a
static scheme. Without this, `schemeFromState` closures on play
cells keep `_beatLeds` non-empty, which keeps beat clocks open.

With edits 1 and 2 only, per-beat renders are skipped by the
scheme probe — the pipeline still runs, but does almost nothing.
With all three, `_beatLeds` empties, clocks close, and the whole
pipeline stops. Cost: the play button loses its track/loop
colour distinction.

**`BEAT_PLAYING_MODE` / `BEAT_PAUSED_MODE` do not help.** They
change what a beat LED shows, not whether the beat pipeline
runs.

**Tuning other symptoms:**

- **Beatjumps exit the loop unexpectedly** — raise
  `TIMING.beatjumpGapMs` to 150–200. Do not go below 120: Mixxx
  settles the loop over a short window after a loop edit, and a
  beatjump firing inside that window exits the loop silently.
  130 was derived empirically — 120 worked, 60 leaked.
- **Momentary COs (beatjump, reloop, beatloop-activate) don't
  fire on a laggy system** — raise `TIMING.pulseCoMs` (default
  30). The CO pulse may be shorter than Mixxx takes to notice it.

### 19.3 Where you can't save

Some of the per-tick CO reads are unavoidable. Reading them less
often would break correctness, and caching them at the listener
would just move the read.

- **`playposition` is read once per fire**, above the throttle
  gate, because the direction check needs every value. Once past
  the throttle the body is CO-free.
- **`_seedHotcueCache` bursts 32 CO reads per channel** at
  clock-open, `track_loaded`, and every `track_samples` change.
  That's the caching working — the alternative is re-scanning
  16 hotcues per throttled tick, which is what burned before.
- **`_refreshBeatLeds` scheme-probes each beat LED** once per
  beat edge to check for a `beat:` block. Memoized on ref
  identity, so it's a function call plus a cache hit. Freezing
  the decision at bind time would break `countdownScheme`'s
  idle → beat transition.
- **Empty-deck `_trackMeta` cold miss.** A beat LED pointed at
  an unloaded channel re-misses every beat edge that touches it
  (four CO reads per miss). In shipped presets this rarely
  bites — the layer/shift countdown bindings target decks the
  presets load. A fix needs a "settled empty" flag invalidation
  scheme; skipped because the state machine gets harder and the
  case doesn't ship.
- **`_applyResolved` token-fingerprint per binding.** Bounded
  by recompute frequency (patch changes), not steady state.
- **Lab grid re-solve per input event.** `_renderSegmentGrid`
  iterates up to 23 segment cells and calls `_solveHw` on each.
  A spinning knob at 60 Hz runs ~23 × 12 bisects per frame in
  edit mode. Bounded and lab-only — no playback preset hits it.
  Throttling `_labRenderPreview` from `_onInput` to ~30 Hz would
  fix it if a slow machine ever needs it.
- **`composeScheme` calls `capturedRef` per render.** The memo
  returns the same composed object on identity match, but
  `capturedRef.call(this)` still fires to get the inner ref.
  One function call per FX cell per render. Removing it defeats
  the point of the memo.

### 19.4 Measuring

Every performance claim should trace to a code path. If you're
diagnosing a regression:

- `inspect('why', name)` shows the last LED write per binding.
- `_debugPrintsOn = true` + `_syncBeatClocks` prints
  `want/have/beatLeds/applied` — a mismatch at boot means the
  open/close decision is wrong.
- The beatjump gate line shows `elapsed / limit` when gated.
- `inspect('perception')` shows derived curves, fingerprint, and
  current mix-active state.

### 19.5 Cross-project principles

For anyone building a similar binding layer:

- **Cache at the listener, not on read.** Every CO read competes
  with the audio thread.
- **Invalidate at the change, not on a timer.** TTLs either serve
  stale data or waste reads.
- **Don't cache "not loaded yet".** See §19.1 rule 3.
- **Hash the fields that matter.**
- **Object identity is the cheapest hash.**
- **Dedupe → coalesce → throttle.**
- **Probe at refresh, not at bind.**
- **Bound every cache.**
- **Trace every perf claim to a code path.** An aggregate "fewer
  reads per second" is easy to make up and impossible to defend.

---

## §20 — Design notes

Behaviour that surprises on first read, grouped by theme with the
reasoning.

### 20.1 Timelines

- **The pulse and the count come from different sources.** Pulse
  phase always from track position's fractional beat, in both
  display sources. Count from the display source's timeline. If
  you change this, the loop clock's `pos` won't advance 1:1 with
  the wall clock — the count will drift relative to the pulse.
- **The loop clock is a session clock, not a position readout.**
  Forward-only, rate-scaled. Doesn't reverse when the deck
  reverses and doesn't need wrap detection. If you ever want it
  to reflect the playhead, you need a different accumulator.
- **`_beatF` has no `pos < 0` guard.** Negative playposition
  returns a negative fractional beat; `_cascadeCount` floors it
  and `beatLevel` normalises via modulo. A pre-start scrub cycles
  backward through the phrase instead of freezing the LED.
- **`_closeBeatClocks` preserves `_phraseOrigin`.** The playhead
  hasn't moved just because clocks closed.
- **`_catchUpChannel` re-seeds the hotcue cache and re-derives
  origin when the cache is empty.** That state arises when beat
  clocks were closed (no beat LEDs active) across a track load.
- **`hasBeat` means "position is meaningful", not "playing".**
  `st.playing` mirrors `play_indicator` and picks
  `BEAT_PLAYING_MODE` / `BEAT_PAUSED_MODE`.

### 20.2 Beatjump gate

- **One gate, one value.** `TIMING.beatjumpGapMs`.
- **The timestamp lives in `shared.lastLoopTouchMs[ch]`,** not on
  the controller. Two controllers on the same channel share the
  gate — deliberate. Mixxx misbehaves on rapid `beatjump_*` fires
  in an active loop, and a per-controller timestamp would leave
  the second controller unthrottled.
- **Stamped by** beatjump (on pass, in loop), `encLoopMove`,
  `pressSetValue` on `beatloop_size`,
  `beatloopActivateResetAnchor`, `reloopToggleResetAnchor`. NOT
  by `beatjump_size`, hotcues, play, EQ, faders.
- **Outside a loop, every beatjump fires and nothing is
  stamped.**
- **The gate lives in the beatjump funcs,** not in the render
  path. Calling `_beatjumpAllowed` yourself is required if you
  add a new beatjump func.
- **No per-binding override.** One global throttle, one global
  gap.

### 20.3 Caches

Every cache has a defined invalidation source. If you add one,
define the source before writing the cache.

**Hot path caches** (updated by listeners on each CO change):

- `_rateCache[ch]` — from `rate_ratio`. Removes a CO read from
  `_advanceVirtualClock`.
- `_reverseCache[ch]` — from `reverse`. Removes a per-tick CO
  read from the beat-edge guard.
- `_decks[ch].playing` — from `play_indicator`.
- `_decks[ch].hotcueState` — updated per-slot. Read by
  `_deriveOriginFromPosition` with zero COs per tick. This is the
  biggest win (§19.1).
- `_trackMetaCache[ch]` — from `duration`, `file_bpm`,
  `track_samples`, `outro_end_position`. Gated by
  `_loadedState[ch]` and `_loadSettlingAt[ch]` (§10).

**Per-binding caches:**

- `Binding._lastOutKeyValue` — from the outKey CO. Removes a CO
  read per `_isOn` call (every LED render).
- `Binding._lastCoValue` — from the knob's own CO. Removes a
  `getParameter` read per co-match render.
- `_csOn.cachedValue` — from `on.co`.
- `sd.cachedValue` — from `schemeFromState.co`.

**Compile caches:**

- `_schemeCache` — named scheme object → resolved form. Cleared
  on reload.
- `_compiledCacheByHw` — per-HW compiled schemes. WeakMap keyed
  on the hardware object.
- `_resolvedPatchCache` — patch name → resolved cfg map. Fixed
  at construction.
- `_resolvedTargetHashCache` — WeakMap keyed on cfg, invalidated
  by token fingerprint.
- `_csSchemeMemo` / `_csCompiledMemo` — per-binding scheme
  reference identity.

**Perception caches** (see `PERCEPTION.md` §9.1):

- `deriveCache` — per-HW derived curves + LUTs.
- `flatCache` — per-HW flat-target lookups.
- `hwCache` — per-HW bisect results.

**Framework state:**

- `_ledCache` — packed int per LED idx. Cleared on blank and on
  Pacer drop.
- `_pacers` — named `Pacing` instances, lazily created.
- `_funcIdCounter` / `_funcIdMap` — reset every boot (otherwise
  `inspect()` prints ids whose value depends on reload count).
- `shared.warned` — warn-once dedupe map.
- `shared.timeSig[ch]` — per-channel, `null` = use scheme
  defaults.
- `shared.lastLoopTouchMs[ch]` — per-channel, shared across
  controllers on the same channel.

### 20.4 Binding lifecycle

- **Held push buttons use the transaction model (§8).** A rebind
  during a hold orphans the transaction; the captured release
  fires at physical release against the press-time config. The
  CO stays at its press-time value until then — deliberate.
- **Orphaned is sticky.** Once set, a later matching rebind
  doesn't clear it. The release that eventually fires must
  dispatch what was pressed, not whatever the binding happens
  to be now.
- **`_onInput(b)` runs before the func.** If a subclass needs to
  see input before the CO write, override it.
- **`valueCurve` doesn't touch `_normalized`.** Physical
  position stays raw; the curve applies only at write time.
- **`_isOn` returns `v ? 1 : 0`** for state without comparators.
  No implicit conversion from numeric values — a state that
  resolves to a number without `equals` is always truthy (and
  warns once).
- **`_bindConns` skips the outKey connection when `_csOn` is
  set** — including `on: false`. An LED that's always off
  doesn't need a listener.
- **`_applyBinding` refreshes only when the caller asks.**
  `_applyResolved` gates on `_recomputeDepth > 0` so direct
  callers still get a per-binding refresh; batch callers pass
  `skipRefresh: true` and rely on the outer `_refreshAllLeds`.
- **`_transaction.orphaned` is readable from a func.** Use it to
  suppress a user-facing side effect when the press was orphaned
  by a rebind.
- **First bind also rearms soft takeover.** A binding that
  becomes a knob / fader for the first time has
  `_normalized = undefined`, so soft takeover stays inactive
  until the physical control sends its first event.
- **Numeric `on.state` without `equals` warns once per binding,
  from `_isOn` only** — not at bind. A binding whose LED never
  renders never warns.

### 20.5 Focus and token short-circuits

- **`_reapplyByTokens` short-circuits on resolved-target hash
  (§7).** A focus flip between slots that resolve to the same
  channel skips the rebind.
- **All three focus setters refresh exactly once on every path.**
  `_afterFocusChanged` is the single place to hook.
- **Hash cache relies on cfg object identity being stable.**
  `_resolvePatch` memoization is what guarantees this — if a
  patch resolution ever returns a fresh object each call, the
  hash recomputes every time.
- **`_hashBinding` uses `\u0001` as separator and JSON-quotes
  strings.** A `|` inside a CO name can't shift the field
  boundary.
- **`_tokenFields(cfg)` is the single field enumerator.**
  Adding a token-bearing field is one row.

### 20.6 Pacing and hardware invariants

- **`TIMING` is the single source of truth for timing
  constants.** Compat aliases on `myCatnip.*` mirror it for
  existing read sites; `applyPacing` refreshes them after merge.
- **`applyPacing` resets from `_TIMING_DEFAULTS` before
  merging.** Without the reset, loading preset A (custom pacing)
  then preset B (defaults) leaves A's values poisoning B.
- **`applyPacing` is idempotent.** Called from both `bootCat`
  and `_bootWith`; the second call is a no-op if overrides match.
- **Epsilon invariant** — `takeoverEpsilon > coMatchEpsilon`.
  Broken override → warn-once + restore both defaults. The
  relation guarantees LED "matched" implies the control is live.
- **`ctrl.pacer(name)` is lazy.** First call creates the
  instance with the pacer's throttle. K2 mode never calls it —
  no pacer is allocated.
- **`Pacing.onDrop` clears `_ledCache[idx]`.** Registered by
  `ctrl.pacer` when the instance is created. Without it, a
  dropped frame's cache slot stays populated and a future
  render with the same payload hits the dedupe and silently
  drops the LED.
- **Framework never sees note numbers or sysex bytes.**
  Protocol primitives live in `HW_K3`; `sendLED` only passes
  `(idx, r, g, b, hw)` to `hw.send`.
- **Blank sweeps are hardware-side.** The framework calls
  `hw.blank(ctrl)` and moves on. K3 sends the short-message
  sweep unconditionally (previous session may have left K2 notes
  lit — sysex can't reach those) and the sysex sweep only in
  sysex mode.

### 20.7 Render path invariants

- **The beat gate sits above ramp selection.** A beat-off-phase
  LED renders the off-ramp regardless of what the scheme would
  have sampled.
- **Marker bypasses the flat solve but does beat-apply.**
  Marker bands are cascaded (a marker at a beat lights the beat
  colour, not the marker colour).
- **Co-match does not beat.** Cascade flashes defeat the
  purpose of the steering gradient.
- **`st.hasBeat` is that channel's "deck is producing beats"
  test** — not `count > 0`. A freshly-loaded deck has
  `count = 1` but `hasBeat = false` until a `playposition` tick
  or `beat_active` edge fires.
- **`Binding._beatStateFor` is the shared preamble** for any
  beat-aware render — returns the deck state when the deck has
  seen a beat, else null.
- **`_sendColor` short-circuits `mixxx`-typed LEDs when
  `isOn === 0`.** An off `mixxx` LED paints dark, doesn't read
  the pad's hotcue colour.
- **`_evaluateScheme` warns on fresh-object identity.**
  A scheme function returning a fresh object with identical
  content recompiles every render — the fix is `composeScheme`
  or hoisting the object out of the closure.
- **`schemeFromState.list` uses the CO value directly (0-based).**
  `loaded_chain_preset` is 0-based. Out-of-range clamps to the
  last entry.
- **`THEME` is read live by every shipped emitter.** Mutating at
  runtime propagates on the next repaint — no reload needed.

### 20.8 Lab

- **`_version` bumps on every input event**, keying the preview
  compile cache. Between inputs, beat-driven renders hit the
  cache.
- **`_renderPreviewLED` wraps the body in try/catch** so a
  user-scheme throw's stack points at the actual failing call,
  not the wrapper.
- **`_needsBeatClocks` is overridden in LabController** to keep
  beat connections open whenever `_onBeat` is set, even when no
  beat LED is attached.
- **`LabController.shutdown` runs the slot dump synchronously**
  before the parent's async sysex drain.
- **Slot 0's dump emits the whole chain.** Slot 0 = on, 1 = off,
  2 = co, 3 = co-off. Dumping slot 0 emits one object with
  nested `offScheme` / `coScheme` fields.

---

## §21 — Limits

- `chain_selector` only steps ±1. Not a readable index.
- Boot-white is session-scoped.
- Beat displays work on paused decks; `BEAT_PLAYING_MODE` /
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
  `mixxx` entry, or a perception solve — there is no rgb to
  sample. The stop is skipped with a `sampleSegsMixxx`
  warn-once; a snap sample returns the previous valid stop's
  colour, a blend sample interpolates between the nearest valid
  stops, and the whole ramp renders black if no valid stops
  exist.
- **Hardware descriptor contract.** Six HAL methods:
  `buildBindings(ctrl)`, `wireInputs(ctrl)`,
  `send(ctrl, idx, rgb, hw)`, `blank(ctrl)`,
  `anyPendingWrites(ctrl)`, `decodeLedCache(val)`. Data blocks:
  `DEFAULTS` (boot defaults: `midiChannel`, `sysex`), `pacing`
  (TIMING overrides), `LED_TRANSFERS` (raw transfer curves),
  `PERCEPTION` (model), `PALETTE` / `MIXXX_COLORS` (colour
  tables), `DEFAULT_RGB_BRIGHTNESS` / `_OFF`. See
  `HARDWARE.md` for the full descriptor shape.
- **Bindings the hardware doesn't provide go dark silently.**
  `_applyBinding` skips unknown names; `_validateBindings`
  warns at boot if a modifier's `heldBy` references a missing
  binding. Config files are portable across hardware by
  construction.
- **Pacing is global (`TIMING`).** Multiple devices with
  different `hw.pacing` values would need per-device
  restructuring if that ever becomes real. Today `_bootWith`
  applies the first device's `hw.pacing` for all.
- **`hw.DEFAULTS` merges shallowly.** `midiChannel` and `sysex`
  are scalars; a preset override replaces the whole field.
  Array fields like `PERCEPTION.wbGain` must be supplied in full
  if overridden (validation warns + falls back otherwise).