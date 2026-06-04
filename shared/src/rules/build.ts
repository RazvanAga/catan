/**
 * Building during the ACTIONS phase: roads, settlements, and city upgrades.
 * Each enforces placement legality (connectivity, the distance rule, owning the
 * settlement being upgraded), affordability, and per-player piece limits;
 * resources are deducted on success. Victory points fall out of `scoring.ts`
 * (settlements 1, cities 2), so they update automatically in the projection.
 */

import {
  Action,
  BUILD_COSTS,
  GameEvent,
  GameState,
  PIECE_LIMITS,
  ReduceResult,
} from '../types.js';
import {
  addResources,
  assert,
  canAfford,
  currentPlayer,
  edgeConnectsToNetwork,
  hasRoadTouchingVertex,
  negate,
  requirePlayer,
} from './helpers.js';
import { BOARD } from '../board/index.js';

function assertActionsTurn(state: GameState, actorId: string): void {
  assert(state.phase === 'PLAY', 'You can only build during play.');
  assert(state.turnPhase === 'ACTIONS', 'You can only build after rolling.');
  assert(currentPlayer(state).id === actorId, 'It is not your turn.');
}

function countRoads(state: GameState, owner: string): number {
  return Object.values(state.board!.roads).filter((r) => r.owner === owner).length;
}

function countBuildings(state: GameState, owner: string, city: boolean): number {
  return Object.values(state.board!.buildings).filter((b) => b.owner === owner && b.city === city).length;
}

export function buildRoad(state: GameState, action: Extract<Action, { type: 'BUILD_ROAD' }>): ReduceResult {
  assertActionsTurn(state, action.actorId);
  const board = state.board!;
  const player = requirePlayer(state, action.actorId);
  assert(action.edge >= 0 && action.edge < BOARD.edges.length, 'No such edge.');
  assert(!board.roads[action.edge], 'That edge already has a road.');
  assert(countRoads(state, action.actorId) < PIECE_LIMITS.road, 'No roads left to build.');
  assert(edgeConnectsToNetwork(board, action.edge, action.actorId), 'A road must connect to your network.');
  assert(canAfford(player.hand, BUILD_COSTS.road), 'You cannot afford a road.');

  const nextState: GameState = {
    ...state,
    board: { ...board, roads: { ...board.roads, [action.edge]: { owner: action.actorId } } },
    players: state.players.map((p) =>
      p.id === action.actorId ? { ...p, hand: addResources(p.hand, negate(BUILD_COSTS.road)) } : p,
    ),
  };
  const events: GameEvent[] = [
    { type: 'ROAD_BUILT', playerId: action.actorId, edge: action.edge, setup: false },
  ];
  return { state: nextState, events };
}

export function buildSettlement(
  state: GameState,
  action: Extract<Action, { type: 'BUILD_SETTLEMENT' }>,
): ReduceResult {
  assertActionsTurn(state, action.actorId);
  const board = state.board!;
  const player = requirePlayer(state, action.actorId);
  assert(action.vertex >= 0 && action.vertex < BOARD.vertices.length, 'No such vertex.');
  assert(!board.buildings[action.vertex], 'That vertex is already occupied.');
  assert(countBuildings(state, action.actorId, false) < PIECE_LIMITS.settlement, 'No settlements left.');
  assert(
    BOARD.vertices[action.vertex].vertices.every((n) => !board.buildings[n]),
    'Too close to another settlement (distance rule).',
  );
  assert(
    hasRoadTouchingVertex(board, action.vertex, action.actorId),
    'A settlement must connect to one of your roads.',
  );
  assert(canAfford(player.hand, BUILD_COSTS.settlement), 'You cannot afford a settlement.');

  const nextState: GameState = {
    ...state,
    board: {
      ...board,
      buildings: { ...board.buildings, [action.vertex]: { owner: action.actorId, city: false } },
    },
    players: state.players.map((p) =>
      p.id === action.actorId ? { ...p, hand: addResources(p.hand, negate(BUILD_COSTS.settlement)) } : p,
    ),
  };
  const events: GameEvent[] = [
    { type: 'SETTLEMENT_BUILT', playerId: action.actorId, vertex: action.vertex, setup: false },
  ];
  return { state: nextState, events };
}

export function buildCity(state: GameState, action: Extract<Action, { type: 'BUILD_CITY' }>): ReduceResult {
  assertActionsTurn(state, action.actorId);
  const board = state.board!;
  const player = requirePlayer(state, action.actorId);
  const existing = board.buildings[action.vertex];
  assert(existing, 'There is no settlement there to upgrade.');
  assert(existing.owner === action.actorId, 'You can only upgrade your own settlement.');
  assert(!existing.city, 'That is already a city.');
  assert(countBuildings(state, action.actorId, true) < PIECE_LIMITS.city, 'No cities left.');
  assert(canAfford(player.hand, BUILD_COSTS.city), 'You cannot afford a city.');

  const nextState: GameState = {
    ...state,
    board: {
      ...board,
      buildings: { ...board.buildings, [action.vertex]: { owner: action.actorId, city: true } },
    },
    players: state.players.map((p) =>
      p.id === action.actorId ? { ...p, hand: addResources(p.hand, negate(BUILD_COSTS.city)) } : p,
    ),
  };
  const events: GameEvent[] = [{ type: 'CITY_BUILT', playerId: action.actorId, vertex: action.vertex }];
  return { state: nextState, events };
}
