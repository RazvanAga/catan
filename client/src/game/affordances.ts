/**
 * Client-side legality helpers for UX affordances only (highlighting). The
 * server re-validates every action; these never grant authority. They read the
 * same frozen `BOARD` topology the server uses, so highlights match the rules.
 */

import {
  BOARD,
  BUILD_COSTS,
  GameView,
  PortType,
  Resource,
  ResourceCounts,
  canAfford,
  edgeConnectsToNetwork,
} from '@catan/shared';

/** Vertices where the current player may place a setup settlement (distance rule). */
export function legalSetupSettlements(view: GameView): Set<number> {
  const out = new Set<number>();
  const board = view.board;
  if (!board) return out;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (board.buildings[v]) continue;
    if (BOARD.vertices[v].vertices.every((n) => !board.buildings[n])) out.add(v);
  }
  return out;
}

/** Free edges incident to the just-placed setup settlement. */
export function legalSetupRoads(view: GameView): Set<number> {
  const out = new Set<number>();
  const board = view.board;
  const setup = view.setup;
  if (!board || !setup || setup.pending !== 'road' || setup.lastSettlement == null) return out;
  for (const e of BOARD.vertices[setup.lastSettlement].edges) {
    if (!board.roads[e]) out.add(e);
  }
  return out;
}

/** True when the requesting player is the one who must act right now. */
export function isMyTurn(view: GameView): boolean {
  return view.youId != null && view.turn?.currentPlayerId === view.youId;
}

export type BuildKind = 'road' | 'settlement' | 'city';

/** Edges where the player may build a road (free + connected to their network). */
export function legalRoadEdges(view: GameView): Set<number> {
  const out = new Set<number>();
  const board = view.board;
  if (!board || !view.youId) return out;
  for (let e = 0; e < BOARD.edges.length; e++) {
    if (board.roads[e]) continue;
    if (edgeConnectsToNetwork(board, e, view.youId)) out.add(e);
  }
  return out;
}

/** Vertices where the player may build a settlement (distance rule + own road). */
export function legalSettlementVertices(view: GameView): Set<number> {
  const out = new Set<number>();
  const board = view.board;
  if (!board || !view.youId) return out;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (board.buildings[v]) continue;
    if (!BOARD.vertices[v].vertices.every((n) => !board.buildings[n])) continue;
    if (BOARD.vertices[v].edges.some((e) => board.roads[e]?.owner === view.youId)) out.add(v);
  }
  return out;
}

/** The player's own settlements that can be upgraded to cities. */
export function legalCityVertices(view: GameView): Set<number> {
  const out = new Set<number>();
  const board = view.board;
  if (!board || !view.youId) return out;
  for (const [vid, b] of Object.entries(board.buildings)) {
    if (b.owner === view.youId && !b.city) out.add(Number(vid));
  }
  return out;
}

/** Can the player currently afford the given build kind? */
export function canAffordBuild(view: GameView, kind: BuildKind): boolean {
  if (!view.you) return false;
  return canAfford(view.you.hand as ResourceCounts, BUILD_COSTS[kind]);
}

export function legalBuildTargets(view: GameView, kind: BuildKind): Set<number> {
  switch (kind) {
    case 'road':
      return legalRoadEdges(view);
    case 'settlement':
      return legalSettlementVertices(view);
    case 'city':
      return legalCityVertices(view);
  }
}

/** Port trade types the requesting player can access. */
export function playerPorts(view: GameView): Set<PortType> {
  const out = new Set<PortType>();
  const board = view.board;
  if (!board || !view.youId) return out;
  for (const port of BOARD.ports) {
    if (port.vertices.some((v) => board.buildings[v]?.owner === view.youId)) {
      out.add(board.setup.portTypes[port.id]);
    }
  }
  return out;
}

/** Best bank ratio for giving `give` (2 specific port, 3 generic, else 4). */
export function bankRatio(view: GameView, give: Resource): number {
  const ports = playerPorts(view);
  if (ports.has(give)) return 2;
  if (ports.has('3:1')) return 3;
  return 4;
}
