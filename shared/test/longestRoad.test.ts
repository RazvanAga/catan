/**
 * Longest Road bonus (issue 0011). The pure length computation is exercised on
 * synthetic road shapes built directly from the frozen `BOARD` graph (straight,
 * looping, branching), and the bonus award/transfer/revoke flow is driven
 * through `recomputeLongestRoad` and the reducer.
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD,
  BoardState,
  GameState,
  Road,
  playerLongestRoad,
  recomputeLongestRoad,
} from '../src/index.js';
import { withHand } from './game-helpers.js';
import { reduce } from '../src/index.js';

/** A bare board carrying only the roads/buildings the length math reads. */
function boardWith(roads: Record<number, Road>, buildings: BoardState['buildings'] = {}): BoardState {
  return { setup: null as never, robberTile: 0, roads, buildings };
}

const owned = (edges: number[], owner: string): Record<number, Road> =>
  Object.fromEntries(edges.map((e) => [e, { owner }]));

/** The other endpoint of `edge` from `v`. */
function across(edge: number, v: number): number {
  const [a, b] = BOARD.edges[edge].vertices;
  return a === v ? b : a;
}

/** A simple (vertex-disjoint) path of `len` edges starting at `start`. */
function simplePath(start: number, len: number, seen = new Set<number>([start])): number[] {
  const edges: number[] = [];
  let v = start;
  while (edges.length < len) {
    const e = BOARD.vertices[v].edges.find((eid) => !edges.includes(eid) && !seen.has(across(eid, v)));
    if (e == null) throw new Error('cannot extend path');
    const w = across(e, v);
    edges.push(e);
    seen.add(w);
    v = w;
  }
  return edges;
}

describe('playerLongestRoad', () => {
  it('is 0 with no roads', () => {
    expect(playerLongestRoad(boardWith({}), 'p1')).toBe(0);
  });

  it('counts a straight chain edge-for-edge', () => {
    const path = simplePath(0, 5);
    expect(playerLongestRoad(boardWith(owned(path, 'p1')), 'p1')).toBe(5);
  });

  it('walks a closed loop all the way around', () => {
    // A tile's six edges form a 6-cycle; the longest trail traverses all six.
    const loop = BOARD.tiles[0].edges;
    expect(playerLongestRoad(boardWith(owned(loop, 'p1')), 'p1')).toBe(6);
  });

  it('routes through a junction using the two longest branches, not all three', () => {
    // A vertex with three incident edges, each grown into a disjoint arm.
    const junction = BOARD.vertices.find((v) => v.edges.length === 3)!.id;
    const seen = new Set<number>([junction]);
    const [e1, e2, e3] = BOARD.vertices[junction].edges;
    // Arm A: 3 edges, Arm B: 2 edges, Arm C: 1 edge.
    const armA = [e1, ...simplePath(across(e1, junction), 2, seen)];
    const armB = [e2, ...simplePath(across(e2, junction), 1, seen)];
    const armC = [e3];
    seen.add(across(e3, junction));
    const roads = owned([...armA, ...armB, ...armC], 'p1');
    // Best trail through the junction = arm A (3) + arm B (2) = 5, never 3+2+1.
    expect(playerLongestRoad(boardWith(roads), 'p1')).toBe(5);
  });

  it('is broken by an opponent building sitting mid-path', () => {
    const path = simplePath(0, 5);
    // The vertex shared by the 2nd and 3rd edges, three roads in from the start.
    const [a, b] = BOARD.edges[path[2]].vertices;
    const e1 = BOARD.edges[path[1]].vertices;
    const mid = e1.includes(a) ? a : b;
    const split = boardWith(owned(path, 'p1'), { [mid]: { owner: 'p2', city: false } });
    // The opponent's building severs the trail; neither side alone is 5.
    expect(playerLongestRoad(split, 'p1')).toBeLessThan(5);
    // The player's *own* building never blocks them.
    const mine = boardWith(owned(path, 'p1'), { [mid]: { owner: 'p1', city: false } });
    expect(playerLongestRoad(mine, 'p1')).toBe(5);
  });
});

