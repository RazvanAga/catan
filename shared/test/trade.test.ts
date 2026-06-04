/**
 * Bank & port trading: the 4:1 default, 3:1 with a generic port, 2:1 with the
 * matching specific port (and not for other resources), best-ratio selection,
 * phase gating, and unaffordable rejection. Port ownership is set by placing a
 * building on a known port vertex and fixing that port's type in the input state.
 */

import { describe, expect, it } from 'vitest';
import { BOARD, GameState, PortType, reduce } from '../src/index.js';
import { inActions, playThroughSetup, withHand } from './game-helpers.js';

const PLAYERS = ['p1', 'p2', 'p3'];

/** Give p1 a building on `port`'s first vertex and set that port's type. */
function withPort(state: GameState, portId: number, type: PortType): GameState {
  const board = state.board!;
  const vertex = BOARD.ports[portId].vertices[0];
  const portTypes = [...board.setup.portTypes];
  portTypes[portId] = type;
  return {
    ...state,
    board: {
      ...board,
      setup: { ...board.setup, portTypes },
      buildings: { ...board.buildings, [vertex]: { owner: 'p1', city: false } },
    },
  };
}

describe('bank trade', () => {
  it('defaults to 4:1', () => {
    const state = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { wood: 4 }));
    const { state: after, events } = reduce(state, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'brick' });
    expect(after.players[0].hand).toMatchObject({ wood: 0, brick: 1 });
    expect(events).toContainEqual({ type: 'BANK_TRADE', playerId: 'p1', give: 'wood', count: 4, receive: 'brick' });
  });

  it('rejects when the player cannot cover the ratio', () => {
    const state = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { wood: 3 }));
    expect(() => reduce(state, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'brick' })).toThrow(/need 4/);
  });

  it('rejects trading a resource for itself', () => {
    const state = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { wood: 4 }));
    expect(() => reduce(state, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'wood' })).toThrow(/different/);
  });

  it('uses 3:1 with a generic port', () => {
    const state = inActions(withHand(withPort(playThroughSetup(PLAYERS), 0, '3:1'), 'p1', { wood: 3 }));
    const { state: after } = reduce(state, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'ore' });
    expect(after.players[0].hand).toMatchObject({ wood: 0, ore: 1 });
  });

  it('uses 2:1 only for the matching specific port resource', () => {
    const withWoodPort = withPort(playThroughSetup(PLAYERS), 0, 'wood');
    // 2:1 applies to wood
    const woodState = inActions(withHand(withWoodPort, 'p1', { wood: 2 }));
    const after = reduce(woodState, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'brick' }).state;
    expect(after.players[0].hand).toMatchObject({ wood: 0, brick: 1 });

    // but giving sheep still costs 4 (no sheep port)
    const sheepState = inActions(withHand(withWoodPort, 'p1', { sheep: 3 }));
    expect(() => reduce(sheepState, { type: 'TRADE_BANK', actorId: 'p1', give: 'sheep', receive: 'brick' })).toThrow(/need 4/);
  });

  it('only allowed in the ACTIONS phase', () => {
    const state = withHand(playThroughSetup(PLAYERS), 'p1', { wood: 4 }); // MUST_ROLL
    expect(() => reduce(state, { type: 'TRADE_BANK', actorId: 'p1', give: 'wood', receive: 'brick' })).toThrow(/after rolling/);
  });
});
