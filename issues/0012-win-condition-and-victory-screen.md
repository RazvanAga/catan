---
title: Win condition & victory screen
status: done
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Win condition & victory screen

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The end-of-game determination. The reducer computes each player's full victory-point total
from all sources — settlements, cities, Longest Road, Largest Army, and hidden
victory-point development cards. When the active player reaches 10 victory points on their
turn, the game ends immediately: the room transitions to `ENDED` and all players see a
victory screen naming the winner. Hidden VP cards count toward the threshold and are
revealed at the win.

## Acceptance criteria

- [x] Full VP tally combines settlements, cities, Longest Road, Largest Army, and hidden VP dev cards.
- [x] Reaching 10 VP (including hidden VP cards) on the active player's turn ends the game immediately.
- [x] The room transitions to `ENDED` and a victory screen naming the winner is shown to all players.
- [x] Hidden VP cards are revealed upon the win.
- [x] Public VP display reflects all public sources during play.
- [x] Reducer tests cover winning via mixed VP sources, including a hidden-VP-card-triggered win.

## Blocked by

- issues/0010-development-cards.md
- issues/0011-longest-road-bonus.md
