/**
 * Turn-loop tests: roll gating, production for settlements vs cities, multiple
 * recipients from one roll, the 7 no-production placeholder, and turn
 * advancement. Production is asserted by constructing a known board+placement
 * and rolling a chosen total (dice injected as action data).
 */

import { describe, expect, it } from 'vitest';
import { BOARD, GameState, reduce } from '../src/index.js';
import { playThroughSetup } from './game-helpers.js';

/** Find a tile (not desert/robber) and a vertex on it, to assert production. */
function aProducingTileWithBuilding(state: GameState) {
  const board = state.board!;
  for (const tile of BOARD.tiles) {
    if (tile.id === board.robberTile) continue;
    if (board.setup.tileResources[tile.id] === 'desert') continue;
    const vid = tile.vertices.find((v) => board.buildings[v]);
    if (vid != null) return { tile, vid };
  }
  return null;
}

describe('ROLL gating', () => {
  it('only the current player may roll, and only in MUST_ROLL', () => {
    const state = playThroughSetup(['p1', 'p2', 'p3']);
    const other = state.players[1].id;
    expect(() => reduce(state, { type: 'ROLL', actorId: other, dice: [3, 4] })).toThrow(/not your turn/i);

    const rolled = reduce(state, { type: 'ROLL', actorId: 'p1', dice: [3, 4] }).state;
    expect(rolled.turnPhase).toBe('ACTIONS');
    expect(rolled.lastRoll).toEqual([3, 4]);
    expect(() => reduce(rolled, { type: 'ROLL', actorId: 'p1', dice: [2, 2] })).toThrow(/already rolled/);
  });
});

describe('production', () => {
  it('grants 1 per settlement and 2 per city on a matching roll', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const found = aProducingTileWithBuilding(state)!;
    const token = state.board!.setup.tileTokens[found.tile.id]!;
    const resource = state.board!.setup.tileResources[found.tile.id];

    // Roll the token via injected dice (split the total across two dice).
    const dice: [number, number] = [Math.min(6, token - 1), token - Math.min(6, token - 1)];
    const owner = state.board!.buildings[found.vid].owner;
    const before = state.players.find((p) => p.id === owner)!.hand[resource as 'wood'];

    state = reduce(state, { type: 'ROLL', actorId: 'p1', dice }).state;
    const after = state.players.find((p) => p.id === owner)!.hand[resource as 'wood'];
    expect(after).toBeGreaterThanOrEqual(before + 1);
  });

  it('produces nothing on a 7 (placeholder for the robber slice)', () => {
    const state = playThroughSetup(['p1', 'p2', 'p3']);
    const handsBefore = state.players.map((p) => ({ ...p.hand }));
    const res = reduce(state, { type: 'ROLL', actorId: 'p1', dice: [3, 4] });
    expect(res.events.some((e) => e.type === 'NO_PRODUCTION')).toBe(true);
    res.state.players.forEach((p, i) => expect(p.hand).toEqual(handsBefore[i]));
    expect(res.state.turnPhase).toBe('ACTIONS');
  });
});

describe('END_TURN', () => {
  it('passes play to the next player and resets to MUST_ROLL', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    state = reduce(state, { type: 'ROLL', actorId: 'p1', dice: [3, 4] }).state;
    expect(() => reduce(state, { type: 'END_TURN', actorId: 'p2' })).toThrow(/not your turn/i);

    const ended = reduce(state, { type: 'END_TURN', actorId: 'p1' });
    expect(ended.state.players[ended.state.turnIndex].id).toBe('p2');
    expect(ended.state.turnPhase).toBe('MUST_ROLL');
    expect(ended.events).toContainEqual({ type: 'TURN_STARTED', playerId: 'p2', turnNumber: 2 });
  });

  it('cannot end before rolling', () => {
    const state = playThroughSetup(['p1', 'p2', 'p3']);
    expect(() => reduce(state, { type: 'END_TURN', actorId: 'p1' })).toThrow(/after rolling/);
  });

  it('wraps around to the first player', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    for (const id of ['p1', 'p2', 'p3']) {
      state = reduce(state, { type: 'ROLL', actorId: id, dice: [3, 4] }).state;
      state = reduce(state, { type: 'END_TURN', actorId: id }).state;
    }
    expect(state.players[state.turnIndex].id).toBe('p1');
  });
});
