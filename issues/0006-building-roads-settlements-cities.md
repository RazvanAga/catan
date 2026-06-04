---
title: Building roads, settlements, and cities
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Building roads, settlements, and cities

## Parent

issues/0001-catan-web-game-v1.md

## What to build

Building during the `ACTIONS` phase. The active player can build a road, a settlement, or
upgrade one of their settlements to a city, each for its resource cost. Roads must connect
to the player's existing network; settlements must satisfy the distance rule and
connectivity; cities can only replace the player's own settlements. Costs are deducted and
illegal/unaffordable builds are rejected by the reducer and re-validated server-side. The
client highlights currently-legal build locations for the active player and greys out
unaffordable build options. Victory points from settlements (1) and cities (2) are tracked
and shown publicly.

## Acceptance criteria

- [ ] The active player can build a road on a legal, network-connected edge for its cost.
- [ ] The active player can build a settlement on a legal vertex (distance rule + connectivity) for its cost.
- [ ] The active player can upgrade one of their own settlements to a city for its cost.
- [ ] Resource costs are deducted; unaffordable or illegal builds are rejected.
- [ ] The client highlights legal build locations for the active player and greys out unaffordable options.
- [ ] Public victory points reflect settlements (1) and cities (2) and are visible to all players.
- [ ] Builds are legal only in the `ACTIONS` phase and can be interleaved freely with other actions.
- [ ] Reducer tests cover cost deduction, distance/connectivity enforcement, city-upgrade legality, and VP updates.

## Blocked by

- issues/0005-roll-resource-production-end-turn.md
