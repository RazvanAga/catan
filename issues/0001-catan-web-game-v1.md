---
title: Catan Web Game — v1
status: ready
labels: [ready-for-agent]
created: 2026-06-04
---

# Catan Web Game — v1

## Problem Statement

I want to play the board game Catan online with a small group of friends, from our
own browsers, without buying seats on a commercial site like colonist.io or sharing a
single screen. There is no existing codebase — this is a greenfield project. I need a
web-based, real-time, multiplayer implementation of base-game Catan that my friends and
I can reach over the internet (I host it on my own VPS), where each of us controls our
own player from our own device, our hidden cards stay hidden, and the rules are enforced
for us so nobody has to adjudicate or can cheat.

## Solution

A TypeScript web application that serves one shared game room. A host opens the app,
shares a link, and 2–3 friends join, each entering a display name and picking a color.
The first person to join is the room owner and starts the game once at least 3 players
are present (max 4). The game then runs full base-game Catan — setup snake-draft, dice
rolls, resource production, building roads/settlements/cities, the robber, development
cards, bank/port/player trading, longest road, largest army — entirely server-enforced,
until someone reaches 10 victory points. Each player sees the public board plus only
their own private hand; opponents' hands appear as counts and their dev/victory-point
cards stay hidden. When the game ends, a victory screen appears and the owner can start
a fresh game with the same people, with the previous winner wearing a crown.

The system is intentionally small: one in-memory room, no accounts, no database, no
horizontal scaling. It runs as a single persistent Node process locally for development
and on a Hetzner VPS for play.

## User Stories

### Joining, lobby, and identity

1. As a player, I want to open a shared link and reach the game directly, so that I don't need to install anything or create an account.
2. As a player, I want to enter a display name when I join, so that others can recognize me.
3. As a player, I want to pick a color when I join, so that my pieces are visually distinct on the board.
4. As a player, I want to be prevented from picking a color another player already took, so that pieces are never ambiguous.
5. As the first player to join, I want to be the room owner, so that there is a single person who controls starting and resetting the game.
6. As a player in the lobby, I want to see who else has joined and their chosen names/colors, so that I know we're all present before starting.
7. As the owner, I want the "Start game" button to be disabled until at least 3 players are present, so that I can't start an unplayable game.
8. As the owner, I want to be prevented from seating more than 4 players, so that the game stays within base-game limits.
9. As the owner, I want to press "Start game" when everyone is ready, so that the game begins for all players at once.
10. As a player, I want to be issued a session token when I join, so that I can be recognized as the same player if my connection drops and I return.
11. As a person opening the link while a game is already in progress, I want to see a clear "game in progress" message, so that I understand I can't join right now.

### Setup phase

12. As a player, I want the game to begin with the standard snake-draft setup, so that initial placement follows real Catan rules.
13. As a player, I want to place my first settlement on a legal vertex during setup, so that I establish my starting position.
14. As a player, I want to place a road adjacent to my just-placed settlement during setup, so that my road network starts connected.
15. As a player, I want the placement order to reverse for the second round of setup, so that turn-order advantage is balanced.
16. As a player, I want my second settlement to immediately grant me one resource per adjacent producing tile, so that I start the main game with cards as per the rules.
17. As a player, I want only legal setup placements to be offered/accepted, so that I can't place illegally and nobody has to correct me.

### Turn flow

18. As the active player, I want to roll the dice as the first action of my turn, so that resource production happens.
19. As any player, I want to receive resources from tiles matching the dice roll that are adjacent to my settlements/cities, so that production is automatic and correct.
20. As any player, I want a city to yield two of its resource where a settlement yields one, so that upgrades matter.
21. As the active player, after rolling (a non-7), I want to freely trade and build in any order and repeatedly until I end my turn, so that play matches real Catan flexibility.
22. As the active player, I want to end my turn explicitly, so that play passes to the next player only when I'm done.
23. As a player, I want the current phase and whose turn it is to be unambiguous, so that I always know what I'm allowed to do.

### The robber and the 7

24. As any player holding more than 7 cards when a 7 is rolled, I want to be required to discard half (rounded down), so that the robber penalty is enforced.
25. As multiple players who must discard, I want our discards collected before play continues, so that the rule resolves correctly regardless of order.
26. As the active player who rolled a 7 (or played a knight), I want to move the robber to a new tile, so that I can block production there.
27. As the active player moving the robber, I want to steal one random card from a player with a settlement/city adjacent to the robber's new tile, so that the theft follows the rules.
28. As a player robbed, I want the stolen card chosen randomly by the server, so that the theft can't be gamed.

### Building

