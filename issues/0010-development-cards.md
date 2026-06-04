---
title: Development cards
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Development cards

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The full development-card system. The active player can buy a dev card for its cost; the
deck order is determined by a server-side shuffle (passed into the reducer as action
data), and bought cards stay hidden from opponents. A player may play at most one dev card
per turn, and may not play a card bought on the same turn; dev-card play is legal both in
`MUST_ROLL` (before rolling) and in `ACTIONS`. Card effects: Knight (move robber + steal,
reusing the robber/steal logic) and counts toward Largest Army (first to 3 knights played
gets +2 VP, reassigned when surpassed); progress cards (road building, year of plenty,
monopoly) with their effects; victory-point cards counted toward the holder's total but
hidden from opponents until they win.

## Acceptance criteria

- [ ] The active player can buy a dev card for its cost; the deck order comes from a server-side shuffle and the card is hidden from opponents.
- [ ] At most one dev card can be played per turn; a card bought this turn cannot be played this turn.
- [ ] Dev-card play is legal in both `MUST_ROLL` and `ACTIONS`.
- [ ] Playing a Knight moves the robber and steals (reusing the robber/steal logic) and counts toward Largest Army.
- [ ] Largest Army (+2 VP) is awarded at 3 knights played and reassigned when surpassed.
- [ ] Road Building, Year of Plenty, and Monopoly produce their correct effects.
- [ ] Victory-point dev cards count toward the holder's total but are hidden from opponents (visible only in the holder's own snapshot until a win).
- [ ] Reducer tests cover buy/hidden, the one-per-turn and not-bought-this-turn guards, each card effect, and Largest Army award/reassignment.

## Blocked by

- issues/0009-the-seven-discard-robber-steal.md
