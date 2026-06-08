---
title: Bot building & dev-card buying (ACTIONS policy)
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot building & dev-card buying (ACTIONS policy)

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

Give the bot a productive action phase so a game with bots actually progresses
toward victory. Extend `decideBotMove`'s ACTIONS handling from "end turn
immediately" to a priority ladder that spends resources, choosing the first
legal/affordable option each call (the driver applies it and calls again, so a
whole build-out emerges as a sequence of single moves):

1. Upgrade a settlement to a **city** if affordable and legal.
2. Build a **settlement** if affordable and on a legal vertex (distance rule +
   own-road connectivity).
3. Build a **road** if affordable and legal (kept simple — affordable + connected;
   ideally one that opens a future settlement spot).
4. **Buy a development card** if affordable and the deck is non-empty.
5. Otherwise **END_TURN**.

The ladder is rigid and legality-checked against the same helpers the reducer and
client affordances use, so every returned move passes server re-validation. The
ladder must always terminate at END_TURN.

## Acceptance criteria

- [ ] In ACTIONS the bot returns the highest-priority affordable+legal build: city, then settlement, then road, before falling back to other moves.
- [ ] The bot buys a development card when it has spare resources and the dev deck is non-empty.
- [ ] The bot never returns an unaffordable or illegal build (verified against the same legality helpers used elsewhere).
- [ ] The bot returns END_TURN when no useful build/buy remains, and the ACTIONS ladder always reaches END_TURN in finite steps (no infinite loop).
- [ ] `decideBotMove` build/buy decisions are pure and deterministic for a given state.
- [ ] Reducer/policy tests cover: city preferred over settlement preferred over road when several are affordable; dev-card buy when flush; END_TURN when nothing is affordable; no illegal/unaffordable move emitted.
- [ ] Server (integration) test: a bot game now visibly accumulates buildings and victory points across turns.

## Blocked by

- [0017 — Bot turn loop + server driver](0017-bot-turn-loop-and-server-driver.md)
