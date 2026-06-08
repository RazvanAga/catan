---
title: Bot plays development cards (knight + progress)
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot plays development cards (knight + progress)

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

Let the bot play the development cards it buys, so bots can earn Largest Army and
use the full deck. Extend `decideBotMove` to optionally return a single
`PLAY_DEV_CARD` move during its turn, respecting the dev-card rules:

- **Knight:** move the robber and steal, reusing the robber-targeting heuristic
  from the turn-loop slice (leading opponent, richest legal victim). Counts toward
  Largest Army via the existing reducer.
- **Progress cards:** `road_building` (two legal connected edges), `year_of_plenty`
  (two useful resources — e.g. toward the cheapest build the bot is short on),
  `monopoly` (the resource the bot most benefits from claiming).
- **Victory-point cards:** never "played" — they just count, hidden until a win
  (existing behavior; the bot must not try to play them).

The bot plays at most one dev card per turn and never one bought the same turn
(the reducer enforces both; the bot must not propose a move that violates them).
The server fills the knight's stolen card via `pickStolenCard`, exactly as for a
human knight.

## Acceptance criteria

- [ ] The bot returns a legal `PLAY_DEV_CARD` move when it holds a playable card and it's sensible to play.
- [ ] Knight: returns a legal robber tile + victim (or null victim), and playing it increments the bot's knights/Largest Army through the normal reducer.
- [ ] Progress cards return legal targets: road_building → legal connected edges; year_of_plenty → two resources; monopoly → a resource.
- [ ] The bot never returns a move to "play" a victory_point card.
- [ ] The bot respects one-dev-card-per-turn and not-bought-this-turn (never emits a move the reducer would reject for these reasons).
- [ ] The knight's stolen card is filled server-side via `pickStolenCard`, indistinguishable from a human knight to `reduce`.
- [ ] Policy tests cover: knight target/victim choice; each progress card's target; refusal to play a same-turn card or a second card; victory_point never played.
- [ ] Server (integration) test: an all-bot game played end-to-end reaches a 10-VP victory (a bot wins), exercising building, dev cards, and Largest Army together.

## Blocked by

- [0018 — Bot building & dev-card buying](0018-bot-building-and-buying.md)
