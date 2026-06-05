---
title: Post-game replay & crown
status: done
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Post-game replay & crown

## Parent

issues/0001-catan-web-game-v1.md

## What to build

Replaying with the same group. On the victory screen, the owner has a "New game" button
that resets the room back to `LOBBY` (then a fresh game) while keeping the same players
seated with their names and colors. The previous game's winner is remembered in memory and
wears a crown in the next game. This cross-game memory survives a "New game" but not a
server restart.

## Acceptance criteria

- [x] The victory screen shows an owner-only "New game" button.
- [x] "New game" resets room state for a fresh game while keeping the same players seated (names + colors retained).
- [x] The previous game's winner is marked with a crown in the next game.
- [x] The crown / last-winner memory persists across "New game" but is lost on server restart.
- [x] Tests cover the reset-and-reseat transition and crown assignment to the prior winner.

## Blocked by

- issues/0012-win-condition-and-victory-screen.md
