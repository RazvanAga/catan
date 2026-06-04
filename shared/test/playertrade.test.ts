/**
 * Player↔player trading: propose/accept/decline/confirm/cancel, the
 * active-player-only and ACTIONS-only gating, affordability checks at
 * confirmation, and the non-blocking behavior when a player never responds.
 */

import { describe, expect, it } from 'vitest';
import { GameState, reduce } from '../src/index.js';
import { inActions, playThroughSetup, withHand } from './game-helpers.js';

const PLAYERS = ['p1', 'p2', 'p3'];

/** p1 (active) has wood to give; p2 has brick to give back. */
function ready(): GameState {
  let state = inActions(playThroughSetup(PLAYERS));
  state = withHand(state, 'p1', { wood: 2 });
  state = withHand(state, 'p2', { brick: 2 });
  return state;
}

const OFFER = { give: { wood: 2 }, want: { brick: 1 } };

describe('propose', () => {
  it('only the active player may propose, only in ACTIONS', () => {
    const state = ready();
    expect(() => reduce(state, { type: 'PROPOSE_TRADE', actorId: 'p2', ...OFFER })).toThrow(/active player/);

    const mustRoll = withHand(playThroughSetup(PLAYERS), 'p1', { wood: 2 });
    expect(() => reduce(mustRoll, { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER })).toThrow(/after rolling/);
  });

  it('rejects offering resources you do not have', () => {
    const state = withHand(ready(), 'p1', { wood: 0 });
    expect(() => reduce(state, { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER })).toThrow(/do not have/);
  });

  it('opens a proposal exposing only quantities', () => {
    const { state } = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER });
    expect(state.trade).toMatchObject({ proposer: 'p1', give: { wood: 2 }, want: { brick: 1 }, responses: {} });
  });
});

describe('respond + confirm', () => {
  it('accept then confirm swaps resources and clears the trade', () => {
    let state = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state;
    state = reduce(state, { type: 'RESPOND_TRADE', actorId: 'p2', response: 'accept' }).state;

    const res = reduce(state, { type: 'CONFIRM_TRADE', actorId: 'p1', partnerId: 'p2' });
    const p1 = res.state.players.find((p) => p.id === 'p1')!;
    const p2 = res.state.players.find((p) => p.id === 'p2')!;
    expect(p1.hand).toMatchObject({ wood: 0, brick: 1 });
    expect(p2.hand).toMatchObject({ brick: 1, wood: 2 });
    expect(res.state.trade).toBeNull();
    expect(res.events).toContainEqual({ type: 'TRADE_CONFIRMED', proposer: 'p1', partnerId: 'p2' });
  });

  it('cannot confirm a player who has not accepted', () => {
    let state = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state;
    state = reduce(state, { type: 'RESPOND_TRADE', actorId: 'p2', response: 'decline' }).state;
    expect(() => reduce(state, { type: 'CONFIRM_TRADE', actorId: 'p1', partnerId: 'p2' })).toThrow(/not accepted/);
  });

  it('rejects confirmation if the partner can no longer afford their side', () => {
    let state = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state;
    state = reduce(state, { type: 'RESPOND_TRADE', actorId: 'p2', response: 'accept' }).state;
    // p2 loses their brick before confirmation
    state = withHand(state, 'p2', { brick: 0 });
    expect(() => reduce(state, { type: 'CONFIRM_TRADE', actorId: 'p1', partnerId: 'p2' })).toThrow(/afford/);
  });

  it('does not block on a non-responding player: another accepter can still confirm', () => {
    let state = withHand(reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state, 'p3', { brick: 5 });
    // p2 never responds; p3 accepts
    state = reduce(state, { type: 'RESPOND_TRADE', actorId: 'p3', response: 'accept' }).state;
    const res = reduce(state, { type: 'CONFIRM_TRADE', actorId: 'p1', partnerId: 'p3' });
    expect(res.state.trade).toBeNull();
    expect(res.state.players.find((p) => p.id === 'p3')!.hand).toMatchObject({ wood: 2 });
  });
});

describe('cancel', () => {
  it('lets the proposer cancel and clears the proposal', () => {
    const state = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state;
    const res = reduce(state, { type: 'CANCEL_TRADE', actorId: 'p1' });
    expect(res.state.trade).toBeNull();
    expect(res.events).toContainEqual({ type: 'TRADE_CANCELLED', proposer: 'p1' });
  });

  it('non-proposers cannot cancel', () => {
    const state = reduce(ready(), { type: 'PROPOSE_TRADE', actorId: 'p1', ...OFFER }).state;
    expect(() => reduce(state, { type: 'CANCEL_TRADE', actorId: 'p2' })).toThrow(/proposer/);
  });
});
