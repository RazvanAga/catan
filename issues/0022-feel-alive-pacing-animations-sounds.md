---
title: Catan v3 — make the game feel alive (bot pacing, animations, sounds)
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Catan Web Game — v3: making the game feel alive

## Problem Statement

Now that I can fill empty seats with bots, I can finally play a full game on my
own — but it doesn't *feel* like a game. When I finish my turn against three bots,
all three of them play their entire turns in a single instant and the turn snaps
straight back to me. I never see what happened: who rolled what, who built where,
who got robbed. The board just silently rearranges itself between my clicks. There
is no sound and no motion anywhere — pieces teleport onto the board, the robber
jumps, dice results blink into place. The result is a technically-correct game that
feels dead and is hard to follow, especially during the bots' turns, which are the
whole point of playing with bots.

## Solution

Three coordinated changes make a game — especially a game with bots — feel paced,
legible, and alive:

1. **Bot turn pacing.** The server stops resolving all bot moves in one synchronous
   burst. Instead it inserts a short wait before each individual bot action, so a
   bot's turn unfolds as a watchable play-by-play: a beat, the dice land, a beat, a
   road appears, a beat, the turn passes. Every bot action — on its own turn *and*
   off-turn (forced discards after a 7, responses to a trade I proposed) — gets its
   own beat. The human is never made to wait on this pacing: my own moves always
   resolve instantly, and I can act (e.g. discard after a 7) while bots are still
   taking their beats.

2. **Animations.** Driven by the narration events the server already streams, the
   client adds small, tasteful motion: pieces pop in when built, the robber slides
   to its new tile, the dice settle when they land, the current player's roster row
   pulses, and resource gains/losses/steals register as a count "bump" with a small
   floating `+2 🌾` / `−1` and a steal flashing both parties. Motion is suppressed
   when the OS requests reduced motion.

3. **Sounds.** A small synthesized (Web Audio) sound layer plays a cue on the same
   events: dice rattle-and-land, a wood thunk on placement, a thud/swipe on the
   robber and steals, a card-deal shuffle on resource grants, a flip on dev-card
   buy/play, a distinct chime when the turn returns to *me*, and a short fanfare on
   a win. Sound is on by default, unlocked on my first in-game interaction, and
   toggled by a single mute button in the in-game rail (persisted across reloads).

Together these turn "the bots played, here's the new board" into "I watched the
bots play, and it sounded and looked like a real game."

## User Stories

### Bot turn pacing

1. As a solo player against bots, I want a short pause before each bot action, so
   that I can follow what each bot is doing instead of seeing the board snap to my
   next turn.
2. As a player, I want a bot's turn to unfold action-by-action (roll, then build,
   then build, then end), so that the sequence of play is legible.
3. As a player, I want the pause before a bot's first action of its turn to be a
   touch longer, so that I register *whose* turn it is before they act.
4. As a player, I want the pacing to be slightly irregular rather than a perfect
   metronome, so that it feels like a person deciding rather than a clock ticking.
5. As a player who rolled or witnessed a 7, I want each bot's forced discard to take
   its own beat, so that a 7 reads as a sequence of events instead of a single
   flicker.
6. As a player who proposed a trade to the table, I want the bots' accept/decline
   answers to trickle back one at a time, so that it feels like each bot is weighing
   my offer.
7. As the active human player, I want my own moves to resolve instantly with no
   artificial delay, so that pacing never makes *me* wait.
8. As a player who must discard after a 7, I want to be able to submit my discard
   immediately even while bots are still taking their discard beats, so that I am
   never blocked on bot pacing.
