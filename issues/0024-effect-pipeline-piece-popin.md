---
title: Client effect pipeline + piece pop-in (tracer bullet)
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Client effect pipeline + piece pop-in (tracer bullet)

## Parent

[0022 — Catan v3: making the game feel alive](0022-feel-alive-pacing-animations-sounds.md)

## What to build

The end-to-end spine that later animation and sound slices ride on, proven with the
single simplest effect: **built pieces pop in**.

Two pieces of plumbing plus one visible effect:

1. **Event consumer.** The client already receives narration `events` after every
   action and collects them, unused, in the store. Add a consumer that tracks a
   **cursor** into that log and reacts only to events appended **after mount** — a
   reconnect sends a snapshot with no event replay, so there must be no effect-storm
   on rejoin.

2. **`effectsForEvent(event)` mapper.** A single **pure function** mapping a
   `GameEvent` to its effect cue(s). In this slice it only needs to express the
   animation side and one event (a built settlement/city/road), but its shape must
   anticipate sound cues being added later (0026) — both layers will consume this one
   mapper so the "which event produces which effect" policy lives in one tested
   place. Effects are not filtered by player; they fire for all players including the
   local one.

3. **Piece pop-in.** Settlements, cities, and roads **scale + fade in on mount**
   (keyed by vertex/edge) so newly-built pieces visibly appear — for the local
   player and, watchably during paced bot turns, for opponents. This first effect
   uses CSS-on-mount and does not strictly need the mapper to fire, but wire the
   consumer/mapper in this slice anyway so the pipeline is proven end-to-end and
   ready for the event-driven effects in 0025.

Motion respects `prefers-reduced-motion: reduce` (pieces simply appear) — establish
that media-query pattern here so later effects follow it.

## Acceptance criteria

- [ ] A client event consumer reacts only to narration events appended after mount;
      reconnecting (snapshot with no event replay) triggers no effects.
- [ ] A pure `effectsForEvent(event)` function returns the effect cue(s) for an
      event and is unit-tested in isolation (event in → expected cue out), in the
      style of the pure rules tests in `shared/test/`.
- [ ] The mapper's shape anticipates a sound cue being attached to an event later
      without restructuring.
- [ ] Newly-built settlements, cities, and roads scale+fade in on mount, for both the
      local player and (during paced turns) bots; pre-existing pieces do not
      re-animate on unrelated re-renders.
- [ ] With `prefers-reduced-motion: reduce`, pieces appear with no pop animation.
- [ ] Effects fire regardless of which player acted (no per-player filtering).

## Blocked by

- [0023 — Bot turn pacing](0023-bot-turn-pacing.md) (so bot-built pieces pop in one
  at a time on their own beat rather than all at once)
