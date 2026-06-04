/**
 * Bank & port trading (deterministic, player <-> bank). The active player trades
 * a number of identical resources for one of another. The ratio is the best the
 * player qualifies for: 4:1 by default, 3:1 with a generic port, or 2:1 with the
 * matching specific port — port ownership being a building on one of the port's
 * vertices in the frozen graph. Player<->player trades are issue 0008.
 */

import { BOARD } from '../board/index.js';
import { Action, GameState, PortType, ReduceResult, Resource } from '../types.js';
import { addResources, assert, currentPlayer, requirePlayer } from './helpers.js';

/** Port trade types the player can access (has a building on a port vertex). */
export function portsForPlayer(state: GameState, playerId: string): Set<PortType> {
  const board = state.board;
  const out = new Set<PortType>();
  if (!board) return out;
  BOARD.ports.forEach((port) => {
    if (port.vertices.some((v) => board.buildings[v]?.owner === playerId)) {
      out.add(board.setup.portTypes[port.id]);
    }
  });
  return out;
}

/** Best bank ratio for giving `give`: 2 (specific port), 3 (generic), else 4. */
export function bestBankRatio(state: GameState, playerId: string, give: Resource): number {
  const ports = portsForPlayer(state, playerId);
  if (ports.has(give)) return 2;
  if (ports.has('3:1')) return 3;
  return 4;
}

export function tradeBank(state: GameState, action: Extract<Action, { type: 'TRADE_BANK' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only trade during play.');
  assert(state.turnPhase === 'ACTIONS', 'You can only trade after rolling.');
  assert(currentPlayer(state).id === action.actorId, 'It is not your turn.');
  assert(action.give !== action.receive, 'Choose two different resources.');
  const player = requirePlayer(state, action.actorId);

  const ratio = bestBankRatio(state, action.actorId, action.give);
  assert(player.hand[action.give] >= ratio, `You need ${ratio} ${action.give} to trade for 1 ${action.receive}.`);

  const nextState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === action.actorId
        ? { ...p, hand: addResources(p.hand, { [action.give]: -ratio, [action.receive]: 1 }) }
        : p,
    ),
  };
  return {
    state: nextState,
    events: [
      { type: 'BANK_TRADE', playerId: action.actorId, give: action.give, count: ratio, receive: action.receive },
    ],
  };
}
