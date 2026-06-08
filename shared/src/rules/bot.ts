/**
 * Bot decision policy (issue 0017): a pure function that, given the full game
 * state and a bot's seat id, returns the single next RNG-free intent the bot
 * wants — or null when the bot owes nothing right now. The server driver calls
 * it repeatedly (filling RNG, re-validating through `reduce`), so a bot's whole
 * turn emerges as a sequence of single moves.
 *
 * The bot reads the full `GameState` (it runs inside the trusted server), but its
 * moves are still re-validated by the same reducer a human's go through, so a bug
 * can never produce an illegal effect — at worst a rejected move.
 *
 * `BotMove` mirrors the client→server inputs minus the actor id and minus any
 * server RNG (dice faces, the stolen card): the driver fills those in. This slice
 * covers a non-stalling but unproductive loop — setup placement, roll, end-turn,
 * and the reactive 7 phases (discard, move robber). Building, dev cards, and
 * trade responses arrive in later slices.
 */

import { BOARD } from '../board/index.js';
import { GameState, Resource, ResourceCounts } from '../types.js';
import { RESOURCES } from '../types.js';
import { getPlayer, handTotal, robberVictims, satisfiesDistanceRule } from './helpers.js';
import { publicVictoryPoints } from './scoring.js';

export type BotMove =
  | { kind: 'placeSetupSettlement'; vertex: number }
  | { kind: 'placeSetupRoad'; edge: number }
  | { kind: 'roll' }
  | { kind: 'discard'; resources: Partial<ResourceCounts> }
  | { kind: 'moveRobber'; tile: number; stealFrom: string | null }
  | { kind: 'endTurn' };

export function decideBotMove(state: GameState, botId: string): BotMove | null {
  // A forced discard is owed regardless of whose turn it is; resolve it first.
  if (state.phase === 'PLAY' && state.turnPhase === 'DISCARD') {
    const owed = state.discard?.required[botId] ?? 0;
    return owed > 0 ? { kind: 'discard', resources: chooseDiscard(state, botId, owed) } : null;
  }

  // Everything else is only the current player's to act on.
  const current = state.players[state.turnIndex];
  if (!current || current.id !== botId) return null;

  if (state.phase === 'SETUP') {
    return state.setup?.pending === 'road' ? decideSetupRoad(state) : decideSetupSettlement(state);
  }

  if (state.phase === 'PLAY') {
    switch (state.turnPhase) {
      case 'MUST_ROLL':
        return { kind: 'roll' };
      case 'MOVE_ROBBER':
        return decideRobber(state, botId);
      case 'ACTIONS':
        return { kind: 'endTurn' }; // building/buying/dev arrive in later slices
    }
  }
  return null;
}

/** Probability "pips" of a number token (5 for 6/8 … 1 for 2/12), 0 for none. */
function pip(token: number | null): number {
  return token == null ? 0 : 6 - Math.abs(7 - token);
}

/** Total production pips of the tiles touching a vertex — a cheap value heuristic. */
function vertexPips(state: GameState, vertex: number): number {
  const tokens = state.board!.setup.tileTokens;
  return BOARD.vertices[vertex].tiles.reduce((sum, t) => sum + pip(tokens[t]), 0);
}

/** Pick the legal setup vertex with the highest production pips (ties: lowest id). */
function decideSetupSettlement(state: GameState): BotMove | null {
  const board = state.board!;
  let best = -1;
  let bestScore = -1;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (!satisfiesDistanceRule(board, v)) continue;
    const score = vertexPips(state, v);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best >= 0 ? { kind: 'placeSetupSettlement', vertex: best } : null;
}

/** Any free edge incident to the just-placed settlement. */
function decideSetupRoad(state: GameState): BotMove | null {
  const board = state.board!;
  const v = state.setup?.lastSettlement;
  if (v == null) return null;
  for (const e of BOARD.vertices[v].edges) {
    if (!board.roads[e]) return { kind: 'placeSetupRoad', edge: e };
  }
  return null;
}

/** Shed exactly `need` cards, always dropping from the largest holding first. */
function chooseDiscard(state: GameState, botId: string, need: number): Partial<ResourceCounts> {
  const player = getPlayer(state, botId);
  const hand: ResourceCounts = { ...(player?.hand ?? { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 }) };
  const out: Partial<ResourceCounts> = {};
  for (let i = 0; i < need; i++) {
    let pick: Resource | null = null;
    let max = 0;
    for (const r of RESOURCES) {
      if (hand[r] > max) {
        max = hand[r];
        pick = r;
      }
    }
    if (!pick) break;
    hand[pick] -= 1;
    out[pick] = (out[pick] ?? 0) + 1;
  }
  return out;
}

/**
 * Move the robber to hurt the strongest opponent: pick the tile whose adjacent
 * opponents have the most public VP, avoiding tiles touching the bot's own
 * buildings where possible. Then steal from the richest legal victim there.
 */
function decideRobber(state: GameState, botId: string): BotMove {
  const board = state.board!;
  let bestTile = -1;
  let bestScore = -Infinity;
  for (let t = 0; t < BOARD.tiles.length; t++) {
    if (t === board.robberTile) continue;
    const owners = new Set<string>();
    let touchesSelf = false;
    for (const v of BOARD.tiles[t].vertices) {
      const b = board.buildings[v];
      if (!b) continue;
      if (b.owner === botId) touchesSelf = true;
      else owners.add(b.owner);
    }
    let score = 0;
    for (const o of owners) score += publicVictoryPoints(state, o);
    if (touchesSelf) score -= 100; // never block our own production unless forced
    if (score > bestScore) {
      bestScore = score;
      bestTile = t;
    }
  }
  if (bestTile < 0) bestTile = board.robberTile === 0 ? 1 : 0; // defensive fallback

  const victims = robberVictims(state, bestTile, botId);
  let stealFrom: string | null = null;
  for (const id of victims) {
    if (stealFrom == null || handTotal(getPlayer(state, id)!.hand) > handTotal(getPlayer(state, stealFrom)!.hand)) {
      stealFrom = id;
    }
  }
  return { kind: 'moveRobber', tile: bestTile, stealFrom };
}
