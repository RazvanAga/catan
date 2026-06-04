---
title: Board topology graph + static SVG board
status: ready
type: HITL
labels: [ready-for-agent]
created: 2026-06-04
---

# Board topology graph + static SVG board

## Parent

issues/0001-catan-web-game-v1.md

## What to build

The precomputed static board topology — the single source of truth for both rules and
rendering — and the static board render. A one-off offline generator produces the fixed
base-game topology (54 vertices, 72 edges, vertex/edge adjacency lists, tile→corner
mappings, port vertex assignments, and SVG pixel coordinates), which is then frozen as a
TypeScript constant in `shared`. On "Start game", the server randomizes only the variable
content on top of the fixed topology — tile resource types, number tokens, robber start
tile, and port resource assignments — and includes it in the snapshot. The client renders
the board as SVG (hex tiles colored by resource, number tokens, ports, and the robber) on
the in-game screen.

This is the highest-risk artifact in the project: everything downstream (placement
legality, production, longest road, rendering) reads from this graph. HITL = a human
verifies the frozen graph against a real physical board before it is trusted.

## Acceptance criteria

- [ ] An offline generator produces the base-game topology; its output is frozen as a TS constant in `shared`.
- [ ] Verification tests assert 54 vertices, 72 edges, correct vertex/edge adjacency, tile→corner maps, port vertices, and pixel coordinates against known-correct expectations.
- [ ] On "Start game", the server randomizes tile resources, number tokens, robber start, and port assignments and includes the board in the personalized snapshot.
- [ ] The client renders an SVG board from the snapshot: tiles colored by resource, number tokens placed, ports shown, robber shown on its tile.
- [ ] The same frozen topology is used by both server logic and client rendering (one source of truth).
- [ ] A human has confirmed the rendered/generated board matches a real Catan board layout.

## Blocked by

- issues/0002-walking-skeleton-lobby-room-lifecycle.md
