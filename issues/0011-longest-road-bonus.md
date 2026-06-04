---
title: Longest Road bonus
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Longest Road bonus

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The Longest Road bonus. The reducer computes each player's longest continuous road as a
graph longest-path over the player's roads in the board graph. The bonus (+2 VP) is
awarded to the first player to reach a continuous road of length ≥ 5, transferred when
another player strictly surpasses the current holder, and re-evaluated when a road network
is broken (e.g. by an opponent's settlement splitting it). The current holder is shown
publicly.

## Acceptance criteria

- [ ] Each player's longest continuous road length is computed correctly over their road network in the board graph.
- [ ] Longest Road (+2 VP) is awarded to the first player reaching length ≥ 5.
- [ ] The bonus transfers only when another player strictly exceeds the current holder's length.
- [ ] Breaking a player's road network (e.g. an opponent settlement splitting it) re-evaluates and can revoke/transfer the bonus.
- [ ] The current Longest Road holder is shown publicly.
- [ ] Reducer tests cover branching/looping road shapes, the ≥5 threshold, surpass-to-transfer, and break-to-revoke.

## Blocked by

- issues/0006-building-roads-settlements-cities.md
