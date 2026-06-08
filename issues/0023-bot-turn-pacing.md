---
title: Bot turn pacing — async server drive loop
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot turn pacing — async server drive loop

## Parent

[0022 — Catan v3: making the game feel alive](0022-feel-alive-pacing-animations-sounds.md)

## What to build

Stop the server from resolving all bot moves in a single synchronous burst. Insert
a short wait **before each individual bot dispatch** so a bot's turn unfolds as a
watchable play-by-play over the wire — the per-step snapshot the server already
broadcasts after every action simply arrives spaced out instead of all in one tick.

The driver becomes **async**: it loops as today (interleaving vacant-seat resolution
and bot moves under its existing guard) but `await`s a delay before each bot action.
The wait comes *before* the action (pause-before), so it reads as deliberation
preceding the move. Pacing applies to **every** bot dispatch — on-turn moves, forced
discards after a 7, and trade responses to a human proposal — routed through the
existing "which bot owes input" resolution, with no per-action special-casing.

Timing: a base of **700ms ± ~150ms jitter** before each bot action, with a longer
**~1s beat on the first action of a bot's turn** (the handoff). Durations are named
constants for easy retuning; the jitter keeps the rhythm from feeling metronomic.

The delay is **injected** like the existing `rollDice` / `vacancyMs` options — a new
`delay?: (ms: number) => Promise<void>` on the room constructor, threaded through the
server-creation options. Production defaults to a real `setTimeout`-based sleep; tests
inject an immediate (resolved-promise) delay so the real async loop runs with the
clock collapsed.

Concurrency must stay correct now that the loop yields:

- A **single in-flight guard** ensures only one drive loop runs at a time. New
  triggers (a human action, a vacancy timer) do not start a second loop — the running
  loop re-reads fresh state after each `await` and picks up newly-dispatched actions
  on its next beat.
- A **`generation` counter**, bumped on any state-replacing lifecycle event
  (`reset` / new game), is captured by the loop on entry; the loop **bails
  immediately** if it changes mid-pause, so a paused loop never resumes against a
  wiped or restarted board.
- **Human actions always dispatch synchronously and immediately** (their snapshot/
  error returns at once); only the subsequent bot choreography is async. `apply()`
  returns the drive promise so callers/tests can await the table settling.

Pacing is **not** gated on whether a human is watching — the loop stays a pure
function of game state.

## Acceptance criteria

- [ ] A bot's turn resolves as separate, time-spaced actions rather than a single
      synchronous burst; a `delay` option injected on the room/server controls the
      spacing and defaults to a real timer in production.
- [ ] Each bot action waits ~700ms (± ~150ms jitter) before dispatching, with a
      longer ~1s beat on the first action of a bot's turn; durations are named
      constants.
- [ ] Forced bot discards after a 7 and bot trade responses to a human proposal are
      each paced on the same beat.
- [ ] A human's own actions dispatch immediately with no added delay; `apply()`
      returns a promise that resolves when the drive loop has settled.
- [ ] Only one drive loop runs at a time; a `reset`/new-game mid-drive (generation
      change) aborts the paused loop without corrupting or resuming against the new
      state.
- [ ] The post-7 order holds: the roller's robber move only begins once all required
      discards (bot and human) are in, and a human discard submitted while bots are
      mid-sequence is accepted immediately and absorbed by the running loop.
- [ ] Play never stalls or hangs on a bot with pacing added.
- [ ] Tests inject an immediate delay so the real async loop runs near-instantly; the
      existing all-bot / bot-majority game still runs to a 10-VP victory, and tests
      `await` the settle rather than racing timeouts.

## Blocked by

- None - can start immediately
