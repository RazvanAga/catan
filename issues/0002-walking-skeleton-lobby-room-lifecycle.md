---
title: Walking skeleton — lobby & room lifecycle
status: ready
type: HITL
labels: [ready-for-agent]
created: 2026-06-04
---

# Walking skeleton — lobby & room lifecycle

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The end-to-end skeleton that proves the entire pipe and establishes the project's
architecture. A player opens the app, is issued a session token, and joins the single
in-memory room by entering a display name and picking a color. The lobby roster updates
live for everyone as players join. The first joiner is the room owner. The owner sees a
"Start game" button that is enabled only with 3–4 players; pressing it transitions the
room from `LOBBY` to `IN_GAME` and moves everyone to a placeholder in-game screen.
Anyone opening the link while the room is `IN_GAME` sees a "game in progress" wall.

This slice sets the conventions the rest of the project mirrors: the monorepo layout
(`shared` / `server` / `client`), the Socket.IO message protocol, the pure reducer
signature `reduce(state, action) → { state, events }`, the per-player personalized
snapshot broadcast, the append-only event log, and the client state store. Because these
are architecture-defining, this slice is HITL: a human should review the established
shapes before downstream slices build on them.

From the design discussion, the reducer signature to establish:

```
reduce(state, action) → { state, events }   // pure, immutable, deterministic
projectStateForPlayer(state, playerId) → view   // per-player personalized snapshot
```

## Acceptance criteria

- [ ] A monorepo with `shared`, `server`, `client` workspaces builds and runs locally with one persistent server process.
- [ ] Opening the client connects over Socket.IO and receives a session token persisted client-side.
- [ ] A player can join the singleton room with a display name and a color; a color already taken is rejected.
- [ ] The lobby roster (names + colors + who is owner) updates live for all connected clients.
- [ ] The first player to join is the owner; the "Start game" control is owner-only.
- [ ] "Start game" is disabled below 3 players and cannot seat more than 4.
- [ ] Pressing "Start game" transitions the room `LOBBY → IN_GAME` and shows all players a placeholder in-game screen.
- [ ] Opening the link while the room is `IN_GAME` shows a "game in progress" wall (no join).
- [ ] State reaches clients as per-player personalized snapshots; a narration event log mechanism exists and is exercised by at least one event (e.g. "player joined").
- [ ] Reducer unit tests cover join, color-collision rejection, owner assignment, start gating, and the lobby→in-game transition.

## Blocked by

None - can start immediately.
