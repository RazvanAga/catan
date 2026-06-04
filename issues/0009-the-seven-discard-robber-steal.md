---
title: The 7 — discard, move robber, steal
status: ready
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

## Acceptance criteria

- [ ] A roll of 7 enters a `DISCARD` sub-state; every player with >7 cards must discard half (rounded down).
- [ ] Play proceeds only after all required discards are submitted.
- [ ] The active player must move the robber to a different tile.
- [ ] The active player steals one card, chosen randomly by the server, from a player adjacent to the robber's new tile (if any).
- [ ] A tile occupied by the robber produces no resources on subsequent rolls.
- [ ] The steal and robber move surface via the event log; the stolen card is not revealed beyond the two involved players' views as appropriate.
- [ ] Reducer tests cover multi-player discard math, robber-move legality, the random steal (outcome injected), and robber production-blocking.

## Blocked by

- issues/0005-roll-resource-production-end-turn.md