9. As a player, I want the roller's robber move to wait until every required discard
   (mine and the bots') is in, so that the standard turn order is preserved.
10. As a player, I want play to never stall or hang on a bot even with pacing added,
    so that the game always progresses to completion.
11. As a developer, I want bot pacing to run identically (just instantly) in tests,
    so that the existing all-bot-victory and bot-behavior tests stay fast and
    deterministic.

### Animations

12. As a player, I want settlements, cities, and roads to pop in when built, so that
    I can see where new pieces land — especially during bot turns.
13. As a player, I want the robber to slide to its new tile rather than teleport, so
    that I can follow where it went.
14. As a player, I want the dice to settle onto their rolled value with a small
    bounce, so that a roll reads as a roll and not an instant number swap.
15. As a player, I want the current player's roster row to pulse, so that I can tell
    at a glance whose turn it is during the silent beats between bot actions.
16. As a player, I want a resource gain or loss to show as a count bump with a small
    floating `+2 🌾` / `−1` on the affected player's row, so that I can see who got
    what on a roll without literal flying cards cluttering the screen.
17. As a player, I want a steal to flash both the victim and the taker, so that I can
    see a card changed hands even though the card itself is hidden.
18. As a player, I want my *own* placements and rolls to animate too, so that my
    turns feel as tactile as the bots'.
19. As a player who has enabled "reduce motion" in my OS, I want pieces to simply
    appear and the pulse to stay static, so that the game respects my accessibility
    preference.
20. As a player, I want animations to be driven by the same paced event stream, so
    that each effect lands on its own beat rather than all at once.

### Sounds

21. As a player, I want a rattle-and-land sound when dice are rolled, so that a roll
    feels physical.
22. As a player, I want a wood "thunk" when any player places a settlement, city, or
    road, so that I can *hear* the bots building during their turns.
23. As a player, I want a thud when the robber moves and a swipe when a card is
    stolen, so that the robber's menace registers audibly.
24. As a player, I want a card-deal shuffle when resources are granted, so that
    production on a roll is audible.
25. As a player, I want a flip/whoosh when a development card is bought or played, so
    that dev-card play has feedback.
26. As a player, I want a distinct chime when the turn comes back to *me*, so that I
    can look away during bot turns and my ear tells me to look up.
27. As a player, I want a short fanfare when someone wins, so that the end of the
    game feels like an event.
28. As a player, I want my own actions to make their sounds too, so that the table
    sounds consistent regardless of who is acting.
29. As a player, I want a single mute button in the in-game rail, so that I can turn
    sound off.
30. As a player, I want my mute choice to persist across reloads, so that I don't
    have to re-mute every time I open the game.
31. As a player, I want sound to start working without a separate "click to enable
    audio" prompt, so that the experience is seamless (it unlocks on the join/start
    click I already make).
32. As a player, I want sound on by default, so that a new game sounds alive without
    my having to discover a setting.

## Implementation Decisions

### Pacing lives on the server (async drive loop)

- Pacing is **server-side**, not a client-side replay queue. The server already
  pushes a discrete personalized snapshot + narration `events` message after *each*
  bot action (one `dispatch` → one `broadcast`). Today the whole sequence flushes in
  a single tick. The change is to make the driver `await` a delay between steps, so
  those already-emitted snapshots arrive spaced out over the wire. This keeps a
  single source of pacing truth for all viewers and reuses the per-step broadcast
  rather than inventing a divergent client clock.
- The driver (`drive()` in the room) becomes **async**: it loops as today
  (interleaving vacant-seat resolution and bot moves under its existing guard), but
  **`await`s a delay *before* each bot dispatch** (pause-before, so the wait reads as
  deliberation preceding the action). Vacant-seat auto-resolution does not need a
  human-facing beat but shares the loop; pacing is keyed to *bot* dispatches.
- **Delay is injected**, mirroring the existing `rollDice` / `vacancyMs` options:
  a new `delay?: (ms: number) => Promise<void>` is added to the room constructor
  options and threaded through `createGameServer`'s options. Production default is a
  real `setTimeout`-based sleep; tests inject an immediate (resolved-promise) delay.
- **Timing:** a base of **700ms ± ~150ms of jitter** before each bot action, with a
  longer **~1s beat on the first action of a bot's turn** (the handoff). All durations
  are named constants at the top of the room module for easy retuning. The jitter
  keeps the rhythm from feeling metronomic.
- Pacing covers **every** bot dispatch: on-turn moves, **forced discards** after a 7,
  and **trade responses** to a human proposal — all routed through the existing
  "which bot owes input" resolution, so there is no special-casing per action type.

### Concurrency: single in-flight guard + generation epoch

- The async loop must not run twice concurrently or resume against a replaced state.
  A **single in-flight guard** ensures only one drive loop runs at a time; new
  triggers (a human action, a vacancy timer firing) do **not** start a second loop —
  the running loop re-reads fresh state after each `await` and naturally picks up
  newly-dispatched actions on its next beat.
