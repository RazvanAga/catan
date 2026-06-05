/**
 * Longest Road bonus (issue 0011).
 *
 * A player's longest road is the longest *continuous* trail through their road
 * network in the board graph — a walk that never reuses an edge. An opponent's
 * settlement or city sitting on a vertex breaks the trail there: you may start
 * or end a road at that corner but never pass straight through it. (Your own
 * buildings never block you.)
 *
 * The bonus (+2 VP, scored in `scoring.ts`) is awarded to the first player to
 * reach length >= 5, transfers only when another player *strictly* surpasses the
 * current holder, and is revoked or transferred when a network is broken (e.g. an
 * opponent's settlement splitting it) drops the holder back below 5. A tie for
 * the lead awards no one — the bonus only ever sits with a sole leader.
 *
 * `recomputeLongestRoad` is pure: the dispatcher calls it after any action that
 * changes the board and merges the result, so every road/settlement placement
 * re-evaluates the holder.
 */

import { BoardState, Bonuses, GameEvent, GameState } from '../types.js';
import { BOARD } from '../board/index.js';

/** Continuous-road length that first earns the bonus. */
export const LONGEST_ROAD_MIN = 5;

/** Longest continuous road (edge-simple trail) length for `playerId`. */
export function playerLongestRoad(board: BoardState, playerId: string): number {
  const owned = new Set<number>();
  for (const [eid, road] of Object.entries(board.roads)) {
    if (road.owner === playerId) owned.add(Number(eid));
  }
  if (owned.size === 0) return 0;

  // A trail may not pass *through* a vertex carrying an opponent's building.
  const blocked = (v: number): boolean => {
    const b = board.buildings[v];
    return b != null && b.owner !== playerId;
  };

  const used = new Set<number>();

  // Standing at `v`, having arrived via `inEdge` (null when starting the walk),
  // return the longest further extension.
  const walk = (v: number, inEdge: number | null): number => {
    if (inEdge !== null && blocked(v)) return 0; // can't continue through an opponent
    let longest = 0;
    for (const e of BOARD.vertices[v].edges) {
      if (!owned.has(e) || used.has(e)) continue;
      const [a, b] = BOARD.edges[e].vertices;
      const next = a === v ? b : a;
      used.add(e);
      longest = Math.max(longest, 1 + walk(next, e));
      used.delete(e);
    }
    return longest;
  };

  let best = 0;
  // Try starting from both endpoints of every owned edge.
  for (const e of owned) {
    const [a, b] = BOARD.edges[e].vertices;
    best = Math.max(best, walk(a, null), walk(b, null));
  }
  return best;
}

/**
 * Re-evaluate the Longest Road holder against the post-action board. Returns the
 * (possibly unchanged) bonuses plus a `LONGEST_ROAD` event when the holder
 * actually changes hands (including being revoked to null).
 */
export function recomputeLongestRoad(state: GameState): { bonuses: Bonuses; events: GameEvent[] } {
  const board = state.board;
  const prev = state.bonuses;
  if (!board) return { bonuses: prev, events: [] };

  const lengths = new Map<string, number>();
  for (const p of state.players) lengths.set(p.id, playerLongestRoad(board, p.id));

  let holder = prev.longestRoad;
  let length = prev.longestRoadLength;

  // 1. A broken network can drop the current holder below the threshold.
  if (holder !== null && (lengths.get(holder) ?? 0) < LONGEST_ROAD_MIN) {
    holder = null;
    length = 0;
  } else if (holder !== null) {
    length = lengths.get(holder)!; // keep the holder's tracked length current
  }

  if (holder === null) {
    // 2. Award to a sole leader of length >= 5 (a tie awards no one).
    const sole = soleLeader(lengths, LONGEST_ROAD_MIN);
    if (sole) [holder, length] = sole;
  } else {
    // 3. Transfer only when another player *strictly* surpasses the holder — and
    // is the sole player to reach that surpassing length.
    const sole = soleLeader(lengths, length + 1, holder);
    if (sole) [holder, length] = sole;
  }

  if (holder === prev.longestRoad && length === prev.longestRoadLength) {
    return { bonuses: prev, events: [] };
  }
  const bonuses: Bonuses = { ...prev, longestRoad: holder, longestRoadLength: length };
  const events: GameEvent[] =
    holder === prev.longestRoad ? [] : [{ type: 'LONGEST_ROAD', playerId: holder, length }];
  return { bonuses, events };
}

/**
 * The single player whose road length is the maximum and is >= `min`, ignoring
 * `exclude`. Returns `[id, length]`, or null when nobody clears `min` or the
 * lead is tied.
 */
function soleLeader(
  lengths: Map<string, number>,
  min: number,
  exclude?: string,
): [string, number] | null {
  let max = min - 1;
  let leader: string | null = null;
  let tied = false;
  for (const [id, n] of lengths) {
    if (id === exclude || n < min) continue;
    if (n > max) {
      max = n;
      leader = id;
      tied = false;
    } else if (n === max) {
      tied = true;
    }
  }
  return leader && !tied ? [leader, max] : null;
}