29. As the active player, I want to build a road for its resource cost on a legal edge connected to my network, so that I can expand.
30. As the active player, I want to build a settlement for its cost on a legal vertex (respecting the distance rule and connectivity), so that I can grow and score.
31. As the active player, I want to upgrade a settlement of mine to a city for its cost, so that I increase production and score.
32. As the active player, I want unaffordable or illegal builds to be prevented, so that I can't break the rules.
33. As a player, I want to see which vertices/edges are legal for me to build on right now, so that I can decide quickly without trial and error.
34. As a player, I want unaffordable build options greyed out, so that I understand why I can't act.

### Trading

35. As the active player, I want to trade resources with the bank at 4:1, so that I can convert surplus.
36. As the active player with a settlement on a generic (3:1) port, I want the better bank ratio applied, so that ports are worthwhile.
37. As the active player with a settlement on a specific (2:1) port, I want the 2:1 ratio applied for that resource, so that specific ports matter.
38. As the active player, I want to propose a player trade specifying what I give and what I want, so that I can negotiate with others.
39. As a non-active player, I want to see a trade proposal and accept or decline it, so that I can participate in trades on others' turns.
40. As the proposing active player, I want to see who accepted and confirm a trade with exactly one of them, so that the trade resolves with a single partner.
41. As the active player, I want to cancel a proposal, so that I'm not stuck if terms aren't met.
42. As a player, I want a trade proposal to reveal only the offered/requested quantities and not anyone's full hand, so that hidden information stays hidden.
43. As players, we want trading only allowed on the active player's turn after the roll, so that trade timing follows the rules.

### Development cards

44. As the active player, I want to buy a development card for its cost during my actions, so that I can pursue knights, progress, and victory-point cards.
45. As a player, I want my development cards kept hidden from opponents, so that my plans and hidden VPs aren't exposed.
46. As the active player, I want to play at most one development card per turn, so that the rule is enforced.
47. As the active player, I want to be prevented from playing a development card I bought on the same turn, so that the rule is enforced.
48. As the active player, I want to play a knight (before or after rolling) to move the robber and steal, so that knights function correctly.
49. As the active player, I want playing knights to count toward Largest Army, so that the bonus can be earned.
50. As the active player, I want to play progress cards (e.g. road building, year of plenty, monopoly) with their effects, so that the deck plays correctly.
51. As a player holding victory-point development cards, I want them counted toward my total but hidden until I win, so that hidden VPs work as designed.

### Scoring and winning

52. As a player, I want my public victory points (settlements, cities, longest road, largest army) visible, so that everyone can track the race.
53. As players, we want Longest Road awarded to the player with the longest continuous road of length ≥ 5, and reassigned when surpassed or broken, so that the bonus is correct.
54. As players, we want Largest Army awarded to the first player with ≥ 3 knights played, and reassigned when surpassed, so that the bonus is correct.
55. As the player who reaches 10 victory points (including hidden VP cards) on my turn, I want the game to immediately end and declare me the winner, so that the game concludes correctly.
56. As all players, we want a victory screen naming the winner, so that the result is clear.

### Post-game and replay

57. As the owner, I want a "New game" button on the victory screen, so that we can play again immediately.
58. As a returning player, I want the same people kept seated for the new game, so that we don't have to re-lobby.
59. As the previous game's winner, I want to wear a crown in the next game, so that bragging rights carry over.

### Disconnection and reconnection

60. As a player whose connection drops while it isn't my turn, I want play to continue without me blocking it, so that I don't ruin the game by lagging.
61. As a player who dropped, I want to reclaim my exact seat (with my cards and pieces) using my session token when I return, so that I lose no progress.
62. As players, when a dropped player's input is required (their turn, a required discard), we want the game to wait with a clear "waiting for X" banner, so that we understand the pause.
63. As players, when a player has been disconnected for 2 minutes, we want their seat to become vacant and claimable by anyone (the original returning, or a newcomer via the link), so that a permanently-gone player doesn't freeze the game forever.
64. As a newcomer who claims a vacant seat, I want to continue that player's position (their board pieces and hand), so that the game state stays coherent.
65. As players, when a vacant seat's turn comes up and nobody has claimed it, we want that turn auto-skipped, so that play continues.

### Anti-cheat / information integrity

66. As a player, I want only my own hand sent to my client in full, so that opponents can't inspect my cards by reading network traffic.
67. As a player, I want opponents' hands represented to me only as counts, so that hidden information is preserved.
68. As a player, I want every action I attempt re-validated by the server, so that a tampered client can't make illegal moves.
69. As a player, I want all randomness (dice, deck shuffle, theft) generated by the server, so that no client can influence or predict outcomes.

### Feedback / narration

