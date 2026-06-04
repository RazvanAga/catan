# Catan (web, v1)

Real-time, server-authoritative base-game Catan for a small group of friends.
See [issues/0001-catan-web-game-v1.md](issues/0001-catan-web-game-v1.md) for the full v1 spec.

## Monorepo layout

npm workspaces, three packages:

- **`shared/`** — pure game types, the pure rules engine `reduce(state, action) → { state, events }`,
  the per-player view projector `projectStateForPlayer`, and the Socket.IO message protocol.
  This is the source of truth for game logic and is imported by both server and client.
- **`server/`** — Node + Socket.IO authoritative server holding the single in-memory room.
  Owns all RNG (none yet in the skeleton) and re-validates every intent through `reduce`.
- **`client/`** — Vite + React + Zustand app. Renders only from server snapshots; uses
  `shared` for UX affordances, never as an authority.

## Getting started

```bash
npm install            # installs all workspaces

npm test               # runs the shared reducer unit tests (Vitest)

npm run dev:server     # starts the Socket.IO server on http://localhost:3001
npm run dev:client     # starts the Vite client on http://localhost:5173
```

Run the server and client in two terminals, then open `http://localhost:5173`
in several browser tabs (each tab is a separate player, identified by a session
token stored in `localStorage`).

### Environment overrides

- Server: `PORT` (default `3001`), `CLIENT_ORIGIN` (default `http://localhost:5173`, for CORS).
- Client: `VITE_SERVER_URL` (default `http://localhost:3001`).

## Status

Implements **issue 0002 — walking skeleton (lobby & room lifecycle)**: join with
name + color, live lobby roster, owner-gated start (3–4 players), `LOBBY → IN_GAME`
transition, the "game in progress" wall, session tokens, per-player snapshots, and
an append-only event log. This slice is HITL — the established architecture
(reducer signature, projection boundary, message protocol, client store) is meant
to be reviewed before downstream slices build on it.
