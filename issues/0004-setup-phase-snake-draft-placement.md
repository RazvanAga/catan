---
title: Setup phase — snake-draft placement
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Setup phase — snake-draft placement

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The `SETUP` phase: the standard snake-draft initial placement. In seating order each
player places one settlement on a legal vertex and one road on an adjacent edge; then in
reverse order each places a second settlement + adjacent road. The second settlement
immediately grants its owner one resource per adjacent producing tile. The client
highlights legal placements for the active player, renders placed pieces in player colors,
and shows the active player's own hand (which begins to fill from the second-settlement
grant). Placement legality (distance rule for settlements, road-adjacency) is enforced by
the reducer and re-validated server-side.

## Acceptance criteria

- [ ] The game enters a distinct `SETUP` phase after start.
- [ ] Players place settlement + adjacent road in seating order, then again in reverse order.
- [ ] Settlement placement enforces the distance rule; road placement enforces adjacency to the just-placed settlement.
- [ ] The second settlement grants one resource per adjacent producing tile to its owner.
- [ ] Illegal placements are rejected by the server.
- [ ] The client highlights legal vertices/edges for the active player and renders placed pieces in player colors.
- [ ] The active player sees their own hand; it reflects the second-settlement resource grant.
- [ ] After setup completes, the game advances to the first player's main turn.
- [ ] Reducer tests cover order/reversal, legal/illegal placement, and the second-settlement resource grant.

## Blocked by

- issues/0003-board-topology-graph-and-static-svg-board.md
