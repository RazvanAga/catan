/**
 * The consequences of rolling a 7 (issue 0009): the forced-discard sub-state,
 * moving the robber, and the random steal.
 *
 * Flow (driven by `turnPhase`): `roll()` (in turn.ts) detects a 7 and either
 * enters `DISCARD` — collecting half (rounded down) from every player holding
 * >7 cards — or, if nobody owes a discard, jumps straight to `MOVE_ROBBER`.
 * Once all discards are in, the active player moves the robber to a different
 * tile and steals one card from an adjacent player. The robber's tile then
 * blocks production (handled in `distributeProduction`).
 *
 * Pending discards live in `state.discard` as explicit per-player counts so a
 * seat driver (human UI or a future bot) can read the obligation directly. The
 * stolen card is chosen by the server's RNG and arrives as `action.stolen`; the
 * reducer only re-validates it (keeping the engine pure, deterministic, testable).
 */

import { BOARD } from '../board/index.js';
import {
  Action,
  GameEvent,
  GameState,
  Resource,
  ResourceCounts,
  ReduceResult,
} from '../types.js';
import { RESOURCES } from '../types.js';
import {
  addResources,
  assert,
  currentPlayer,
  negate,
  requirePlayer,
  robberVictims,
} from './helpers.js';

/** Validate a resource map: known resources, positive integer counts, non-empty. */
function cleanResourceMap(map: Partial<ResourceCounts>, label: string): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  let total = 0;
  for (const [k, v] of Object.entries(map) as [Resource, number][]) {
    assert(RESOURCES.includes(k), `Unknown resource in ${label}.`);
    assert(Number.isInteger(v) && v > 0, `${label} amounts must be positive integers.`);
    out[k] = v;
    total += v;
  }
  assert(total > 0, `${label} cannot be empty.`);
  return out;
}

function mapTotal(map: Partial<ResourceCounts>): number {
  return (Object.values(map) as number[]).reduce((a, b) => a + b, 0);
}

/** Pick a uniformly-random card from a hand, or null if it is empty. */
export function pickRandomCard(hand: ResourceCounts, rng: () => number = Math.random): Resource | null {
  const pool: Resource[] = [];
  for (const res of RESOURCES) for (let i = 0; i < hand[res]; i++) pool.push(res);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * A player submits their forced discard. Only players who owe one (in
 * `state.discard.required`) may discard, and they must discard exactly the
 * required count of cards they actually hold. When the last obligation clears,
 * play advances to `MOVE_ROBBER`.
 */
export function discard(state: GameState, action: Extract<Action, { type: 'DISCARD' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only discard during play.');
  assert(state.turnPhase === 'DISCARD' && state.discard, 'There is nothing to discard right now.');

  const required = state.discard.required[action.actorId];
  assert(required != null, 'You do not need to discard.');
  const player = requirePlayer(state, action.actorId);

  const cards = cleanResourceMap(action.discard, 'discard');
  assert(mapTotal(cards) === required, `You must discard exactly ${required} card(s).`);
  for (const res of RESOURCES) {
    assert((player.hand[res] ?? 0) >= (cards[res] ?? 0), 'You cannot discard cards you do not have.');
  }

  const players = state.players.map((p) =>
    p.id === action.actorId ? { ...p, hand: addResources(p.hand, negate(cards)) } : p,
  );

  const remaining = { ...state.discard.required };
  delete remaining[action.actorId];
  const done = Object.keys(remaining).length === 0;

  return {
    state: {
      ...state,
      players,
      discard: done ? null : { required: remaining },
      turnPhase: done ? 'MOVE_ROBBER' : 'DISCARD',
    },
    events: [{ type: 'CARDS_DISCARDED', playerId: action.actorId, resources: cards }],
  };
}

/**
 * The active player moves the robber to a different tile and, if any adjacent
 * opponent holds cards, steals one (the specific card chosen server-side and
 * passed in as `action.stolen`). With an eligible victim available the move must
 * include a steal; with none, `stealFrom`/`stolen` must be null.
 */
export function moveRobber(
  state: GameState,
  action: Extract<Action, { type: 'MOVE_ROBBER' }>,
): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only move the robber during play.');
  assert(state.turnPhase === 'MOVE_ROBBER', 'You cannot move the robber right now.');
  assert(currentPlayer(state).id === action.actorId, 'Only the active player can move the robber.');

  const board = state.board!;
  assert(
    Number.isInteger(action.tile) && action.tile >= 0 && action.tile < BOARD.tiles.length,
    'Invalid tile.',
  );
  assert(action.tile !== board.robberTile, 'The robber must move to a different tile.');

  const victims = robberVictims(state, action.tile, action.actorId);
  const events: GameEvent[] = [{ type: 'ROBBER_MOVED', playerId: action.actorId, tile: action.tile }];
  let players = state.players;

  if (action.stealFrom == null) {
    assert(victims.length === 0, 'You must steal from a player adjacent to the robber.');
    assert(action.stolen == null, 'No player was chosen to steal from.');
  } else {
    assert(victims.includes(action.stealFrom), 'You cannot steal from that player.');
    assert(action.stolen != null, 'No card was specified to steal.');
    const stolen = action.stolen;
    const victim = requirePlayer(state, action.stealFrom);
    assert((victim.hand[stolen] ?? 0) > 0, 'That player does not have that card.');

    players = state.players.map((p) => {
      if (p.id === action.stealFrom) return { ...p, hand: addResources(p.hand, { [stolen]: -1 }) };
      if (p.id === action.actorId) return { ...p, hand: addResources(p.hand, { [stolen]: 1 }) };
      return p;
    });
    events.push({ type: 'CARD_STOLEN', from: action.stealFrom, to: action.actorId });
  }

  return {
    state: { ...state, board: { ...board, robberTile: action.tile }, players, turnPhase: 'ACTIONS' },
    events,
  };
}
