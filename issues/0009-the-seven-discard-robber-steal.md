---
title: The 7 — discard, move robber, steal
status: done
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# The 7 — discard, move robber, steal

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The full consequences of rolling a 7. On a 7, the turn enters a `DISCARD` sub-state that
collects required discards from every player holding more than 7 cards (each must discard
half, rounded down) before play proceeds. Then the active player moves the robber to a new
tile and steals one random card (server-generated selection) from a player with a
settlement/city adjacent to the robber's new tile. The robber blocks production on its
tile (refining the production step so a robbed tile yields nothing). The `DISCARD`
sub-state collects from multiple players and proceeds once all required discards are in.

The `DISCARD` and `MOVE_ROBBER` `TurnPhase` values already exist in
`shared/src/types.ts`; this issue gives them behavior.

## Design notes — explicit pending obligations (seat-driver readiness)

This is the first sub-state where **non-active players owe an action simultaneously**.
Model "who still owes a discard, and how much" as **explicit data in `GameState`**, not
as something re-derived from hand sizes on the fly. Mirror the existing
`TradeProposal.responses: Record<string, TradeResponse>` pattern (issue 0008): add a
`discard` field on `GameState` (e.g. a `Record<playerId, requiredCount>` of outstanding
discarders, cleared as each submits, with the phase advancing to `MOVE_ROBBER` when the
record is empty). Snapshot it back to `null` once resolved, like `trade`.

Rationale: keeping pending obligations explicit means a future **seat driver** — a human
UI prompt *or* a bot — can answer "what does this seat owe right now?" with a state lookup
instead of re-running rules. Same reason the validation belongs in reusable, queryable form
rather than buried only inside `reduce`'s asserts. Do **not** build any bot code here; just
keep the obligation state explicit. (See `memory/catan-v1-design.md` and the
seat↔socket-decoupling note.)

## Acceptance criteria

- [x] A roll of 7 enters a `DISCARD` sub-state; every player with >7 cards must discard half (rounded down).
- [x] Outstanding discard obligations are held as explicit state on `GameState` (per-player required counts), cleared as each submits — not re-derived ad hoc.
- [x] A player not owing a discard cannot submit one; a player owing one must discard exactly the required count of legally-held resources.
- [x] Play proceeds only after all required discards are submitted (phase advances to `MOVE_ROBBER` when the obligation record is empty).
- [x] The active player must move the robber to a different tile.
- [x] The active player steals one card, chosen randomly by the server, from a player adjacent to the robber's new tile (if any).
- [x] A tile occupied by the robber produces no resources on subsequent rolls.
- [x] The steal and robber move surface via the event log; the stolen card is not revealed beyond the two involved players' views as appropriate.
- [x] Reducer tests cover multi-player discard math, robber-move legality, the random steal (outcome injected), and robber production-blocking.

## Blocked by

- issues/0005-roll-resource-production-end-turn.md
