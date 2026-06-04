---
title: Roll → resource production → end turn
status: ready
type: AFK
labels: [ready-for-agent]
created: 2026-06-04
---

# Roll → resource production → end turn

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The main turn loop's spine: `MUST_ROLL → ACTIONS → END_TURN`. The active player rolls
the dice (the server generates the result and passes it into the reducer as action data),
and every player receives resources from tiles matching the roll that are adjacent to
their settlements (one each) and cities (two each). After rolling, the player is in the
`ACTIONS` phase whose only available action for now is "End turn", which passes play to
the next player. The dice result and resource gains surface as narration/animation via the
event log. A roll of 7 is handled as a no-production placeholder in this slice (the full
robber flow arrives in the robber slice).

## Acceptance criteria

- [ ] The active player can roll exactly once at the start of their turn; the server generates the dice result.
- [ ] All players receive correct resources for the rolled number: settlements yield 1, cities yield 2, per adjacent matching tile.
- [ ] After rolling, the active player is in `ACTIONS`; "End turn" passes play to the next player in order.
- [ ] A roll of 7 produces no resources this slice (placeholder; no robber yet) without breaking the loop.
- [ ] The dice result and resource distribution are surfaced via the event log as narration/animation.
- [ ] Each player's own updated hand is reflected in their snapshot; the current phase and active player are unambiguous on the client.
- [ ] Reducer tests cover production for settlements vs cities, multiple recipients from one roll, and turn advancement.

## Blocked by

- issues/0004-setup-phase-snake-draft-placement.md
