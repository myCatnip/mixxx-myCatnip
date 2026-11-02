# Performance

What the runtime does to keep LED work off the CO mutex the audio
thread competes for, what to touch, and where you can't save
more.

---

## On a slow machine: turn off the beat pipeline

The beat pipeline carries nearly all per-tick work — hotcue
observers, origin derivation, per-beat LED refresh, loop clock
accumulation. If the controller feels slow or sysex output lags,
turning it off buys back the most.

Three edits, ordered by impact.

### 1. Disable phrase markers

In `xone-k3-cat-schemes.js`:

```js
XoneK3.PHRASE_MARKER_COLORS = [];
```

Kills the per-slot hotcue observers (2 CO reads + 1 connection
per hotcue slot per channel, at clock-open) and the per-tick
origin derive. Phrase colours stop tracking marker hotcues —
origin stays at file start.

### 2. Remove countdown from layer and shift

In `xone-k3-cat-bottom.js` (`layerButton` helper) and
`xone-k3-cat-top.js` (the `shift:` binding in `TOP_SHARED` and
`TWO_DECK`), replace

```js
colorScheme: { scheme: CAT.countdownScheme() }
```

with a static scheme, e.g. `{ scheme: 'green' }`. Kills the
track-end countdown (LED goes solid) and removes the only beat
blocks in the shipped config.

### 3. Optional — replace the play button's scheme

In `xone-k3-cat-schemes.js`, replace `PLAY_LED_SCHEME` with a
static scheme. Without this, `schemeFromState` closures on play
cells keep `_beatLeds` non-empty, which keeps beat clocks open.
With the first two edits only, per-beat renders are skipped by
the scheme probe — the pipeline still runs, but does almost
nothing. With all three, `_beatLeds` empties, clocks close, and
the whole pipeline stops.

Cost: the play button loses its track/loop colour distinction.

### `BEAT_PLAYING_MODE` / `BEAT_PAUSED_MODE` do not help

They change what a beat LED shows, not whether the beat pipeline
runs. Setting either to `'off'` changes appearance only.

---

## Where tunables live

| Tunable | File |
|---|---|
| `BEATJUMP_GAP_MS`, `PULSE_CO_MS` | `xone-k3-lib-core.js` |
| `HOTCUE_MAX` | top of `xone-k3-lib-controller-beat.js` |
| `PHRASE_MARKER_COLORS` | `xone-k3-cat-schemes.js` |
| Per-preset overrides | `bootCat({ ... })` in the preset's `init()` |

Runtime tunables apply at boot. Changing one at runtime needs a
preset reload.

---

## If a specific symptom shows up

**Beatjumps exit the loop unexpectedly.** Raise `BEATJUMP_GAP_MS`
to 150–200. Do not go below 120: Mixxx settles the loop over a
short window after a loop edit, and a beatjump firing inside
that window exits the loop silently. 130 was derived
empirically — 120 worked, 60 leaked.

**Phrase markers above hotcue 16 don't anchor.** Raise
`HOTCUE_MAX` (default 16; Mixxx supports 36), before boot. Cost:
`2 × HOTCUE_MAX` CO reads and `2 × HOTCUE_MAX` observer
connections per channel at clock-open, and a larger per-tick
cache iteration in the origin derive. Only worth it if you
actually place markers past hotcue 16 — otherwise the default
keeps boot time and per-tick iteration minimal.

**Momentary COs (beatjump, reloop, beatloop-activate) don't
fire.** Raise `PULSE_CO_MS` (default 30). On a laggy system the
CO pulse may be shorter than Mixxx takes to notice it.

---

## How the runtime saves work

### Cache CO reads at the listener

Every CO that changes rarely relative to how often it's read is
cached and updated by a listener. Reads elsewhere hit the cache.

| Cache | Source | Refreshed by |
|---|---|---|
| `_rateCache[ch]` | `rate_ratio` | listener |
| `_reverseCache[ch]` | `reverse` | listener |
| `_decks[ch].playing` | `play_indicator` | listener |
| `_trackMetaCache[ch]` | `duration`, `file_bpm`, `track_samples`, `outro_end_position` | `track_loaded`, `track_samples` change, `outro_end_position` change |
| `_decks[ch].hotcueState` | `hotcue_N_{color,pos}` × 16 | per-slot listeners; re-seeded on `track_samples` |

`_trackMetaCache` skips caching when `duration == 0` — at boot
or right after a load, the CO tree may not have settled, and
caching the zero would pin zeros for the track's lifetime.

`_decks[ch].hotcueState` is the biggest win here. Before it,
every `playposition` tick re-scanned 16 hotcues (up to 33 CO
reads per deck per tick), and every hotcue change re-triggered
the scan. Now the per-slot observers update one field per fire,
and `_deriveOriginFromPosition` iterates the cache with zero CO
reads per tick.

