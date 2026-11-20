# Akai APC64

USB `09e8:0053`. Firmware **1.2.1.6** is the only version verified
by `esazhin/apc64-control`. Akai has not published a MIDI chart.

Tags: **[LIVE]** observed on a real unit (2026-10-22/23/27);
**[CODE]** Bitwig MIT APC64 extension or Akai editor disassembly;
**[TBD]** unknown.

Source of truth: `PROTOCOL-SPEC.md` and `NOTES-daw-mode.md` in
`github.com/esazhin/apc64-control`.

---

## 1. Ports

| ALSA port | Cable | Use |
|---|---|---|
| `APC64 DAW` | 0 | All SysEx + every DAW-mode surface message |
| `APC64 Notes` | 1 | Unused by any observed message |
| `APC64 MIDI` | 2 | Unused |
| `APC64 Custom` | 3 | Custom-mode pad/strip output |

Bind presets to `APC64 DAW`. ALSA sequencer access is shared;
rawmidi is exclusive.

---

## 2. Framing

`F0 47 00 53 <id> <hi> <lo> <payload> F7`.
`length = (hi << 7) | lo` = payload bytes. 7-bit packing only in
project/global dumps: one bit-7 flags byte per 8 data bytes.

---

## 3. Identity

Request `F0 7E 7F 06 01 F7` → response
`F0 7E 00 06 02 47 53 00 19 00 00 00 00 00 F7`.
Firmware `01 02 01 06` = 1.2.1.6. Refuse DAW mode unless product
`53` is seen.

---

## 4. DAW mode

Enter, in order, on the DAW port:

```
F0 47 00 53 1B 00 01 00 F7
F0 47 00 53 19 00 01 00 F7
F0 7E 7F 06 01 F7
F0 47 00 53 1C 00 01 01 F7
```

Exit `F0 47 00 53 1C 00 01 00 F7`. **[LIVE]** If the host exits
without sending off, the unit stays in DAW mode. No keep-alive
needed. USB unplug behaviour **[TBD]**; assume mode lost, re-run.

---

## 5. Views

Frame `F0 47 00 53 19 00 01 <m> F7` — report (unit → host) and
request (host → unit) share the shape.

| m | View |
|---|---|
| 0 | Session (host-drawn) |
| 1 | Overview [CODE] |
| 2 | Note |
| 3 | Chord |
| 5 | Drum [CODE] |
| 6 | Step Sequencer |
| 8 | Project |
| 9 | Custom |

**[LIVE] for 0, 2, 3, 6, 8, 9.** The unit obeys a request but does
**not** report the change back; its own view buttons still report.

**Session view is host-drawn** — the unit clears it on every mode
change, so a host must repaint on a mode-0 report. Our preset sets
Session once and never leaves it. The `SYSEX_INPUT` handler needed
to catch the mode-0 report is a framework addition (v0.2) — see §13.

In Note/Chord/Step/Project/Custom the pad grid belongs to the unit;
its notes go out on the Notes port (Note/Chord/Step) or Custom port
(Custom). In Custom view side buttons are silent except Shift(120),
Tempo(72), Play(91), Stop(93), encoder turn.

**Our preset: Session view only.**

---

## 6. Surface input (DAW port, unit → host)

Notes are note-on vel>0 press, note-off (or vel 0) release.