- A **`generation` counter** is bumped on any state-replacing lifecycle event
  (`reset()` / new game). The drive loop captures the generation on entry and
  **bails immediately** if it changes mid-pause, so a paused loop never resumes
  against a wiped or restarted board.
- **Human actions always `dispatch()` synchronously and immediately** (their own
  snapshot/error returns at once); only the subsequent bot choreography is async.
  `apply()` returns the drive promise so tests can `await` the table settling. The
  socket handlers do not need to await the choreography.
- Concretely this makes the post-7 case correct: bots take paced discard beats while
  the human's discard panel is live; the human may submit at any time (synchronous
  dispatch), the in-flight loop absorbs the new state on its next beat, and the
  roller's `MOVE_ROBBER` does not begin until the existing reducer gate
  (`DISCARD` → `MOVE_ROBBER` only when all required discards are in) is satisfied.
- Pacing is **not** gated on whether a human is watching. The loop stays a pure
  function of game state; an abandoned all-bot room finishes slowly on `unref`'d
  timers (harmless and unobserved).

### Client effects are event-driven, off the existing narration stream

- Both animations and sounds are driven by the **narration events** the client
  already receives and (currently) collects unused in the store. A small client-side
  **event consumer** tracks a cursor into the event log and reacts only to events
  appended after mount (a reconnect sends a snapshot with no event replay, so there
  is no effect-storm on rejoin).
- The mapping from a `GameEvent` to its effect(s) is a **single pure function**,
  `effectsForEvent(event)`, returning the animation cue and/or sound cue for that
  event. Both the animation layer and the sound layer consume this one mapper, so
  the policy ("a `SETTLEMENT_BUILT` plays a thunk and pops the piece") lives in one
  tested place. Effects fire for **all** players including the local one; the only
  inherently self-only cue is the your-turn chime (fired when the turn returns to the
  local seat).
- **Board piece pop-ins** additionally use **CSS-on-mount** (keyed by vertex/edge),
  which needs no event wiring — the event-driven path is reserved for things a state
  diff cannot express (steals, dev-card plays, rolls, win, the your-turn chime).

### Animation scope and fidelity

- In scope: (1) **piece pop-in** (scale+fade on mount), (2) **robber slide** (CSS
  transition on tile position), (3) **dice settle** (a bounce when the existing
  tumbling dice land on the rolled value), (4) **current-player row pulse** (a subtle
  pulse on the existing `.current` roster highlight — **no text label**), and
  (5) **resource/steal "felt" effects**.
- The resource/steal effects are the **lighter "felt" version, not literal flying
  cards**: the affected roster row's hand-count badge bumps/flashes with a brief
  floating `+2 🌾` / `−1` rising off the row (and the local player's own hand cards
  pulse when they gain); a steal flashes both the victim and the taker rows. No
  measured DOM source/target coordinates and no cross-board overlay — chosen to stay
  calm during a multi-player resource grant and to avoid coordinate fragility on
  resize.
- All motion is wrapped so that `prefers-reduced-motion: reduce` removes the pop/
  slide/bounce and freezes the pulse (a CSS media query around the keyframes).

### Sound: synthesized Web Audio

- Sounds are **synthesized in code via the Web Audio API** — no asset files, no
  licensing, no network. A single self-contained sound module exposes one cue per
  effect (dice, placement, robber/steal, resource deal, dev card, your-turn, win),
  mixed to sensible fixed levels. A cohesive chiptune palette across all cues is the
  intended aesthetic.
- The `AudioContext` is created suspended (browser autoplay policy) and **`resume()`d
  on the player's first in-game interaction** (the existing join/start click) — no
  separate "enable audio" prompt.
- A **single mute toggle** (speaker icon) lives in the in-game rail near the brand,
  **defaults to on**, and is **persisted in `localStorage`** (same pattern as the
  session token). No volume slider in this version. Reduced-motion does not affect
  sound; the mute toggle is the only audio control.

### Slicing

