/**
 * SETUP phase: the snake-draft initial placement. In seating order each player
 * places a settlement + an adjacent road; then in reverse order each places a
 * second settlement + road, with the second settlement granting one resource
 * per adjacent producing tile. When the draft finishes, play advances to the
 * first player's MUST_ROLL.
 */

import { BOARD, isProducing } from '../board/index.js';
import {
  Action,
  GameEvent,
  GameState,
  ResourceCounts,
  ReduceResult,
  SetupState,
} from '../types.js';
import { addResources, assert } from './helpers.js';

/** Placement order: forward through seats, then reverse (a 2N snake). */
export function buildSetupOrder(playerCount: number): SetupState {
  const forward = Array.from({ length: playerCount }, (_, i) => i);
  const order = [...forward, ...[...forward].reverse()];
  return { order, step: 0, pending: 'settlement', lastSettlement: null };
}

function setup(state: GameState): SetupState {
  assert(state.phase === 'SETUP' && state.setup, 'Not in the setup phase.');
  return state.setup;
}

/** The player index whose placement is current during setup. */
function currentSetupIndex(s: SetupState): number {
  return s.order[s.step];
}

export function placeSetupSettlement(
  state: GameState,
  action: Extract<Action, { type: 'PLACE_SETUP_SETTLEMENT' }>,
): ReduceResult {
  const s = setup(state);
  const board = state.board!;
  assert(s.pending === 'settlement', 'You must place a road, not a settlement, right now.');
  assert(state.players[currentSetupIndex(s)].id === action.actorId, "It is not your turn to place.");
  assert(action.vertex >= 0 && action.vertex < BOARD.vertices.length, 'No such vertex.');
  assert(!board.buildings[action.vertex], 'That vertex is already occupied.');
  assert(
    BOARD.vertices[action.vertex].vertices.every((n) => !board.buildings[n]),
    'Too close to another settlement (distance rule).',
  );

  const isSecondRound = s.step >= state.players.length;
  const nextBuildings = { ...board.buildings, [action.vertex]: { owner: action.actorId, city: false } };

  let nextState: GameState = {
    ...state,
    board: { ...board, buildings: nextBuildings },
    setup: { ...s, pending: 'road', lastSettlement: action.vertex },
  };
  const events: GameEvent[] = [
    { type: 'SETTLEMENT_BUILT', playerId: action.actorId, vertex: action.vertex, setup: true },
  ];

  if (isSecondRound) {
    const grant = resourcesFromVertex(state, action.vertex);
    if (Object.keys(grant).length > 0) {
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === action.actorId ? { ...p, hand: addResources(p.hand, grant) } : p,
        ),
      };
      events.push({ type: 'RESOURCES_GRANTED', playerId: action.actorId, resources: grant });
    }
  }

  return { state: nextState, events };
}

export function placeSetupRoad(
  state: GameState,
  action: Extract<Action, { type: 'PLACE_SETUP_ROAD' }>,
): ReduceResult {
  const s = setup(state);
  const board = state.board!;
  assert(s.pending === 'road', 'You must place a settlement, not a road, right now.');
  assert(state.players[currentSetupIndex(s)].id === action.actorId, 'It is not your turn to place.');
  assert(action.edge >= 0 && action.edge < BOARD.edges.length, 'No such edge.');
  assert(!board.roads[action.edge], 'That edge already has a road.');
  assert(
    s.lastSettlement != null && BOARD.edges[action.edge].vertices.includes(s.lastSettlement),
    'A setup road must connect to the settlement you just placed.',
  );

  const nextBoard = { ...board, roads: { ...board.roads, [action.edge]: { owner: action.actorId } } };
  const events: GameEvent[] = [
    { type: 'ROAD_BUILT', playerId: action.actorId, edge: action.edge, setup: true },
  ];

  const nextStep = s.step + 1;
  if (nextStep < s.order.length) {
    // Continue the draft with the next player's settlement.
    return {
      state: {
        ...state,
        board: nextBoard,
        setup: { ...s, step: nextStep, pending: 'settlement', lastSettlement: null },
        turnIndex: s.order[nextStep],
      },
      events,
    };
  }

  // Draft complete: begin the main game at the first player's roll.
  const firstPlayer = state.players[0];
  events.push({ type: 'SETUP_COMPLETE' });
  events.push({ type: 'TURN_STARTED', playerId: firstPlayer.id, turnNumber: 1 });
  return {
    state: {
      ...state,
      board: nextBoard,
      setup: null,
      phase: 'PLAY',
      turnIndex: 0,
      turnPhase: 'MUST_ROLL',
      turnNumber: 1,
      devCardPlayedThisTurn: false,
    },
    events,
  };
}

/** One resource per adjacent producing tile for a settlement at `vertex`. */
export function resourcesFromVertex(state: GameState, vertex: number): Partial<ResourceCounts> {
  const board = state.board!;
  const grant: Partial<ResourceCounts> = {};
  for (const tileId of BOARD.vertices[vertex].tiles) {
    const resource = board.setup.tileResources[tileId];
    if (!isProducing(resource)) continue;
    grant[resource] = (grant[resource] ?? 0) + 1;
  }
  return grant;
}
