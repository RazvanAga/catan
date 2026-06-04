/**
 * Higher-level test helpers that drive whole phases, so behavior tests can start
 * from a realistic mid-game state. Placements always pick the first legal option
 * (deterministic), and player ids are the explicit ones passed to JOIN.
 */

import { BOARD, GameState, Action, initialState, reduce } from '../src/index.js';
import { run, startAction } from './helpers.js';

const COLORS = ['red', 'blue', 'orange', 'white'] as const;

/** A LOBBY with the given player ids seated (names == ids), then started (SETUP). */
export function startedGame(ids: string[], seed = 1): GameState {
  const joins: Action[] = ids.map((id, i) => ({
    type: 'JOIN',
    playerId: id,
    name: id,
    color: COLORS[i],
  }));
  return run(initialState(), [...joins, startAction(ids[0], seed)]);
}

function firstLegalVertex(state: GameState): number {
  const board = state.board!;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (board.buildings[v]) continue;
    if (BOARD.vertices[v].vertices.every((n) => !board.buildings[n])) return v;
  }
  throw new Error('no legal vertex');
}

function firstFreeEdgeAt(state: GameState, vertex: number): number {
  const board = state.board!;
  const e = BOARD.vertices[vertex].edges.find((eid) => !board.roads[eid]);
  if (e == null) throw new Error('no free edge');
  return e;
}

/** Return a copy with `playerId`'s hand set to the given counts (others zero-filled). */
export function withHand(
  state: GameState,
  playerId: string,
  hand: Partial<Record<'brick' | 'wood' | 'sheep' | 'wheat' | 'ore', number>>,
): GameState {
  const full = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0, ...hand };
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, hand: full } : p)) };
}

/** Put the game into the current player's ACTIONS phase (as if a non-7 was rolled). */
export function inActions(state: GameState): GameState {
  return { ...state, turnPhase: 'ACTIONS', lastRoll: [3, 4] };
}

/** Run the full snake draft, returning the state at the first player's MUST_ROLL. */
export function playThroughSetup(ids: string[], seed = 1): GameState {
  let state = startedGame(ids, seed);
  let guard = 0;
  while (state.phase === 'SETUP' && guard++ < 50) {
    const actor = state.players[state.turnIndex].id;
    const v = firstLegalVertex(state);
    state = reduce(state, { type: 'PLACE_SETUP_SETTLEMENT', actorId: actor, vertex: v }).state;
    const e = firstFreeEdgeAt(state, v);
    state = reduce(state, { type: 'PLACE_SETUP_ROAD', actorId: actor, edge: e }).state;
  }
  return state;
}
