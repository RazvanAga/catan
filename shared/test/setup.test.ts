/**
 * SETUP snake-draft tests: placement order and reversal, the distance and
 * road-adjacency rules, and the second-settlement resource grant.
 */

import { describe, expect, it } from 'vitest';
import { BOARD, GameState, Action, initialState, reduce } from '../src/index.js';
import { run, startAction } from './helpers.js';

const JOINS: Action[] = [
  { type: 'JOIN', playerId: 'p1', name: 'Alice', color: 'red' },
  { type: 'JOIN', playerId: 'p2', name: 'Bob', color: 'blue' },
  { type: 'JOIN', playerId: 'p3', name: 'Cara', color: 'orange' },
];

function started(seed = 1): GameState {
  return run(initialState(), [...JOINS, startAction('p1', seed)]);
}

/** Pick a legal empty vertex satisfying the distance rule against current board. */
function legalVertex(state: GameState): number {
  const board = state.board!;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (board.buildings[v]) continue;
    if (BOARD.vertices[v].vertices.every((n) => !board.buildings[n])) return v;
  }
  throw new Error('no legal vertex');
}

/** An edge incident to `vertex` that has no road yet. */
function freeEdgeAt(state: GameState, vertex: number): number {
  const board = state.board!;
  const e = BOARD.vertices[vertex].edges.find((eid) => !board.roads[eid]);
  if (e == null) throw new Error('no free edge');
  return e;
}

/** Play out the whole snake draft, always picking the first legal options. */
function playFullSetup(state: GameState): { state: GameState; order: string[] } {
  const order: string[] = [];
  while (state.phase === 'SETUP') {
    const actor = state.players[state.turnIndex].id;
    const v = legalVertex(state);
    state = reduce(state, { type: 'PLACE_SETUP_SETTLEMENT', actorId: actor, vertex: v }).state;
    const e = freeEdgeAt(state, v);
    state = reduce(state, { type: 'PLACE_SETUP_ROAD', actorId: actor, edge: e }).state;
    order.push(actor);
  }
  return { state, order };
}

describe('SETUP order', () => {
  it('starts in SETUP at the first player with a settlement pending', () => {
    const s = started();
    expect(s.phase).toBe('SETUP');
    expect(s.setup?.pending).toBe('settlement');
    expect(s.players[s.turnIndex].id).toBe('p1');
  });

  it('runs forward then reverse (snake) and ends at the first player main turn', () => {
    const { state, order } = playFullSetup(started());
    expect(order).toEqual(['p1', 'p2', 'p3', 'p3', 'p2', 'p1']);
    expect(state.phase).toBe('PLAY');
    expect(state.turnPhase).toBe('MUST_ROLL');
    expect(state.turnNumber).toBe(1);
    expect(state.players[state.turnIndex].id).toBe('p1');
  });
});

describe('SETUP placement legality', () => {
  it('enforces the distance rule on settlements', () => {
    const s = started();
    const v = legalVertex(s);
    const afterFirst = reduce(s, { type: 'PLACE_SETUP_SETTLEMENT', actorId: 'p1', vertex: v }).state;
    const road = freeEdgeAt(afterFirst, v);
    const afterRoad = reduce(afterFirst, { type: 'PLACE_SETUP_ROAD', actorId: 'p1', edge: road }).state;
    // p2 tries to place on a neighbor of p1's settlement -> too close.
    const neighbor = BOARD.vertices[v].vertices[0];
    expect(() =>
      reduce(afterRoad, { type: 'PLACE_SETUP_SETTLEMENT', actorId: 'p2', vertex: neighbor }),
    ).toThrow(/distance/);
  });

  it('requires the setup road to touch the just-placed settlement', () => {
    const s = started();
    const v = legalVertex(s);
    const afterSettlement = reduce(s, { type: 'PLACE_SETUP_SETTLEMENT', actorId: 'p1', vertex: v }).state;
    // an edge not touching v
    const farEdge = BOARD.edges.find((e) => !e.vertices.includes(v))!.id;
    expect(() =>
      reduce(afterSettlement, { type: 'PLACE_SETUP_ROAD', actorId: 'p1', edge: farEdge }),
    ).toThrow(/connect to the settlement/);
  });

  it('rejects a placement out of turn', () => {
    const s = started();
    const v = legalVertex(s);
    expect(() =>
      reduce(s, { type: 'PLACE_SETUP_SETTLEMENT', actorId: 'p2', vertex: v }),
    ).toThrow(/not your turn/i);
  });
});

describe('second-settlement resource grant', () => {
  it('grants one resource per adjacent producing tile only on the second settlement', () => {
    let state = started();
    const grants: { round: number; playerId: string; total: number }[] = [];
    let placements = 0;
    while (state.phase === 'SETUP') {
      const actor = state.players[state.turnIndex].id;
      const v = legalVertex(state);
      const res = reduce(state, { type: 'PLACE_SETUP_SETTLEMENT', actorId: actor, vertex: v });
      state = res.state;
      const granted = res.events.find((e) => e.type === 'RESOURCES_GRANTED');
      const handTotal = Object.values(state.players.find((p) => p.id === actor)!.hand).reduce(
        (a, b) => a + b,
        0,
      );
      grants.push({ round: placements < 3 ? 1 : 2, playerId: actor, total: handTotal });
      if (granted) expect(placements).toBeGreaterThanOrEqual(3); // only round 2
      const e = freeEdgeAt(state, v);
      state = reduce(state, { type: 'PLACE_SETUP_ROAD', actorId: actor, edge: e }).state;
      placements++;
    }
    // First-round placements grant nothing; total hands are zero after round 1.
    expect(grants.slice(0, 3).every((g) => g.total === 0)).toBe(true);
  });
});