| Control | Message | Notes |
|---|---|---|
| Grid pads 0–63 | note-on 0–63, **ch 7**, vel = strike | pad 0 = bottom-left [LIVE in Custom; DAW index→position **[TBD]**] |
| Track-control row 1–8 | notes 64–71 (0x40+i), ch 1 | |
| Tempo, Clear, Duplicate, Quantize, Fixed, Undo | notes 72–77 (0x48–0x4D) | |
| Strip touch 1–8 | note-on/off 82–89 (0x52+i), ch 1 | |
| Play, Rec, Stop | notes 91, 92, 93 | |
| Nav down/up/left/right | notes 94, 95, 96, 97 | |
| Track buttons 1–8 | notes 100–107 (0x64+i) | |
| Rec Arm/Mute/Solo/Stop mode | notes 108–111 | |
| Scene 1–8 | notes 112–119 (0x70+i) | |
| **Shift** | note **120** (0x78) | **Not applied by device**; shifted buttons arrive with normal IDs |
| **Strip mode Device/Volume/Pan/Sends/Channel/Off** | notes **121–126** | |
| **Strip 1–8 position** | **pitch bend**, channel = strip (ch 1–8), 14-bit 0–16383 | |
| **Encoder turn** | **CC 0x5A** (`B0 5A`), **0x01 = right, 0x7F = left** | **[LIVE]**, also with Shift |
| Encoder press | note 0x5A | **[CODE]**; live capture saw nothing — may not fire |
| Pad velocity/aftertouch | Session: fixed 127, no AT | Expressive only in unit's own views |

Device-local, never reaching host: pad-mode buttons and Project
menu (save/save as). Outside DAW mode all buttons silent except
pads and strips.

---

## 7. Surface output (DAW port, host → unit)

### 7.1 Grid-pad LEDs

```
note-on, channel = behaviour (0–15), note = pad, velocity = palette index (0–127)
```

**[LIVE] ch 6 = full.** Behaviour codes: 0 10 %, 1 25 %, 2 50 %,
3 60 %, 4 75 %, 5 90 %, 6 full, 7–10 pulse 1/16–1/2, 11–15 blink
1/24–1/2. Mode and brightness are bundled in one code.

### 7.2 Track buttons / track-control row

**RGB like pads, note = control ID, ch 0** `[CODE: Bitwig]`. This
is a different path from the behaviour channel. **Not implemented
in v0.1.**

### 7.3 Single-LED buttons

Note-on, note = control ID, **ch = state−1**, velocity 1 for states
1–16; off = note-on ch 0 velocity 0 `[CODE]`. Covers scenes, modes,
transport, nav, function, strip modes, shift, encoder press. **Not
implemented in v0.1** (except encoder press binding, which is
`idx: -1` and never emits).

### 7.4 Touch strip LEDs

- Colour: **CC 0x70+i (112–119)**, value = palette index `[CODE]`.
- Mode: **CC 0x68+i (104–111)**: 0 off, 1 bar white, 2 bar red,
  3 bipolar white, 4 bipolar red `[CODE]`.
- Position display: pitch bend on ch = strip, 14-bit `[CODE]`.

**Documented, unbound in v0.1.**

### 7.5 OLED

`F0 47 00 53 10 00 <row> <text…> F7`. **[LIVE] rows 0 and 1**;
≤14 chars safe; row count and max length **[TBD]**. Reference shows
only one length byte between id and row — treated as abbreviated;
our code sends the standard `id <hi> <lo> <row> <text>` with
`lo = 1 + text.length`. One-line fix if live capture disagrees.

Backlight CC 0x59, value = palette index `[CODE]`.

### 7.6 Palette

Velocity/CC indexes Ableton's 128-colour clip palette `[CODE]`.
Exact RGB per index on APC64 **[TBD]**; `PALETTE_TABLE` is the
Ableton approximation. Override `myCatnip.APC64_PALETTE_TABLE`
before boot with a measured table. Duplicates collapse to first
index under quantisation; the lab uses `paletteIdx` to bypass
quantisation entirely.

---

## 8. Project memory (editor contract)

**A DAW host must never send `0x14` or `0x18`.**

Read project `F0 47 00 53 13 00 01 <slot> F7` → `14 07 6F
<1006 packed>`; 1006 packed → 880 raw; slots 0–24; slot 0 = live
edit buffer. 64 pad records × 12 + 8 strip records × 14.

Read global `F0 47 00 53 17 00 00 F7` → `18 00 40 <64 packed>`;
64 → 56 raw.

Full byte layouts in `PROTOCOL-SPEC.md` §8; not used by this preset.

---

