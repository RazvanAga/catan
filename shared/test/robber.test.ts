/**
 * The 7 (issue 0009): forced-discard math across multiple players, the robber
 * move's legality, the random steal (outcome injected as action data), and the
 * robber blocking production on its tile. Built on a real post-setup board so
 * adjacency and ownership are genuine; hands are set explicitly via `withHand`.
 */

import { describe, expect, it } from 'vitest';
import { BOARD, GameState, reduce, robberVictims } from '../src/index.js';
import { distributeProduction } from '../src/rules/turn.js';
import { playThroughSetup, withHand } from './game-helpers.js';

/** Roll a 7 for the active player (3+4), returning the resulting state. */
function rollSeven(state: GameState, actor = 'p1'): GameState {
  return reduce(state, { type: 'ROLL', actorId: actor, dice: [3, 4] }).state;
}

/** Find a tile carrying a building owned by someone other than `actor`. */
function tileWithVictim(state: GameState, actor: string): { tileId: number; victim: string } {
  const board = state.board!;
  for (const tile of BOARD.tiles) {
    for (const vid of tile.vertices) {
      const b = board.buildings[vid];
      if (b && b.owner !== actor) return { tileId: tile.id, victim: b.owner };
    }
  }
  throw new Error('no victim tile');
}

describe('forced discards on a 7', () => {
  it('requires half (rounded down) only from players holding more than 7', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    state = withHand(state, 'p1', { wood: 12 }); // > 7 -> discard 6
    state = withHand(state, 'p2', { brick: 8 }); // > 7 -> discard 4
    state = withHand(state, 'p3', { sheep: 7 }); // exactly 7 -> no discard

    const res = reduce(state, { type: 'ROLL', actorId: 'p1', dice: [3, 4] });
    expect(res.state.turnPhase).toBe('DISCARD');
    expect(res.state.discard).toEqual({ required: { p1: 6, p2: 4 } });
    expect(res.events).toContainEqual({ type: 'DISCARD_REQUIRED', playerId: 'p1', count: 6 });
    expect(res.events).toContainEqual({ type: 'DISCARD_REQUIRED', playerId: 'p2', count: 4 });
    expect(res.events.some((e) => e.type === 'DISCARD_REQUIRED' && e.playerId === 'p3')).toBe(false);
  });

  it('proceeds to MOVE_ROBBER only once every required discard is in', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    state = withHand(state, 'p1', { wood: 12 });
    state = withHand(state, 'p2', { brick: 8 });
    state = rollSeven(state);

    // p3 owes nothing.
    expect(() => reduce(state, { type: 'DISCARD', actorId: 'p3', discard: { sheep: 1 } })).toThrow(
      /do not need to discard/i,
    );
    // Wrong count is rejected.
    expect(() => reduce(state, { type: 'DISCARD', actorId: 'p1', discard: { wood: 5 } })).toThrow(
      /exactly 6/i,
    );
    // Can't discard cards you don't hold.
    expect(() => reduce(state, { type: 'DISCARD', actorId: 'p1', discard: { ore: 6 } })).toThrow(
      /do not have/i,
    );

    state = reduce(state, { type: 'DISCARD', actorId: 'p1', discard: { wood: 6 } }).state;
    expect(state.turnPhase).toBe('DISCARD'); // still waiting on p2
    expect(state.players.find((p) => p.id === 'p1')!.hand.wood).toBe(6);

    const done = reduce(state, { type: 'DISCARD', actorId: 'p2', discard: { brick: 4 } });
    expect(done.state.turnPhase).toBe('MOVE_ROBBER');
    expect(done.state.discard).toBeNull();
    expect(done.state.players.find((p) => p.id === 'p2')!.hand.brick).toBe(4);
  });
});

