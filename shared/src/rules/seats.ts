/**
 * Seat-lifecycle reducers (issue 0014).
 *
 * The *policy* — who is connected, the 2-minute vacancy clock, and when to
 * auto-skip — lives in the server (it can't be expressed as `(state, action)`
 * because it is driven by socket events and a wall clock). These reducers are
 * just the tiny, pure state transitions the server drives that policy through,
 * so seat status still flows out via the single projection/broadcast path.
 *
 * A seat is connected (live), disconnected (greyed, still owned by its token),
 * or vacant (claimable by anyone, its turn auto-skipped). `connected` + `vacant`
 * encode those three states.
 */

import { Action, GameEvent, GameState, ReduceResult } from '../types.js';
import { assert, currentPlayer, requirePlayer } from './helpers.js';

/** Mark a seat connected or merely disconnected. Reconnecting clears vacancy. */
export function setConnected(
  state: GameState,
  action: Extract<Action, { type: 'SET_CONNECTED' }>,
): ReduceResult {
  requirePlayer(state, action.playerId);
  const players = state.players.map((p) =>
    p.id === action.playerId
      ? { ...p, connected: action.connected, vacant: action.connected ? false : p.vacant }
      : p,
  );
  const status = action.connected ? 'connected' : 'disconnected';
  return {
    state: { ...state, players },
    events: [{ type: 'SEAT_CONNECTION', playerId: action.playerId, status }],
  };
}

/** Time a disconnected seat out into the vacant state (claimable, auto-skipped). */
export function vacateSeat(
  state: GameState,
  action: Extract<Action, { type: 'VACATE_SEAT' }>,
): ReduceResult {
  requirePlayer(state, action.playerId);
  const players = state.players.map((p) =>
    p.id === action.playerId ? { ...p, connected: false, vacant: true } : p,
  );
  return {
    state: { ...state, players },
    events: [{ type: 'SEAT_CONNECTION', playerId: action.playerId, status: 'vacant' }],
  };
}

/**
 * Advance past a vacant seat's turn so play continues. Only legal when it is in
 * fact the current player's turn and that seat is vacant — the server is the
 * only caller, but the guard keeps the transition self-validating. Works from
 * any in-turn phase (roll, actions, or a robber move the AFK seat would owe),
 * clearing the same per-turn fields as a normal END_TURN.
 */
export function skipTurn(state: GameState, action: Extract<Action, { type: 'SKIP_TURN' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only skip a turn during play.');
  const skipped = currentPlayer(state);
  assert(skipped.id === action.actorId, 'Only the current turn can be skipped.');
  assert(skipped.vacant, 'Only a vacant seat may have its turn skipped.');
  assert(state.turnPhase !== 'DISCARD', 'Cannot skip while discards are outstanding.');

  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex];
  const events: GameEvent[] = [
    { type: 'TURN_SKIPPED', playerId: skipped.id },
    { type: 'TURN_STARTED', playerId: nextPlayer.id, turnNumber: state.turnNumber + 1 },
  ];
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
    events,
  };
}
