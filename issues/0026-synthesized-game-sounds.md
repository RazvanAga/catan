---
title: Synthesized game sounds (Web Audio) + mute toggle
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Synthesized game sounds (Web Audio) + mute toggle

## Parent

[0022 — Catan v3: making the game feel alive](0022-feel-alive-pacing-animations-sounds.md)

## What to build

A small **synthesized** sound layer — no asset files, no licensing, no network — that
plays a cue on the same narration events the animations ride on, reusing the
`effectsForEvent` mapper from 0024 (extended so events carry a **sound cue** alongside
their animation cue).

A single self-contained Web Audio module exposes one cue per effect, mixed to
sensible fixed levels, in a cohesive chiptune palette:

- **Dice** — a rattle on roll and a soft land when they settle.
- **Placement** — a wood "thunk" on any settlement / city / road (so you *hear* bots
  building during their paced turns).
- **Robber / steal** — a low thud when the robber moves, a quick swipe on a steal.
- **Resource deal** — a card-shuffle/deal on resource grants.
- **Dev card** — a flip/whoosh on buy or play.
- **Your-turn chime** — a distinct cue when the turn returns to the **local** seat
  (the one inherently self-only cue).
- **Win** — a short fanfare on a win.

Cues fire for **all** players including the local one (except the your-turn chime,
which is self-only). Sounds are independent of `prefers-reduced-motion`; the mute
toggle is the only audio control.

Audio plumbing:

- The `AudioContext` is created suspended (browser autoplay policy) and **`resume()`d
  on the player's first in-game interaction** (the existing join/start click) — no
  separate "enable audio" prompt.
- A **single mute toggle** (speaker icon) lives in the in-game rail near the brand,
  **defaults to on**, and is **persisted in `localStorage`** (same pattern as the
  session token). No volume slider.

## Acceptance criteria

- [ ] A self-contained Web Audio module synthesizes one cue per effect (dice,
      placement, robber/steal, resource deal, dev card, your-turn, win) — no audio
      files are added to the repo.
- [ ] Cues are dispatched via the shared `effectsForEvent` mapper, extended to carry
      a sound cue per event alongside the animation cue.
- [ ] Cues fire for all players; the your-turn chime fires only when the turn returns
      to the local seat.
- [ ] The AudioContext resumes on the existing join/start click, with no separate
      "enable audio" prompt; the opening roll is audible.
- [ ] A single mute toggle in the in-game rail turns all sound off/on, defaults to
      on, and persists across reloads via `localStorage`.
- [ ] `prefers-reduced-motion` does not affect sound.

## Blocked by

- [0024 — Client effect pipeline + piece pop-in](0024-effect-pipeline-piece-popin.md)
