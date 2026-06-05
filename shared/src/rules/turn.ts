/**
 * The main turn-loop spine: MUST_ROLL -> ACTIONS -> END_TURN.
 *
 * The active player rolls once (the server supplies the dice as action data);
 * every player collects resources from tiles matching the total that are
 * adjacent to their settlements (1 each) and cities (2 each), excluding the
 * robber's tile. A 7 produces nothing and instead triggers the discard/robber
 * flow (see rules/robber.ts). "End turn" passes play to the next player.
 */

import { BOARD, isProducing } from '../board/index.js';
import {
  Action,
  GameEvent,
  GameState,
  ResourceCounts,
  ReduceResult,
} from '../types.js';
import { addResources, assert, currentPlayer, handTotal } from './helpers.js';

export function roll(state: GameState, action: Extract<Action, { type: 'ROLL' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only roll during play.');
  assert(state.turnPhase === 'MUST_ROLL', 'You have already rolled this turn.');
  assert(currentPlayer(state).id === action.actorId, 'It is not your turn.');
  const [d1, d2] = action.dice;
  assert(d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6, 'Invalid dice.');
  const total = d1 + d2;

  const events: GameEvent[] = [
    { type: 'DICE_ROLLED', playerId: action.actorId, dice: [d1, d2], total },
  ];

  let next: GameState = { ...state, lastRoll: [d1, d2], turnPhase: 'ACTIONS' };

  if (total === 7) {
    // A 7 produces nothing; instead it triggers forced discards (issue 0009).
    // Everyone holding >7 cards must discard half (rounded down). If anyone owes
    // a discard we enter DISCARD and wait for all of them; otherwise the active
    // player goes straight to moving the robber.
    const required: Record<string, number> = {};
    for (const p of state.players) {
      const held = handTotal(p.hand);
      if (held > 7) required[p.id] = Math.floor(held / 2);
    }
    const owers = Object.keys(required);
    if (owers.length > 0) {
      for (const pid of owers) events.push({ type: 'DISCARD_REQUIRED', playerId: pid, count: required[pid] });
      return { state: { ...next, turnPhase: 'DISCARD', discard: { required } }, events };
    }
    return { state: { ...next, turnPhase: 'MOVE_ROBBER' }, events };
  }

  const { players, grants } = distributeProduction(state, total);
  next = { ...next, players };
  for (const [playerId, resources] of grants) {
    events.push({ type: 'RESOURCES_GRANTED', playerId, resources });
  }
  return { state: next, events };
}

/**
 * Compute production for `total`: every building adjacent to a producing tile
 * with that token (and not under the robber) grants its owner the tile resource,
 * 1 for a settlement and 2 for a city. Returns updated players + per-player
 * grant summaries (for narration).
 */
export function distributeProduction(
  state: GameState,
  total: number,
): { players: GameState['players']; grants: [string, Partial<ResourceCounts>][] } {
  const board = state.board!;
  const perPlayer = new Map<string, Partial<ResourceCounts>>();

  for (const tile of BOARD.tiles) {
    if (board.setup.tileTokens[tile.id] !== total) continue;
    if (tile.id === board.robberTile) continue;
    const resource = board.setup.tileResources[tile.id];
    if (!isProducing(resource)) continue;

    for (const vid of tile.vertices) {
      const building = board.buildings[vid];
      if (!building) continue;
      const amount = building.city ? 2 : 1;
      const acc = perPlayer.get(building.owner) ?? {};
      acc[resource] = (acc[resource] ?? 0) + amount;
      perPlayer.set(building.owner, acc);
    }
  }

  const players = state.players.map((p) => {
    const grant = perPlayer.get(p.id);
    return grant ? { ...p, hand: addResources(p.hand, grant) } : p;
  });
  return { players, grants: [...perPlayer.entries()] };
}

export function endTurn(state: GameState, action: Extract<Action, { type: 'END_TURN' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only end a turn during play.');
  assert(state.turnPhase === 'ACTIONS', 'You can only end your turn after rolling.');
  assert(currentPlayer(state).id === action.actorId, 'It is not your turn.');

  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex];
  return {
    state: {
      ...state,
      turnIndex: nextIndex,
      turnPhase: 'MUST_ROLL',
      turnNumber: state.turnNumber + 1,
      lastRoll: null,
      devCardPlayedThisTurn: false,
      trade: null,
      discard: null,
    },
    events: [
      { type: 'TURN_ENDED', playerId: action.actorId },
      { type: 'TURN_STARTED', playerId: nextPlayer.id, turnNumber: state.turnNumber + 1 },
    ],
  };
}
