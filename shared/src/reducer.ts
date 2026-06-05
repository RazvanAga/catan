/**
 * The pure rules engine: `reduce(state, action) -> { state, events }`.
 *
 * Pure, immutable, deterministic — never mutates `state`, reads a clock, or
 * rolls RNG (all randomness arrives as action data). Throws
 * `IllegalActionError` for any action that violates the rules. The server is
 * the authority; the client may call `reduce` only for UX affordances.
 *
 * This file is just the dispatcher; the rules live in `./rules/*`.
 */

import { Action, GameState, ReduceResult } from './types.js';
import { IllegalActionError } from './rules/helpers.js';
import { join, ownerId, startGame } from './rules/lobby.js';
import { placeSetupRoad, placeSetupSettlement } from './rules/setup.js';
import { endTurn, roll } from './rules/turn.js';
import { buildCity, buildRoad, buildSettlement } from './rules/build.js';
import { tradeBank } from './rules/trade.js';
import { cancelTrade, confirmTrade, proposeTrade, respondTrade } from './rules/playertrade.js';
import { discard, moveRobber } from './rules/robber.js';
import { buyDevCard, playDevCard } from './rules/dev.js';
import { recomputeLongestRoad } from './rules/longestRoad.js';
import { checkVictory } from './rules/scoring.js';

export { IllegalActionError, ownerId };

/** The empty room every game (and "New game") starts from. */
export function initialState(): GameState {
  return {
    phase: 'LOBBY',
    players: [],
    previousWinnerId: null,
    board: null,
    setup: null,
    turnIndex: 0,
    turnPhase: 'MUST_ROLL',
    turnNumber: 0,
    lastRoll: null,
    devDeck: [],
    devCardPlayedThisTurn: false,
    bonuses: { longestRoad: null, longestRoadLength: 0, largestArmy: null, largestArmyCount: 0 },
    trade: null,
    discard: null,
    winner: null,
  };
}

export function reduce(state: GameState, action: Action): ReduceResult {
  let result = dispatch(state, action);

  // Any action that changes the board (a road or a settlement that splits one)
  // can shift the Longest Road bonus. Re-evaluate once, centrally, and merge.
  if (result.state.board && result.state.board !== state.board) {
    const { bonuses, events } = recomputeLongestRoad(result.state);
    if (bonuses !== result.state.bonuses) {
      result = { state: { ...result.state, bonuses }, events: [...result.events, ...events] };
    }
  }

  // After every VP-changing move, see if the active player has just won.
  const won = checkVictory(result.state);
  if (won) {
    result = { state: won.state, events: [...result.events, won.event] };
  }

  return result;
}

function dispatch(state: GameState, action: Action): ReduceResult {
  switch (action.type) {
    case 'JOIN':
      return join(state, action);
    case 'START_GAME':
      return startGame(state, action);
    case 'PLACE_SETUP_SETTLEMENT':
      return placeSetupSettlement(state, action);
    case 'PLACE_SETUP_ROAD':
      return placeSetupRoad(state, action);
    case 'ROLL':
      return roll(state, action);
    case 'END_TURN':
      return endTurn(state, action);
    case 'BUILD_ROAD':
      return buildRoad(state, action);
    case 'BUILD_SETTLEMENT':
      return buildSettlement(state, action);
    case 'BUILD_CITY':
      return buildCity(state, action);
    case 'TRADE_BANK':
      return tradeBank(state, action);
    case 'PROPOSE_TRADE':
      return proposeTrade(state, action);
    case 'RESPOND_TRADE':
      return respondTrade(state, action);
    case 'CONFIRM_TRADE':
      return confirmTrade(state, action);
    case 'CANCEL_TRADE':
      return cancelTrade(state, action);
    case 'DISCARD':
      return discard(state, action);
    case 'MOVE_ROBBER':
      return moveRobber(state, action);
    case 'BUY_DEV_CARD':
      return buyDevCard(state, action);
    case 'PLAY_DEV_CARD':
      return playDevCard(state, action);
    default: {
      const _exhaustive: never = action;
      throw new IllegalActionError(`Unknown action: ${(_exhaustive as Action).type}`);
    }
  }
}