describe('moving the robber', () => {
  it('lets only the active player move it, and only to a different tile', () => {
    const state = rollSeven(playThroughSetup(['p1', 'p2', 'p3']));
    expect(state.turnPhase).toBe('MOVE_ROBBER');
    const here = state.board!.robberTile;

    expect(() =>
      reduce(state, { type: 'MOVE_ROBBER', actorId: 'p2', tile: 0, stealFrom: null, stolen: null }),
    ).toThrow(/active player/i);
    expect(() =>
      reduce(state, { type: 'MOVE_ROBBER', actorId: 'p1', tile: here, stealFrom: null, stolen: null }),
    ).toThrow(/different tile/i);
  });

  it('moves with no steal when the destination has no card-holding neighbour', () => {
    const state = rollSeven(playThroughSetup(['p1', 'p2', 'p3']));
    const here = state.board!.robberTile;
    const empty = BOARD.tiles.find((t) => t.id !== here && robberVictims(state, t.id, 'p1').length === 0)!;

    const res = reduce(state, {
      type: 'MOVE_ROBBER',
      actorId: 'p1',
      tile: empty.id,
      stealFrom: null,
      stolen: null,
    });
    expect(res.state.board!.robberTile).toBe(empty.id);
    expect(res.state.turnPhase).toBe('ACTIONS');
    expect(res.events).toContainEqual({ type: 'ROBBER_MOVED', playerId: 'p1', tile: empty.id });
    expect(res.events.some((e) => e.type === 'CARD_STOLEN')).toBe(false);
  });
});

describe('stealing', () => {
  it('transfers the injected card from an adjacent victim to the active player', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const { tileId, victim } = tileWithVictim(state, 'p1');
    // Zero both hands so the transfer is unambiguous (setup grants starting cards).
    state = withHand(state, 'p1', {});
    state = withHand(state, victim, { ore: 1 });
    state = rollSeven(state);

    const res = reduce(state, {
      type: 'MOVE_ROBBER',
      actorId: 'p1',
      tile: tileId,
      stealFrom: victim,
      stolen: 'ore',
    });
    expect(res.state.players.find((p) => p.id === victim)!.hand.ore).toBe(0);
    expect(res.state.players.find((p) => p.id === 'p1')!.hand.ore).toBe(1);
    expect(res.events).toContainEqual({ type: 'CARD_STOLEN', from: victim, to: 'p1' });
    // The stolen resource is never named in the public event log.
    const stolenEvent = res.events.find((e) => e.type === 'CARD_STOLEN')!;
    expect(stolenEvent).not.toHaveProperty('resource');
  });

  it('rejects stealing a card the victim does not hold', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const { tileId, victim } = tileWithVictim(state, 'p1');
    state = withHand(state, victim, { ore: 1 });
    state = rollSeven(state);
    expect(() =>
      reduce(state, { type: 'MOVE_ROBBER', actorId: 'p1', tile: tileId, stealFrom: victim, stolen: 'wheat' }),
    ).toThrow(/does not have/i);
  });

  it('requires a steal when an eligible victim is adjacent', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const { tileId, victim } = tileWithVictim(state, 'p1');
    state = withHand(state, victim, { ore: 1 });
    state = rollSeven(state);
    expect(() =>
      reduce(state, { type: 'MOVE_ROBBER', actorId: 'p1', tile: tileId, stealFrom: null, stolen: null }),
    ).toThrow(/must steal/i);
  });

  it('rejects stealing from a player not adjacent to the robber', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const { tileId, victim } = tileWithVictim(state, 'p1');
    state = withHand(state, victim, { ore: 1 });
    state = rollSeven(state);
    const outsider = ['p1', 'p2', 'p3'].find(
      (id) => id !== 'p1' && !robberVictims(state, tileId, 'p1').includes(id),
    );
    if (outsider) {
      state = withHand(state, outsider, { ore: 1 });
      expect(() =>
        reduce(state, { type: 'MOVE_ROBBER', actorId: 'p1', tile: tileId, stealFrom: outsider, stolen: 'ore' }),
      ).toThrow(/cannot steal from/i);
    }
  });
});

describe('robber blocks production', () => {
  it('a tile under the robber yields nothing on its token', () => {
    const state = playThroughSetup(['p1', 'p2', 'p3']);
    const board = state.board!;

    // A producing tile that has a building and a number token.
    const tile = BOARD.tiles.find(
      (t) =>
        t.id !== board.robberTile &&
        board.setup.tileResources[t.id] !== 'desert' &&
        board.setup.tileTokens[t.id] != null &&
        t.vertices.some((v) => board.buildings[v]),
    )!;
    const token = board.setup.tileTokens[tile.id]!;

    const sumGrants = (grants: [string, Partial<Record<string, number>>][]): number => {
      let total = 0;
      for (const [, g] of grants) for (const n of Object.values(g)) total += n ?? 0;
      return total;
    };

    const without = sumGrants(distributeProduction(state, token).grants);
    const robbed: GameState = { ...state, board: { ...board, robberTile: tile.id } };
    const withRobber = sumGrants(distributeProduction(robbed, token).grants);

    expect(withRobber).toBeLessThan(without);
  });
});
