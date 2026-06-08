---
title: Bot turn loop (setup, roll, robber, discard) + server driver
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot turn loop (setup, roll, robber, discard) + server driver

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

Make a bot actually take its turns automatically so a game with bots never stalls —
even though the bot does not build anything yet. This is the core tracer bullet:
the pure decision function plus the server-side driver that feeds the bot's moves
back through `reduce`.

Two parts:

1. **`decideBotMove(state, botId)` (pure, in `shared/`)** — returns the single next
   RNG-free intent the bot wants, or `null` when the bot owes nothing right now.
   `BotMove` is a discriminated union shaped like the client→server inputs (no
   actor id, no server RNG: no dice faces, no stolen card). This slice implements
   the phases needed for a non-stalling, unproductive turn loop:
   - *Setup settlement:* a legal distance-rule vertex, preferring the highest total
     pip value of adjacent tiles, else first legal.
   - *Setup road:* a legal edge adjacent to the just-placed settlement.
   - *MUST_ROLL:* roll.
   - *ACTIONS:* end the turn immediately (no building yet).
   - *DISCARD (after a 7):* shed exactly the required count, dropping from the
     most-held resources first (deterministic — reads its own full hand).
   - *MOVE_ROBBER:* a legal tile (≠ current robber tile), preferring one adjacent
     to a leading opponent and not the bot itself; steal from a legal non-empty
     victim there (richest by hand count) or `null` if none.

2. **The server bot driver (in `server/`)** — mirrors the existing
   `settleVacantSeats()` auto-driver. After every applied action, run a bounded
   loop: while the seat that currently owes input is a bot (its turn in SETUP /
   MUST_ROLL / ACTIONS / MOVE_ROBBER, or it owes a discard during DISCARD), call
   `decideBotMove`, translate the `BotMove` into a full `Action` filling RNG from
   the room's existing sources (`rollDice` for ROLL, `pickStolenCard` for the
   robber), `dispatch` it, and repeat. A hard guard bound prevents infinite loops.

Bots have no socket and no token, so disconnect/vacancy/reclaim logic never touches
them; the driver is their only input source. Bot actions surface to clients through
the normal snapshot + event stream, so no client changes are needed and the bot's
hidden hand/dev cards stay hidden via the existing projection.

## Acceptance criteria

- [ ] `decideBotMove(state, botId)` is pure and deterministic: the same state yields the same move.
- [ ] In SETUP it returns a legal settlement (distance rule respected), then a legal adjacent road, across both snake-draft rounds; the second settlement's resource grant happens via the normal reducer.
- [ ] In MUST_ROLL it returns a roll move; in ACTIONS (this slice) it returns END_TURN.
- [ ] In DISCARD it returns a discard summing to exactly the required count, drawn from the largest holdings; never more or fewer than required.
- [ ] In MOVE_ROBBER it returns a legal tile and a legal non-empty victim (or null when none exists), never the current robber tile.
- [ ] The server driver auto-advances any bot seat that owes input, mirroring `settleVacantSeats`, and is folded into `Room.apply` so bot turns resolve right after a human action.
- [ ] The driver fills all RNG server-side (dice, stolen card) exactly as the human socket handlers do; `reduce` cannot tell a bot action from a human one.
- [ ] The driver loop is bounded by a guard; an unexpected state degrades to stopping, never an infinite loop or hung server.
- [ ] A bot's resource hand and dev cards never leak to other clients (projection unchanged); bot actions appear in the narration event log like humans'.
- [ ] Server (integration) test: a game seated entirely with bots runs through setup and many turns without stalling, handling a rolled 7 (discard + robber) automatically, and the driver terminates each pass.

## Blocked by

- [0016 — Bots in the lobby](0016-bots-in-the-lobby.md)
