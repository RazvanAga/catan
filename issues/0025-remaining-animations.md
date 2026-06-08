---
title: Remaining animations — robber, dice, pulse, resource/steal
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Remaining animations — robber, dice, pulse, resource/steal

## Parent

[0022 — Catan v3: making the game feel alive](0022-feel-alive-pacing-animations-sounds.md)

## What to build

Fan out the effect pipeline from 0024 with the rest of the in-game motion, all driven
off the same event consumer + `effectsForEvent` mapper:

1. **Robber slide.** The robber transitions (CSS) to its new tile instead of
   teleporting, so its move is followable.

2. **Dice settle.** The existing tumbling dice get a small bounce/settle when they
   land on the rolled value — a roll reads as a roll, not an instant number swap.

3. **Current-player row pulse.** A subtle pulse on the existing `.current` roster
   highlight, so you can tell at a glance whose turn it is during the silent beats
   between bot actions. **No text label.**

4. **Resource / steal "felt" effects** (the lighter version — *not* literal flying
   cards):
   - On a resource gain or loss, the affected roster row's hand-count badge
     bumps/flashes with a brief floating **`+2 🌾`** / **`−1`** rising off the row;
     the local player's own hand cards pulse when they gain.
   - A steal **flashes both the victim and the taker** rows (the card itself stays
     hidden). No measured DOM source/target coordinates and no cross-board overlay —
     this stays calm during a multi-player resource grant and avoids coordinate
     fragility on resize.

All motion respects `prefers-reduced-motion: reduce` (slides/bounces removed, the
pulse frozen), following the pattern established in 0024.

## Acceptance criteria

- [ ] The robber slides to its new tile rather than teleporting.
- [ ] Dice settle with a bounce onto their rolled value.
- [ ] The current player's roster row pulses (no text label), updating as the turn
      passes.
- [ ] A resource gain/loss bumps the affected player's hand-count and floats a brief
      `+N <res>` / `−N`; the local player's own hand cards pulse on a gain.
- [ ] A steal flashes both the victim and the taker rows.
- [ ] All of the above are driven through the `effectsForEvent` mapper / event
      consumer from 0024, and fire for all players including the local one.
- [ ] With `prefers-reduced-motion: reduce`, slides and bounces are removed and the
      pulse is static.

## Blocked by

- [0024 — Client effect pipeline + piece pop-in](0024-effect-pipeline-piece-popin.md)
