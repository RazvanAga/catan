/** Shared test fixtures: a seeded RNG and convenience action builders. */

import {
  Action,
  GameState,
  createBoardSetup,
  initialState,
  reduce,
} from '../src/index.js';

/** Deterministic RNG (mulberry32) so board/deck randomness is reproducible. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const joinAction = (id: string, name: string, color: Action extends never ? never : any): Action => ({
  type: 'JOIN',
  playerId: id,
  name,
  color,
});

/** A START_GAME action with a deterministic board and an empty dev deck. */
export function startAction(actorId: string, seed = 1): Extract<Action, { type: 'START_GAME' }> {
  return { type: 'START_GAME', actorId, board: createBoardSetup(seededRng(seed)), devDeck: [] };
}

/** Apply a sequence of actions, returning the final state (throws on illegal). */
export function run(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, a) => reduce(s, a).state, state);
}

/** A lobby with the given (id,name,color) seats filled, still in LOBBY. */
export function lobbyWith(seats: [string, string, string][]): GameState {
  return run(
    initialState(),
    seats.map(([id, name, color]) => joinAction(id, name, color)),
  );
}
