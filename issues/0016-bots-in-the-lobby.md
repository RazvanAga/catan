---
title: Bots in the lobby — add, remove, marker
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bots in the lobby — add, remove, marker

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

Let the room owner fill empty seats with bot players while in the lobby. The owner
gets an "Add bot" control that seats a computer player with an auto-generated name
("Bot 1", "Bot 2", …) and an available color; and a "Remove" control on each bot to
free its seat again. Bots appear in the lobby roster exactly like humans but with a
clear bot marker, and they count toward the 3-player minimum so the owner can start
a short-handed table. Bots do not act yet — this slice only establishes them as
seats; a game started with bots will wait when a bot's turn comes (driven in a later
slice).

A bot is modelled as a normal `Player` with a new `isBot: true` flag, `connected:
true`, `vacant: false`, no socket and no session token. Because it is just a seat,
every existing rule (start-game, setup order, projection, "New game" seat carry-
over) applies to it unchanged.

End-to-end this cuts: the `Player` type + reducer (`ADD_BOT` / `REMOVE_BOT`
actions), the projection (`isBot` on the player view), the socket protocol
(`addBot` / `removeBot` events) and server wiring, and the lobby UI.

## Acceptance criteria

- [ ] `Player` has an `isBot` boolean; humans joining via `JOIN` get `isBot: false`.
- [ ] `ADD_BOT` action: owner-only and LOBBY-only; rejected when the room is full (4 seats) or the chosen color is already taken; seats a `Player` with `isBot: true`, `connected: true`, `vacant: false`, empty hand/dev cards.
- [ ] Added bots get an available color automatically and an auto-generated unique display name.
- [ ] `REMOVE_BOT` action: owner-only and LOBBY-only; only a bot seat can be removed; humans cannot be removed this way.
- [ ] Non-owners cannot add or remove bots (server-gated, not just hidden in UI).
- [ ] Adding/removing bots is rejected once the game is no longer in LOBBY.
- [ ] `PlayerView` exposes `isBot` so clients can render the marker.
- [ ] `addBot` / `removeBot` socket events are wired through to the reducer and broadcast like other intents.
- [ ] Lobby UI: owner sees an "Add bot" button (disabled when the room is full) and a remove control on each bot; the roster shows each bot's name, color, and a bot marker; "Start game" enables once humans + bots reach the minimum.
- [ ] Bots are carried into a "New game" the same as humans (no re-adding needed).
- [ ] Reducer tests cover `ADD_BOT` / `REMOVE_BOT` gating, color-clash, room-full, isBot, and that only bots are removable — mirroring the existing lobby (`join` / `startGame`) tests.

## Blocked by

None — can start immediately.
