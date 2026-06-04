/**
 * Building tests: cost deduction, road connectivity, the settlement distance +
 * connectivity rules, city-upgrade legality, affordability rejection, and that
 * public VP reflects settlements (1) and cities (2).
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD,
  GameState,
  edgeConnectsToNetwork,
  publicVictoryPoints,
  reduce,
} from '../src/index.js';
import { inActions, playThroughSetup, withHand } from './game-helpers.js';

const PLAYERS = ['p1', 'p2', 'p3'];

/** A free edge connected to p1's network (so a road is legal there). */
function buildableRoadEdge(state: GameState): number {
  const board = state.board!;
  for (let e = 0; e < BOARD.edges.length; e++) {
    if (board.roads[e]) continue;
    if (edgeConnectsToNetwork(board, e, 'p1')) return e;
  }
  throw new Error('no buildable road');
}

/**
 * A free edge connected to p1's network whose far endpoint is a distance-legal
 * empty vertex — i.e. building this road then settling there is legal. (Right
 * after setup, every vertex on p1's roads is within the distance rule of p1's
 * own settlement, so a settlement requires first extending a road outward.)
 */
function reachableNewVertex(state: GameState): { edge: number; vertex: number } {
  const board = state.board!;
  for (let e = 0; e < BOARD.edges.length; e++) {
    if (board.roads[e]) continue;
    if (!edgeConnectsToNetwork(board, e, 'p1')) continue;
    for (const w of BOARD.edges[e].vertices) {
      if (board.buildings[w]) continue;
      if (BOARD.vertices[w].vertices.every((n) => !board.buildings[n])) return { edge: e, vertex: w };
    }
  }
  throw new Error('no reachable new vertex');
}

describe('build road', () => {
  it('places a connected road and deducts brick + wood', () => {
    const base = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { brick: 1, wood: 1 }));
    const edge = buildableRoadEdge(base);
    const { state } = reduce(base, { type: 'BUILD_ROAD', actorId: 'p1', edge });
    expect(state.board!.roads[edge]).toEqual({ owner: 'p1' });
    expect(state.players[0].hand).toMatchObject({ brick: 0, wood: 0 });
  });

  it('rejects an unaffordable road', () => {
    const base = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { brick: 0, wood: 0 }));
    const edge = buildableRoadEdge(base);
    expect(() => reduce(base, { type: 'BUILD_ROAD', actorId: 'p1', edge })).toThrow(/afford/);
  });

  it('rejects a disconnected road', () => {
    const base = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { brick: 1, wood: 1 }));
    const board = base.board!;
    const disconnected = BOARD.edges.find(
      (e) => !board.roads[e.id] && !edgeConnectsToNetwork(board, e.id, 'p1'),
    )!.id;
    expect(() => reduce(base, { type: 'BUILD_ROAD', actorId: 'p1', edge: disconnected })).toThrow(/connect/);
  });
});

describe('build settlement', () => {
  it('builds on a connected, distance-legal vertex and raises VP', () => {
    // Extend a road outward, then settle at its far end.
    let state = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { brick: 2, wood: 2, sheep: 1, wheat: 1 }));
    const vpBefore = publicVictoryPoints(state, 'p1');

    const { edge, vertex } = reachableNewVertex(state);
    state = reduce(state, { type: 'BUILD_ROAD', actorId: 'p1', edge }).state;
    state = reduce(state, { type: 'BUILD_SETTLEMENT', actorId: 'p1', vertex }).state;

    expect(state.board!.buildings[vertex]).toEqual({ owner: 'p1', city: false });
    // road (brick+wood) + settlement (brick+wood+sheep+wheat) fully spent the hand
    expect(state.players[0].hand).toEqual({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });
    expect(publicVictoryPoints(state, 'p1')).toBe(vpBefore + 1);
  });

  it('rejects a settlement with no connecting road', () => {
    const state = inActions(withHand(playThroughSetup(PLAYERS), 'p1', { brick: 1, wood: 1, sheep: 1, wheat: 1 }));
    const board = state.board!;
    // a free, distance-legal vertex with NO p1 road touching it
    const v = (() => {
      for (let i = 0; i < BOARD.vertices.length; i++) {
        if (board.buildings[i]) continue;
        if (!BOARD.vertices[i].vertices.every((n) => !board.buildings[n])) continue;
        if (!BOARD.vertices[i].edges.some((e) => board.roads[e]?.owner === 'p1')) return i;
      }
      throw new Error('none');
    })();
    expect(() => reduce(state, { type: 'BUILD_SETTLEMENT', actorId: 'p1', vertex: v })).toThrow(/connect/);
  });
});

describe('build city', () => {
  it('upgrades the player own settlement, deducts cost, and adds a VP', () => {
    const setup = playThroughSetup(PLAYERS);
    const myVertex = Number(
      Object.entries(setup.board!.buildings).find(([, b]) => b.owner === 'p1')![0],
    );
    const state = inActions(withHand(setup, 'p1', { ore: 3, wheat: 2 }));
    const vpBefore = publicVictoryPoints(state, 'p1');

    const { state: after } = reduce(state, { type: 'BUILD_CITY', actorId: 'p1', vertex: myVertex });
    expect(after.board!.buildings[myVertex]).toEqual({ owner: 'p1', city: true });
    expect(after.players[0].hand).toMatchObject({ ore: 0, wheat: 0 });
    expect(publicVictoryPoints(after, 'p1')).toBe(vpBefore + 1);
  });

  it("rejects upgrading another player's settlement", () => {
    const setup = playThroughSetup(PLAYERS);
    const oppVertex = Number(
      Object.entries(setup.board!.buildings).find(([, b]) => b.owner === 'p2')![0],
    );
    const state = inActions(withHand(setup, 'p1', { ore: 3, wheat: 2 }));
    expect(() => reduce(state, { type: 'BUILD_CITY', actorId: 'p1', vertex: oppVertex })).toThrow(/your own/);
  });
});

describe('build phase gating', () => {
  it('rejects building before rolling (MUST_ROLL)', () => {
    const state = withHand(playThroughSetup(PLAYERS), 'p1', { brick: 1, wood: 1 });
    const edge = buildableRoadEdge(state);
    expect(() => reduce(state, { type: 'BUILD_ROAD', actorId: 'p1', edge })).toThrow(/after rolling/);
  });
});
