/**
 * Player <-> player trading (issue 0008). Only the active player, in ACTIONS,
 * may propose: a give set and a want set. Every other player may Accept or
 * Decline (they see only quantities, never hands — enforced by the projector).
 * The proposer confirms exactly one accepter (resources swap, if both can still
 * afford their side) or cancels. A non-responding/disconnected player never
 * blocks: they simply aren't an accepter.
 */

import {
  Action,
  GameState,
  ResourceCounts,
  ReduceResult,
  Resource,
  TradeProposal,
} from '../types.js';
import { addResources, assert, canAfford, currentPlayer, requirePlayer } from './helpers.js';

const RES: Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];

/** Validate a resource map has only known resources with positive integer counts. */
function cleanResourceMap(map: Partial<ResourceCounts>, label: string): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  let total = 0;
  for (const [k, v] of Object.entries(map) as [Resource, number][]) {
    assert(RES.includes(k), `Unknown resource in ${label}.`);
    assert(Number.isInteger(v) && v > 0, `${label} amounts must be positive integers.`);
    out[k] = v;
    total += v;
  }
  assert(total > 0, `${label} cannot be empty.`);
  return out;
}

export function proposeTrade(
  state: GameState,
  action: Extract<Action, { type: 'PROPOSE_TRADE' }>,
): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only trade during play.');
  assert(state.turnPhase === 'ACTIONS', 'You can only trade after rolling.');
  assert(currentPlayer(state).id === action.actorId, 'Only the active player can propose a trade.');
  assert(!state.trade, 'There is already an open trade proposal.');

  const give = cleanResourceMap(action.give, 'offer');
  const want = cleanResourceMap(action.want, 'request');
  const proposer = requirePlayer(state, action.actorId);
  assert(canAfford(proposer.hand, give), 'You do not have the resources you are offering.');

  const trade: TradeProposal = { proposer: action.actorId, give, want, responses: {} };
  return {
    state: { ...state, trade },
    events: [{ type: 'TRADE_PROPOSED', proposer: action.actorId }],
  };
}

export function respondTrade(
  state: GameState,
  action: Extract<Action, { type: 'RESPOND_TRADE' }>,
): ReduceResult {
  assert(state.trade, 'There is no trade to respond to.');
  assert(action.actorId !== state.trade.proposer, 'You proposed this trade.');
  requirePlayer(state, action.actorId);

  const trade: TradeProposal = {
    ...state.trade,
    responses: { ...state.trade.responses, [action.actorId]: action.response },
  };
  return {
    state: { ...state, trade },
    events: [{ type: 'TRADE_RESPONDED', playerId: action.actorId, response: action.response }],
  };
}

export function confirmTrade(
  state: GameState,
  action: Extract<Action, { type: 'CONFIRM_TRADE' }>,
): ReduceResult {
  const trade = state.trade;
  assert(trade, 'There is no open trade.');
  assert(action.actorId === trade.proposer, 'Only the proposer can confirm the trade.');
  assert(trade.responses[action.partnerId] === 'accept', 'That player has not accepted the trade.');

  const proposer = requirePlayer(state, trade.proposer);
  const partner = requirePlayer(state, action.partnerId);
  // The proposer gives `give` and receives `want`; the partner does the reverse.
  assert(canAfford(proposer.hand, trade.give), 'You can no longer afford your offer.');
  assert(canAfford(partner.hand, trade.want), 'Your partner can no longer afford their side.');

  const negGive = mapNeg(trade.give);
  const negWant = mapNeg(trade.want);
  const players = state.players.map((p) => {
    if (p.id === trade.proposer) return { ...p, hand: addResources(addResources(p.hand, negGive), trade.want) };
    if (p.id === action.partnerId) return { ...p, hand: addResources(addResources(p.hand, negWant), trade.give) };
    return p;
  });

  return {
    state: { ...state, players, trade: null },
    events: [{ type: 'TRADE_CONFIRMED', proposer: trade.proposer, partnerId: action.partnerId }],
  };
}

export function cancelTrade(
  state: GameState,
  action: Extract<Action, { type: 'CANCEL_TRADE' }>,
): ReduceResult {
  const trade = state.trade;
  assert(trade, 'There is no open trade.');
  assert(action.actorId === trade.proposer, 'Only the proposer can cancel the trade.');
  return {
    state: { ...state, trade: null },
    events: [{ type: 'TRADE_CANCELLED', proposer: trade.proposer }],
  };
}

function mapNeg(map: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  for (const [k, v] of Object.entries(map) as [Resource, number][]) out[k] = -v;
  return out;
}