### Diff before rebind

`_applyResolved` runs on every config change (focus move, patch
swap, shift press). It diffs each binding's hash and rebinds
only what moved.

- `oldCfgs[name] === cfg` — object identity, skips the hash
  entirely. Works because `_resolvePatch` memoizes its output
  per patch name: a repeated recompute over the same stack
  returns the same `resolved[name]` object.
- `_hashBinding(cfg)` — per-field hash over
  `_BINDING_CFG_FIELDS`, itself derived from one
  `_BINDING_FIELDS` table. Functions hash by WeakMap identity
  (`_funcId`); objects hash by key-sorted `_stableStringify`;
  strings JSON-quoted so a `|` inside a CO name can't shift the
  field boundary.
- `_reapplyByTokens` — rebinds only bindings using the changed
  token **and** whose resolved-target hash changed.
  `_resolvedTargetHash` memoizes in a WeakMap keyed on cfg and
  on a token fingerprint (positional snapshot of every `TOKENS`
  state field).

`_batchPatches` gives its mutator a copy of `activePatches` and
computes one diff on return: N patch edits = one recompute.

### Coalesce before the wire

Every LED write hits `_sendSysExLED`, which packs `(r,g,b,hw)`
into a single 28-bit int and checks `_ledCache[idx]` against it
first — no per-render string allocation. Changed frames go
through `_enqueueSysEx`, which replaces an in-flight frame for
the same LED index in O(1) via `_sysexQueueMap`. Queue caps at
128 — overflow drops the oldest entry and invalidates its cache
slot so a future render with the same frame re-enqueues. The
drain fires one frame per `SYSEX_THROTTLE_MS`.

Net: at most one wire write per LED per drain interval, no
matter how many times the render path fires.

`BEAT_REPAINT_THROTTLE_MS` bounds how often the `playposition`
handler runs its heavy body per channel. Both it and
`SYSEX_THROTTLE_MS` live in `xone-k3-lib-core.js`. They're
developer tunables — the defaults keep pulse phase smooth while
bounding per-tick CO reads.

### Memoize derived values

| Memo | Keyed on |
|---|---|
| `_schemeCache` / `_compiledCache` | scheme name |
| `_resolvedPatchCache` | patch name |
| `_flatCache` entry | segments array `_cacheId` + `_calibFingerprint()` |
| `_hwCache` | `r:g:b:targetLum`, capped at 1024 |
| `_csSchemeMemo` / `_csCompiledMemo` | per binding, scheme ref identity |
| `composeScheme` inner memo | inner ref identity |
| `fxScheme` | `THEME.fx[n]` value |

`_calibFingerprint()` is a method, computed at cache read. It
includes every `_emitAt` input — curve name, calibrationMode,
wbActive, wbGain, channelPerceptual, hkBoost, lumGamma — so any
runtime tuning mutation invalidates the flat target cache. A
stored string would serve stale flat targets after a tuning
change; the lab's tuning overlay does exactly this.

`composeScheme` inner memo is what makes FX cells stop
recompiling per render: `fxScheme(n)` returns a stable object
when `THEME.fx[n]` is unchanged, so the closure returns the
same composed object — no recompile, no fresh-scheme warning.

### Skip what can't affect output

- `_refreshBeatLeds` probes each binding's current compiled
  scheme; if no `beat:` block, the binding is skipped. FX
  cells, group-enable cells, press row, slip cells — none
  carry a beat block, and all were being repainted on every
  beat edge before.
- `_refreshBeatLeds` also filters by `beat.deck` resolved
  channel — a beat LED bound to channel 3 doesn't fire on
  channel 1's edge.
- `_refreshAllLeds` has a re-entrancy guard; nested calls from
  `_syncBeatClocks` are skipped because the outer call
  re-sweeps every binding after clocks finish.
- `_reapplyByTokens` short-circuits on resolved-target hash
  equality — a focus flip between slots resolving to the same
  channel skips the rebind.

### Notable CO eliminations

`_beatF` skips `_getContentBounds` because its only use was
`bounds.start`, which is always `0`. `_getContentBounds` now
reads from `_trackMeta`'s cache rather than a live
`outro_end_position`, so this only saves a function call — but
the separation still matters: `_beatF` is on the per-tick path
and `_getContentBounds` isn't.

`_onPlayposition` uses `st.playing` and `_reverseCache[ch]`
instead of reading those COs, saving two CO reads per fire.

`_syncBeatCount(ch, pos)` accepts `pos` from the caller,
saving a redundant `playposition` re-read.

`countdownScheme` is CO-free in steady state: `_trackMeta` hits
the cache, and `st.lastPlayPos` is written on every
`playposition` fire before the throttle gate. The cold path
(post-load, post-outro-drag) re-reads once, then caches.
Drag-time `outro_end_position` invalidation does not refresh —
the next beat edge renders with the new bounds.