70. As a player, I want to see narration of what just happened (who rolled what, who built, who stole from whom, who played a knight, who won), so that I can follow the game.
71. As a player, I want dice rolls and similar events surfaced as transient notifications/animations, so that the game feels alive rather than static.

## Implementation Decisions

**Repository structure.** A TypeScript monorepo using pnpm/npm workspaces (no Turborepo) with three packages:
- `shared/` — pure game types, the rules engine (pure reducer), the per-player view projector, and the frozen board topology graph.
- `server/` — Node + Socket.IO authoritative server holding the single in-memory room; owns all RNG.
- `client/` — Vite + React app with an SVG board; imports `shared/` for UX affordances only.

**Hosting / runtime.** Single persistent Node process. Local for development; Hetzner VPS for play, behind a reverse proxy (Caddy/nginx) terminating TLS so the socket runs over `wss://`. Explicitly **not** using serverless, Redis, Colyseus, or any horizontal scaling — the single in-memory room mandates exactly one instance.

**Scope.** Base game only, 3–4 players. No expansions and no 5–6 player extension. The board graph is data-driven (not hardcoded to assume exactly 19 tiles in algorithms) but expansion content is not built.

**Identity & room model.** Anonymous players, no accounts and no database. On join, the server issues a session token (stored client-side) that uniquely identifies a seat across reconnects. Exactly one singleton room exists in server memory. Room lifecycle is a state machine: `LOBBY → IN_GAME → ENDED → (LOBBY on New game)`. First player to join is the owner; ownership grants Start and New-game control. Cross-game state retained in memory: the previous winner (for the crown). Server restart discards the room — accepted.

**Board model.** A precomputed static topology graph is the single source of truth for both rules and rendering: 54 vertices, 72 edges, vertex/edge adjacency lists, tile→corner mappings, port vertex assignments, and SVG pixel coordinates. The graph is generated once offline (hex math run once), verified against a real board, then frozen as a TypeScript constant/asset. At game start, only the variable content is randomized on top of the fixed topology: tile resource types, number tokens, robber starting tile, and port resource assignments.

**Rules engine — pure reducer.** The core is a pure function `reduce(state, action) → { state, events }`:
- Immutable: returns the next state plus the list of event-log entries the action produced.
- Deterministic: contains no randomness. All nondeterministic outcomes (dice results, dev-card deck order, stolen-card selection) are produced by the server and passed *into* the reducer as fields on the action, e.g. `{ type: 'ROLL', dice: [3, 4] }`.
- Runs in both `shared/` consumers: server-side as the authority, client-side only to compute UX affordances (legal-move highlighting, affordability, pre-validation). The client is never trusted.

**Turn state machine.** A distinct `SETUP` phase models the snake draft (place settlement + adjacent road; reverse order on round two; second settlement grants adjacent resources). The main per-turn loop:

```
START_TURN
  → MUST_ROLL                        # only roll (or play a dev card) legal here
      → if 7: DISCARD (collect required discards from all over-7 holders)
              → MOVE_ROBBER → STEAL
      → else: distribute resources
  → ACTIONS                          # repeatable, any order:
                                     #   build road/settlement/city,
                                     #   bank/port trade, propose/confirm player trade,
                                     #   buy dev card, play dev card
  → END_TURN → next player's START_TURN
```
(Shape captured from the design discussion.) Dev-card play is a cross-phase action legal in both `MUST_ROLL` and `ACTIONS`, gated by two per-turn flags: "at most one dev card played this turn" and "not a card bought this turn."

**Trading.** Bank (4:1) and port (3:1 generic / 2:1 specific, gated on the player owning the matching port vertex) are player↔server and deterministic. Player↔player trades are active-player-initiated only and only in `ACTIONS`: the proposer specifies give/want sets; other players Accept or Decline; the proposer confirms exactly one accepter or cancels. No counter-offers in v1. Trade proposals expose only offered/requested quantities, never full hands. Player trades never hard-block on disconnects (a missing player simply never responds).

**State sync & transport.** Socket.IO. After any state change the server sends each connected player a full **personalized snapshot** (not deltas): the complete public board state plus that player's own full hand and dev cards, plus only counts/backs for opponents' private cards. This personalized projection is the anti-cheat boundary, implemented as a pure `projectStateForPlayer(state, playerId) → view`. Alongside snapshots, the server emits a lightweight append-only **event log** for narration/animations (rolls, builds, steals, knight plays, win). The client renders from the snapshot and uses the event log for transient toasts/animations.

**Authority & RNG.** The server is the sole authority and re-validates every received intent against the rules engine before applying it. All randomness is server-side only.

