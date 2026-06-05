/**
 * Shared, side-effect-free helpers used across the rule modules: player lookup,
 * immutable updates, resource arithmetic, and board-graph queries that read the
 * frozen topology (`BOARD`) together with the live `BoardState`.
 */

import { BOARD } from '../board/index.js';
import {
  BoardState,
  GameState,
  Player,
  Resource,
  ResourceCounts,
} from '../types.js';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new IllegalActionError(message);
}

export function getPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function requirePlayer(state: GameState, id: string): Player {
  const p = getPlayer(state, id);
  assert(p, 'Unknown player.');
  return p;
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.turnIndex];
  assert(p, 'No current player.');
  return p;
}

/** Return a new state with player `id` replaced by `fn(player)`. */
export function updatePlayer(
  state: GameState,
  id: string,
  fn: (p: Player) => Player,
): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? fn(p) : p)) };
}

// --- Resource arithmetic (all immutable) -------------------------------------

export function addResources(hand: ResourceCounts, delta: Partial<ResourceCounts>): ResourceCounts {
  const next = { ...hand };
  for (const [res, n] of Object.entries(delta) as [Resource, number][]) {
    next[res] += n;
  }
  return next;
}

export function handTotal(hand: ResourceCounts): number {
  return (Object.values(hand) as number[]).reduce((a, b) => a + b, 0);
}

export function canAfford(hand: ResourceCounts, cost: Partial<ResourceCounts>): boolean {
  return (Object.entries(cost) as [Resource, number][]).every(([res, n]) => hand[res] >= n);
}

/** Negate every entry of a cost, for spending. */
export function negate(cost: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  for (const [res, n] of Object.entries(cost) as [Resource, number][]) out[res] = -n;
  return out;
}

// --- Board-graph queries ------------------------------------------------------

/** Vertices one edge away from `vertex` (the distance-rule neighborhood). */
export function adjacentVertices(vertex: number): number[] {
  return BOARD.vertices[vertex].vertices;
}

/** Is the vertex empty AND all its neighbors empty (the settlement distance rule)? */
export function satisfiesDistanceRule(board: BoardState, vertex: number): boolean {
  if (board.buildings[vertex]) return false;
  return adjacentVertices(vertex).every((n) => !board.buildings[n]);
}

/** Does `player` have a road on an edge incident to `vertex`? */
export function hasRoadTouchingVertex(board: BoardState, vertex: number, player: string): boolean {
  return BOARD.vertices[vertex].edges.some((e) => board.roads[e]?.owner === player);
}

/** The two endpoint vertices of an edge. */
export function edgeEndpoints(edge: number): [number, number] {
  return BOARD.edges[edge].vertices;
}

/**
 * Players the active player may steal from when the robber lands on `tile`:
 * owners of a settlement/city on one of the tile's corners, excluding the active
 * player, who still hold at least one resource card. Order follows seating.
 */
export function robberVictims(state: GameState, tile: number, actorId: string): string[] {
  const board = state.board!;
  const owners = new Set<string>();
  for (const vid of BOARD.tiles[tile].vertices) {
    const building = board.buildings[vid];
    if (building && building.owner !== actorId) owners.add(building.owner);
  }
  return state.players
    .filter((p) => owners.has(p.id) && handTotal(p.hand) > 0)
    .map((p) => p.id);
}

/** Edges sharing a vertex with `edge`. */
export function adjacentEdges(edge: number): number[] {
  const [a, b] = edgeEndpoints(edge);
  const out = new Set<number>();
  for (const v of [a, b]) for (const e of BOARD.vertices[v].edges) if (e !== edge) out.add(e);
  return [...out];
}

/**
 * Is `edge` connected to `player`'s network — i.e. touches one of their roads,
 * or one of their settlements/cities? A road may not extend through a vertex
 * occupied by an opponent's building.
 */
export function edgeConnectsToNetwork(board: BoardState, edge: number, player: string): boolean {
  const [a, b] = edgeEndpoints(edge);
  for (const v of [a, b]) {
    const building = board.buildings[v];
    if (building?.owner === player) return true;
    if (building && building.owner !== player) continue; // can't pass through opponents
    // reachable via one of this player's roads incident to v
    if (BOARD.vertices[v].edges.some((e) => e !== edge && board.roads[e]?.owner === player)) {
      return true;
    }
  }
  return false;
}
