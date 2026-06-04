---
title: Bank & port trading
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Bank & port trading

## Parent

issues/0001-catan-web-game-v1.md

## What to build

Deterministic player↔bank trading during the `ACTIONS` phase. The active player can trade
4 identical resources for any 1 with the bank. If the player has a settlement/city on a
generic 3:1 port, that ratio applies; if on a specific 2:1 port, the 2:1 ratio applies for
that port's resource. Port eligibility is derived from the player's pieces on port
vertices in the frozen board graph. The reducer enforces ratios and rejects trades the
player can't afford.

## Acceptance criteria

- [ ] The active player can trade 4:1 with the bank for any chosen resource.
- [ ] A player with a generic port (settlement/city on a 3:1 port vertex) gets the 3:1 ratio.
- [ ] A player with a specific port gets the 2:1 ratio for that port's resource only.
- [ ] The best applicable ratio is used; the server re-validates port ownership against the board graph.
- [ ] Bank/port trades are legal only in the `ACTIONS` phase.
- [ ] Reducer tests cover 4:1, 3:1 (with/without port), and 2:1 specific-port trades, plus rejection when unaffordable.

## Blocked by

- issues/0006-building-roads-settlements-cities.md
