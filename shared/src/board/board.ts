/**
 * The single frozen board topology, imported everywhere (rules + rendering).
 * Backed by the committed `board.data.ts`; deep-frozen so nothing can mutate
 * the shared graph at runtime.
 */

import { BoardTopology } from './types.js';
import { BOARD_DATA } from './board.data.js';

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) deepFreeze(value);
    Object.freeze(obj);
  }
  return obj;
}

/** The frozen base-game topology. */
export const BOARD: BoardTopology = deepFreeze(BOARD_DATA);
