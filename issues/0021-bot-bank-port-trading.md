---
title: Bot bank/port trading to unblock a build (optional)
status: ready
labels: [ready-for-agent]
created: 2026-06-08
---

# Bot bank/port trading to unblock a build (optional)

## Parent

[0015 — Catan v2: AI bot players](0015-catan-v2-ai-bot-players.md)

## What to build

Optional / deferrable polish (PRD story 35). On its own turn, let the bot use
bank/port trading to convert a surplus resource into one it is short of, when doing
so unblocks a build it wants on this turn. Extend `decideBotMove`'s ACTIONS ladder
so that, before ending the turn, if the bot is one resource short of a desired build
and holds enough of a surplus resource to trade for it at its best available ratio
(2:1 specific port, 3:1 generic port, else 4:1), it returns a `TRADE_BANK` move and
then proceeds to build on a subsequent call.

This is intentionally conservative: trade only to enable a concrete build the bot
would make this turn, never speculative conversion. It must not introduce a loop
(trade → still can't build → trade again forever); the guard and a "trade at most
toward one build per turn" rule keep it bounded.

## Acceptance criteria

- [ ] The bot returns a `TRADE_BANK` move only when it unblocks a concrete build it will make this turn, using its best available ratio (port-aware).
- [ ] The bot never trades into a state it can't act on, and never loops (bounded — trading toward a build terminates at the build or END_TURN).
- [ ] Bank/port ratio is computed from the bot's owned ports, matching the existing trade rules.
- [ ] Policy tests cover: trades to enable an affordable-after-trade build; uses 2:1/3:1 when the bot owns the port; does not trade speculatively; terminates.
- [ ] Server (integration) test: a bot one resource short of a build trades with the bank and then builds, all within one turn, without stalling.

## Blocked by

- [0018 — Bot building & dev-card buying](0018-bot-building-and-buying.md)
