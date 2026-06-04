---
title: Player-to-player trading
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Player-to-player trading

## Parent

issues/0001-catan-web-game-v1.md

## What to build

Active-player-initiated player↔player trading during the `ACTIONS` phase. The active
player proposes a trade specifying what they give and what they want. Every other player
sees the proposal (quantities of named resources only — never anyone's full hand) and can
Accept or Decline. The proposer then confirms the trade with exactly one accepter, or
cancels. No counter-offers in v1. The trade never hard-blocks on a disconnected player: a
missing player simply never responds, and the proposer can still confirm any available
accepter or cancel. Resources move only on confirmation, and only if both parties can
afford their side.

## Acceptance criteria

- [ ] Only the active player can initiate a trade, and only during the `ACTIONS` phase.
- [ ] The proposer specifies give/want resource sets; other players see only those quantities.
- [ ] Each non-active player can Accept or Decline the proposal.
- [ ] The proposer can confirm exactly one accepter (resources swap) or cancel the proposal.
- [ ] A disconnected/non-responding player does not block the proposal; the proposer can still confirm another accepter or cancel.
- [ ] Confirmation is rejected if either party can no longer afford their side.
- [ ] No full-hand information is leaked to any player at any point in the flow.
- [ ] Reducer tests cover propose/accept/decline/confirm/cancel and the non-blocking behavior.

## Blocked by

- issues/0006-building-roads-settlements-cities.md