- This is the parent PRD. It will be implemented as **three independently
  shippable slices**, created via the issue tracker:
  - **0023 — Bot turn pacing** (server): async drive loop, injected `delay`,
    in-flight guard + generation epoch, `apply()` returns the drive promise. No
    visual dependencies; independently valuable.
  - **0024 — Animations** (client): event consumer + `effectsForEvent` mapper,
    CSS-on-mount pop-ins, robber slide, dice settle, current-player pulse, felt
    resource/steal effects, reduced-motion handling.
  - **0025 — Sounds** (client): synthesized Web Audio module, event→cue dispatch via
    the shared mapper, unlock-on-join, persisted mute toggle.
- Pacing lands first (it spaces out the event stream the other two ride on);
  animations and sounds depend on pacing but not on each other and may land in
  either order.

## Testing Decisions

A good test here asserts **external behavior over the highest existing seam**, never
implementation details. We do not assert timing wall-clock values, CSS class
internals, or that an oscillator was created — we assert ordering, sequencing, and
the event→cue mapping.

- **Pacing (server).** Tested over the **existing Socket.IO integration harness** in
  `server/test/bots.test.ts`, which boots a real server via `createGameServer` and
  drives games through client sockets. Tests inject `delay` as an **immediate
  (resolved-promise) sleep**, so the *real* async drive loop runs (preserving its
  event-loop yielding and ordering) but completes near-instantly. Assertions:
  - An all-bot / bot-majority game still **runs to a 10-VP victory** (the existing
    test at `bots.test.ts:331` continues to pass, now exercising the async loop).
  - Play **does not stall**: after a human action, the table settles back to the
    human's turn (or to a terminal state).
  - The **post-7 ordering** holds: the roller's robber move only occurs once all
    required discards (bot and human) are in, and a human discard submitted while
    bots are mid-sequence is accepted immediately.
  - The **in-flight guard / generation** behavior: a `reset`/new-game mid-drive does
    not corrupt state or resume the stale loop.
  - Because `apply()` returns the drive promise, tests `await` the settle instead of
    racing `waitFor` timeouts.
- **Effect mapping (client/shared).** The pure **`effectsForEvent(event)`** mapper is
  unit-tested in isolation (event in → expected animation/sound cue out), the way the
  pure reducer and rules functions are tested in `shared/test/`. This covers the
  policy (which events produce which cues, the self-only your-turn chime, that a
  steal maps to both a sound and a both-parties flash) without standing up a DOM or
  an `AudioContext`.
- **Not unit-tested (thin adapters):** the CSS keyframes/transitions, the Web Audio
  synthesis itself, and the `localStorage` mute persistence are thin edges verified
  by manual play, not automated tests. Prior art for keeping such edges out of the
  suite: the client currently has no rendering tests and relies on the pure layers
  below it being well-tested.

## Out of Scope

- **Literal flying-card animations** between players (the felt count-bump version is
  used instead). A future upgrade could promote a specific moment (e.g. the steal) to
  a true fly-across.
- **A volume slider** and per-cue volume — a single mute toggle only.
- **File-based / downloaded audio assets** — all sounds are synthesized. A premium
  fanfare loaded from a file could be added later behind the same cue interface.
- **A win-celebration animation flourish** — the existing `VictoryScreen` handles the
  win; only a one-shot win *sound* is in scope here.
- **Per-action-type pacing durations** (e.g. a longer beat specifically for the
  robber) — a single base delay + jitter + handoff beat for now; add per-type tuning
  only if a specific action's animation needs room.
- **Client-side pacing / replay buffering** — rejected in favor of server-side
  pacing.
- **Configurable pacing speed per client** — durations are fixed server constants.
- **Spectator-aware pacing** (collapsing pacing when no human watches) — explicitly
  not done.

## Further Notes

- A pleasant freebie of server pacing: during a bot's pre-roll beat the client
  already renders tumbling dice for the current seat (the existing
  `Die value={null}` animation when the phase is `MUST_ROLL`), so "the bot is about
  to roll" is visible for free before the `ROLL` dispatch lands.
- The `DISCARD` → `MOVE_ROBBER` gate is already enforced in the reducer (the discard
  reducer only advances the turn phase once every required discard is in), so pacing
  does not need to re-implement it — it only spaces out the bot discards within that
  existing window.
- The narration `events` stream and the store's unused `events` array already exist;
  this work is the first consumer of them for player-facing effects.
