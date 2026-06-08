---
title: Bot responds to human trade proposals
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot responds to human trade proposals

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

When a human active player proposes a player-to-player trade, every bot at the
table must respond promptly so the proposal resolves without waiting. Extend
`decideBotMove` so that when the bot is a non-active player with an open trade
proposal it has not yet answered, it returns a `RESPOND_TRADE` move:

- **Accept** only if the bot can pay the requested `want` from its hand and the
  deal is non-losing by a simple count heuristic (e.g. it doesn't give away more
  cards than it receives, or it receives a resource it needs for a build).
- **Decline** otherwise.

The server driver already loops over bot seats that owe input; this slice adds
"a bot owes a trade response" as one of those cases during ACTIONS. Bots only
**respond** — they never initiate or counter a proposal in v2.

## Acceptance criteria

- [ ] When a trade proposal is open and a bot hasn't responded, `decideBotMove` returns a `RESPOND_TRADE` (accept/decline) for that bot.
- [ ] The bot accepts only when it can actually pay `want` and the trade is non-losing by the heuristic; otherwise it declines.
- [ ] The bot never returns an accept it cannot pay for (reducer would reject it).
- [ ] The bot never returns a `PROPOSE_TRADE` (bots do not initiate trades in v2).
- [ ] The server driver drives bot trade responses to completion so a human's proposal never hangs on a bot.
- [ ] Policy tests cover: accept when payable + beneficial; decline when unpayable; decline when losing; no proposal ever initiated.
- [ ] Server (integration) test: a human proposes a trade at a mixed table and all bots respond automatically.

## Blocked by

- [0017 — Bot turn loop + server driver](0017-bot-turn-loop-and-server-driver.md)
