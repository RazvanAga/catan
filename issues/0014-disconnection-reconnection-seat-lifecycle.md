---
title: Disconnection, reconnection & seat lifecycle
status: done
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Disconnection, reconnection & seat lifecycle

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The connection-level seat lifecycle — the project's thin Socket.IO integration seam, the
behavior that cannot be expressed as `(state, action) → state`. Each seat is connected,
disconnected, or vacant. If a player disconnects when it is not their turn and they owe no
action, play continues; their seat is greyed and reclaimable via their session token. If a
disconnected player's input is required (their turn, or an owed discard), the game waits
with a "waiting for X" banner — no auto-resolution. After 2 minutes disconnected, the seat
becomes vacant and claimable by anyone (the original player returning via token, or a
newcomer via the link); whoever claims it inherits that seat's full position (pieces,
hand, dev cards). A vacant, unclaimed seat auto-skips its turn so play continues.

## Acceptance criteria

- [x] A player disconnecting when not blocking does not halt play; their seat is greyed and reclaimable via session token.
- [x] A returning player reclaims their exact seat (pieces, hand, dev cards) with their token.
- [x] When a disconnected player's input is required (their turn or an owed discard), the game waits with a "waiting for X" banner and does not auto-resolve.
- [x] After 2 minutes disconnected, the seat becomes vacant and claimable by anyone (original or newcomer).
- [x] A player claiming a vacant seat inherits that seat's full position.
- [x] A vacant, unclaimed seat's turn is auto-skipped so play continues.
- [x] Integration tests over the Socket.IO seam cover token reclaim, the 2-minute vacancy transition, takeover-inherits-position, and auto-skip of an unclaimed vacant seat.

## Blocked by

- issues/0005-roll-resource-production-end-turn.md