## 9. What the device does not do

- Does not report view switches back.
- Does not report internal LED changes (there are none in Session).
- Does not emit a keep-alive.
- May not survive unplug in DAW mode; re-run the handshake.

---

## 10. The `apc64-colorlab` preset

`config/apc64-colorlab.js` + `apc64-colorlab.js`. Session view only.
Visual top-left = custom slot 0 = wire note 56 (orientation
assumption; see §6).

| Row | Notes | Role |
|---|---|---|
| 1 | 56–63 | custom 0–7 |
| 2 | 48–55 | custom 8–15 |
| 3 | 40–47 | custom 16–23 |
| 4 | 32–39 | demo play (32), cue (33); 34–39 spare |
| 5 | 24–31 | section 0–7 |
| 6 | 16–23 | options 0–7 |
| 7 | 8–15 | options 8–15 |
| 8 | 0–7 | +bright, −bright, +mode, −mode, spare, spare, arm (yellow), save (red) |

**State**: `currentIdx` (0–127), `currentMode` (LED_MODES key),
`editSlot` (0–23), `armedLoad`, `saved[24]` (`{idx, mode}` or null).

**Behaviour**: selected pad mirrors current pair; unselected saved
pads render their saved mode (can pulse/blink); unsaved pads black.
Section `s` = palette `s*16`; option `o` = `section*16+o`.
`+bright/−bright` wrap 0–6, preview white at target; `+mode/−mode`
wrap 7–15, preview pulsing/blinking. Arm (yellow): press → armed,
next custom pad loads its saved state or, if empty, resets to
startup and disarms. Save (red): writes current pair to editSlot;
red when saved ≠ shown, green when equal. Encoder turn → menu;
press → dump. Shutdown: dump + exit handshake.

**Dump format**:

```js
myCatnip.APC64_USER_PALETTE = [
    { paletteIdx: 55, mode: 'full' },
    null,
    /* ... 24 entries total ... */
];
```

---

## 11. v0.1 limits

- No sysex input hook in Mixxx — cannot react to a mode-0 report.
  Mitigation: repaint on init (250 ms sweep) and on every state
  change; never leave Session view.
- Encoder press binding exists but may never fire `[CODE]`.
- Track-button and single-LED button output paths documented, not
  implemented.
- Strip LEDs documented, unbound.
- Grid index→position in DAW mode `[TBD]`; custom-slot mapping
  assumes Custom-mode orientation.
- Palette RGB exact values `[TBD]`; Ableton approximation.
- OLED row count beyond 2 `[TBD]`.

---

## 12. Not used, documented

Custom view (mode 9), project memory, global settings (CV, drum
map, sync), track-control row, transport, track buttons, rec/mute/
solo, scene buttons, strip-mode buttons. All available for future
presets.

---

## 13. Colour-system architecture note

The framework delta for APC64 is eight small edits in
`lib/schemes.js`, `lib/binding.js`, and `lib/controller-render.js`.
They do three things: let a string brightness token survive parsing;
let an object colour entry carry `paletteIdx`; and short-circuit
`_solveHw` for strings. All are backward-compatible; K3 and Inpulse
behave identically.

**These edits are candidate for a later abstraction.** The shared
concept is a **colour entry**: `{ rgb, brightness, brightnessOff,
paletteIdx? }`, with a per-HW `parseBrightness(token)` that turns
`'full'` / `'pulse.quarter'` / `110` into whatever the wire needs.
Today that logic is split between `resolveColorEntry`, `_pickBr`,
and each descriptor. A future `lib/color-entry.js` could own the
entry shape and the token parsing, with K3 / Inpulse / APC64 each
supplying a small table. That would move `DEFAULT_RGB_BRIGHTNESS`
and the token vocabulary out of the framework defaults and into the
hardware module, which is where they belong. **Not doing it now** —
the current edits unblock APC64 without touching the K3 path, and
the abstraction is easier to design once a third hardware exercises
it. This note exists so the debt is visible.