**Disconnection & seat lifecycle.** Per seat: connected / disconnected / vacant.
- Disconnect when not blocking: play continues; seat greyed; reclaimable by token.
- Disconnect when input is required (their turn, or owed a discard): the game waits with a "waiting for X" banner; no auto-resolution.
- After 2 minutes disconnected: seat transitions to vacant and becomes claimable by anyone (original via token, or a newcomer via the link). A claimer inherits the seat's full position. A vacant, unclaimed seat auto-skips its turn.

**Default tech choices.** Vitest for tests; Zustand for client state; no in-game chat in v1.

## Testing Decisions

Good tests here verify **external behavior, not implementation details**: given an input state and an action (or a sequence), assert the resulting observable state and emitted events — not internal data structures or private helpers. Because RNG is injected as action data, rule tests are fully deterministic and need no mocking of randomness, no server, no socket, and no browser.

Seams to test (highest first):

1. **The pure reducer in `shared/` (primary seam).** `reduce(state, action) → { state, events }` carries the overwhelming majority of behavior and gets the overwhelming majority of tests:
   - Setup snake-draft: order, reversal, second-settlement resource grant, legal/illegal placement.
   - Roll → production: correct resources to correct players; city = 2, settlement = 1; robber-blocked tiles produce nothing.
   - The 7: discard requirement (>7, half rounded down) across multiple holders; robber move legality; random steal (steal outcome supplied via action).
   - Building: road/settlement/city cost, distance rule, connectivity, affordability, illegality rejection.
   - Trading: bank 4:1, port 3:1/2:1 (port ownership gating), player-trade propose/accept/confirm/cancel, no-counter rule, turn/phase gating.
   - Dev cards: buy, hidden, one-per-turn, not-bought-this-turn, knight (robber+steal), progress cards, hidden VP counting.
   - Scoring/win: Longest Road (≥5, surpass, break/reassign), Largest Army (≥3, surpass), 10-VP immediate win including hidden VP cards.
   - Phase gating: actions rejected in the wrong phase.

2. **The board-graph generator/asset (be paranoid here).** Assert the frozen topology against known-correct expectations: 54 vertices, 72 edges, adjacency lists, tile→corner maps, port vertices, and pixel coordinates. This is the highest-risk artifact because everything downstream reads from it; verify it hard before freezing.

3. **The per-player view projector.** `projectStateForPlayer(state, playerId) → view`: assert the requesting player's own hand/dev cards are full, opponents' private cards appear only as counts/backs, hidden VP cards are not leaked, and public board state is complete. This pins the anti-cheat boundary.

4. **The Socket.IO server (lighter, integration).** Drive the server with intent messages and assert broadcasts. Reserved for behavior that only exists at the connection level and cannot be expressed as `(state, action) → state`: session-token seat reclaim, the 2-minute vacancy → takeover, auto-skip of a vacant seat's turn, and waiting-on-disconnected-player banners. Kept thin; rule correctness is not tested here.

Prior art: none — greenfield repo. The reducer tests should be established as the canonical test style for the project (pure input/output assertions), to be mirrored by later work.

## Out of Scope

- Expansions (Seafarers, Cities & Knights) and the 5–6 player extension.
- User accounts, authentication, profiles, persistent stats, match history, or any database.
- Multiple concurrent rooms, matchmaking, lobby browser, or room IDs.
- Spectating a game in progress.
- Counter-offers in player trades.
- Bot/AI opponents or bot takeover of abandoned seats.
- In-game chat.
- Persisting an in-progress game across server restarts.
- Horizontal scaling, Redis, Colyseus, serverless deployment.
- PixiJS/WebGL rendering (SVG only for v1; PixiJS is a noted future escape hatch for animation polish).
- Mobile-specific/responsive optimization beyond what falls out naturally.

## Further Notes

- The internal consistency of the design is load-bearing: the single in-memory room justifies VPS-not-serverless hosting, which justifies dropping Colyseus/Redis; the secret-hand requirement drives per-player snapshots and server-only RNG; the pure-reducer + shared-rules choices make client affordances and deterministic tests both fall out for free. Changing one of these (e.g. adding multiple rooms, or accounts) should trigger re-examination of the others.
- Highest-risk implementation area: the board topology graph generator. A subtle adjacency or tile→corner error surfaces as confusing bugs much later. Generate once, verify against a physical board, then freeze.
- Reference: colonist.io runs PixiJS + Node/Express/TypeScript + TypeORM/Redis on DigitalOcean — but that infra exists for thousands of concurrent games and is deliberately not emulated here. A public write-up of cheating-by-reading-client-data reinforces the per-player-projection + server-authority decisions.
- Suggested build order: `shared/` board graph + coordinates + tests → static board render → setup phase → main turn loop (roll/distribute/build) → trading → robber/dev cards → lobby/reconnect/seat-takeover polish.