Every entry above hits the `playposition` path, which fires
repeatedly during playback. That's the CO-mutex headroom that
matters — the audio thread is the one contending.

---

## Where you can't save

### `playposition` read per fire

`_onPlayposition` reads `playposition` above the throttle gate
because the direction check (`movingBackward`) needs every
value, not just throttled ones. Caching at the listener level
would just move the read. The throttled body is now CO-free.

### `_seedHotcueCache` bursts

32 CO reads per channel at clock-open, `track_loaded`, and
every `track_samples` change. That's the caching, not a cost
of it — the alternative is re-scanning 16 hotcues per
throttled tick, which is what burned before.

### `_refreshBeatLeds` scheme probe per beat

`_evaluateScheme()` fires once per beat per beat-LED binding,
to check for a `beat:` block. Memoized on ref identity, so
it's a function call plus a cache hit. Freezing the decision
at bind time would skip the probe but break
`countdownScheme`'s transition from `countdownIdle` (no beat,
no track) to `countdownA1..4` (beat, track loaded). That
transition is why the probe runs at refresh, not bind.

### Empty-deck `_trackMeta` cold miss

`_trackMeta(ch)` fires four CO reads on a cold miss
(`duration`, `track_samples`, `file_bpm`, `outro_end_position`)
and only caches when `duration > 0`. A beat LED pointed at a
channel with no track re-misses every beat edge that touches
that channel. In shipped presets this rarely bites — the
layer/shift countdown bindings target decks the presets load.
A fix needs a separate "settled empty" flag invalidated on
`track_loaded`; skipped because the state machine gets harder
and the case doesn't ship.

### `_applyResolved` token-fingerprint per binding

`_resolvedTargetHash(cfg)` computes the token fingerprint per
binding when called without a shared one. `_reapplyByTokens`
passes a shared fingerprint; `_applyResolved` doesn't. Bounded
by recompute frequency (patch changes), not steady state.

### Lab grid re-solve per input event

`_renderSegmentGrid` iterates up to 23 segment cells and calls
`_solveHw` on each. `_onInput` bumps `_lab._version` unconditionally,
which invalidates both the preview compile cache and the flat-target
cache (fresh `segs` object → new `_cacheId`). A spinning knob at
60 Hz therefore runs ~23 × 12 bisects per frame in edit mode.

This is bounded and lab-only — no playback preset hits it. If lab
editing ever feels sluggish on slow hardware, throttling
`_labRenderPreview` from `_onInput` to ~30 Hz is the fix, but no
evidence it's needed on modern machines.

### `composeScheme` calls `capturedRef` per render

The memo returns the same composed object on identity match,
but `capturedRef.call(this)` still fires to get `inner` and
compare. One function call per FX cell per render. Removing
it would defeat the point of the memo.

---

## Cross-project notes

For anyone building a similar Mixxx binding layer — with or
without an AI assistant — these are the principles this runtime
paid for in cost or in mistakes.

- **Cache at the listener, not on read.** Every CO read
  competes with the audio thread. `rate_ratio` cached once vs
  read per tick is free performance with zero behavioural
  change.
- **Invalidate at the change, not on a timer.**
  `_trackMetaCache` clears on `track_loaded`, `track_samples`,
  and `outro_end_position`. A TTL either serves stale data or
  wastes reads.
- **Don't cache "not loaded yet".** `_trackMeta` skips caching
  when `duration == 0` because at boot the CO tree may not
  have settled — caching the zero would pin it for the
  track's lifetime.
- **Hash the fields that matter; skip the ones that don't.**
  `_BINDING_CFG_FIELDS` derives from one `_BINDING_FIELDS`
  table. Structural fields (buttonMode, reset-able state) are
  deliberately excluded.
- **Object identity is the cheapest hash.**
  `oldCfgs[name] === cfg` skips the whole hash path when a
  patch memo returns the same object across recomputes.
- **Dedupe → coalesce → throttle, in that order.**
  `_ledCache` drops unchanged; `_enqueueSysEx` folds queued
  updates for the same LED; the drain throttles the wire.
- **Probe at refresh, not at bind.** A function scheme's
  compiled shape can change at runtime (`countdownScheme`
  idle → beat). Freezing at bind time is faster but wrong
  for that case.
- **Bound every cache.** `_hwCache` and `_flatCache` at
  1024, `_sysexQueue` at 128. An unbounded cache is a leak
  with extra steps.
- **Trace every performance claim to a code path.** A
  per-path before/after with each row traceable to a function
  is what you'll need when the win has to be defended. An
  aggregate "fewer reads per second" is easy to make up and
  impossible to defend.