/** A minimal PLAY-phase state carrying the given board and seated players. */
function stateWith(ids: string[], roads: Record<number, Road>): GameState {
  const players = ids.map((id, i) => ({
    id,
    name: id,
    color: (['red', 'blue', 'orange', 'white'] as const)[i],
    connected: true,
    vacant: false,
    hand: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 },
    devCards: [],
    knightsPlayed: 0,
  }));
  return {
    phase: 'PLAY',
    players,
    previousWinnerId: null,
    board: boardWith(roads),
    setup: null,
    turnIndex: 0,
    turnPhase: 'ACTIONS',
    turnNumber: 1,
    lastRoll: [3, 4],
    devDeck: [],
    devCardPlayedThisTurn: false,
    bonuses: { longestRoad: null, longestRoadLength: 0, largestArmy: null, largestArmyCount: 0 },
    trade: null,
    discard: null,
    winner: null,
  };
}

describe('recomputeLongestRoad', () => {
  it('awards nothing below the length-5 threshold', () => {
    const four = stateWith(['p1', 'p2'], owned(simplePath(0, 4), 'p1'));
    const { bonuses, events } = recomputeLongestRoad(four);
    expect(bonuses.longestRoad).toBeNull();
    expect(events).toHaveLength(0);
  });

  it('awards the bonus to the first player to reach 5', () => {
    const five = stateWith(['p1', 'p2'], owned(simplePath(0, 5), 'p1'));
    const { bonuses, events } = recomputeLongestRoad(five);
    expect(bonuses).toMatchObject({ longestRoad: 'p1', longestRoadLength: 5 });
    expect(events).toContainEqual({ type: 'LONGEST_ROAD', playerId: 'p1', length: 5 });
  });

  it('transfers only when another player strictly surpasses the holder', () => {
    const p1Path = simplePath(0, 5);
    // Build a 6-long path for p2 in a far corner of the board.
    const p2Path = simplePath(40, 6);
    const roads = { ...owned(p1Path, 'p1'), ...owned(p2Path, 'p2') };
    const held: GameState = {
      ...stateWith(['p1', 'p2'], roads),
      bonuses: { longestRoad: 'p1', longestRoadLength: 5, largestArmy: null, largestArmyCount: 0 },
    };

    // p2 has 6 > 5: transfer.
    const surpass = recomputeLongestRoad(held);
    expect(surpass.bonuses).toMatchObject({ longestRoad: 'p2', longestRoadLength: 6 });
    expect(surpass.events).toContainEqual({ type: 'LONGEST_ROAD', playerId: 'p2', length: 6 });

    // If p2 only ties at 5, the holder keeps it.
    const tieRoads = { ...owned(p1Path, 'p1'), ...owned(simplePath(40, 5), 'p2') };
    const tie = recomputeLongestRoad({ ...held, board: boardWith(tieRoads) });
    expect(tie.bonuses.longestRoad).toBe('p1');
    expect(tie.events).toHaveLength(0);
  });

  it('revokes the bonus when a broken network drops the holder below 5', () => {
    const path = simplePath(0, 5);
    const [a, b] = BOARD.edges[path[2]].vertices;
    const e1 = BOARD.edges[path[1]].vertices;
    const mid = e1.includes(a) ? a : b;
    const held: GameState = {
      ...stateWith(['p1', 'p2'], owned(path, 'p1')),
      board: boardWith(owned(path, 'p1'), { [mid]: { owner: 'p2', city: false } }),
      bonuses: { longestRoad: 'p1', longestRoadLength: 5, largestArmy: null, largestArmyCount: 0 },
    };
    const { bonuses, events } = recomputeLongestRoad(held);
    expect(bonuses.longestRoad).toBeNull();
    expect(bonuses.longestRoadLength).toBe(0);
    expect(events).toContainEqual({ type: 'LONGEST_ROAD', playerId: null, length: 0 });
  });
});

describe('Longest Road through the reducer', () => {
  it('awards the bonus when a built road completes a length-5 chain', () => {
    const path = simplePath(0, 5);
    // p1 already owns the first four edges; building the fifth reaches 5.
    let state = stateWith(['p1', 'p2', 'p3'], owned(path.slice(0, 4), 'p1'));
    state = withHand(state, 'p1', { brick: 1, wood: 1 });

    const res = reduce(state, { type: 'BUILD_ROAD', actorId: 'p1', edge: path[4] });
    expect(res.state.bonuses).toMatchObject({ longestRoad: 'p1', longestRoadLength: 5 });
    expect(res.events).toContainEqual({ type: 'LONGEST_ROAD', playerId: 'p1', length: 5 });
  });
});
