/**
 * Bot decision-policy tests (issue 0017): drive the pure `decideBotMove` and
 * assert the chosen RNG-free move and that feeding it back through `reduce`
 * (with server RNG filled in) is always legal and makes progress. No server or
 * socket — same style as the reducer tests.
 */

import { describe, expect, it } from 'vitest';
import {
  Action,
  BOARD,
  BotMove,
  GameState,
  Resource,
  decideBotMove,
  initialState,
  pickRandomCard,
  reduce,
} from '../src/index.js';
import { run, seededRng, startAction } from './helpers.js';

const JOINS: Action[] = [
  { type: 'JOIN', playerId: 'p1', name: 'Alice', color: 'red' },
  { type: 'JOIN', playerId: 'p2', name: 'Bob', color: 'blue' },
  { type: 'JOIN', playerId: 'p3', name: 'Cara', color: 'orange' },
];

function started(seed = 1): GameState {
  return run(initialState(), [...JOINS, startAction('p1', seed)]);
}

function pip(token: number | null): number {
  return token == null ? 0 : 6 - Math.abs(7 - token);
}
function vertexPips(state: GameState, v: number): number {
  const tokens = state.board!.setup.tileTokens;
  return BOARD.vertices[v].tiles.reduce((s, t) => s + pip(tokens[t]), 0);
}

/** Which seat the game is waiting on (drive every seat, ignoring isBot). */
function owing(s: GameState): string | null {
  if (s.phase === 'SETUP') return s.players[s.turnIndex]?.id ?? null;
  if (s.phase === 'PLAY') {
    if (s.turnPhase === 'DISCARD' && s.discard) return Object.keys(s.discard.required)[0] ?? null;
    return s.players[s.turnIndex]?.id ?? null;
  }
  return null;
}

const steal = seededRng(7);

/** Translate a bot move into a full action, filling server RNG (dice/steal). */
function toAction(s: GameState, id: string, move: BotMove, dice: () => [number, number]): Action {
  switch (move.kind) {
    case 'placeSetupSettlement':
      return { type: 'PLACE_SETUP_SETTLEMENT', actorId: id, vertex: move.vertex };
    case 'placeSetupRoad':
      return { type: 'PLACE_SETUP_ROAD', actorId: id, edge: move.edge };
    case 'roll':
      return { type: 'ROLL', actorId: id, dice: dice() };
    case 'discard':
      return { type: 'DISCARD', actorId: id, discard: move.resources };
    case 'moveRobber': {
      const victim = move.stealFrom ? s.players.find((p) => p.id === move.stealFrom)! : null;
      return {
        type: 'MOVE_ROBBER',
        actorId: id,
        tile: move.tile,
        stealFrom: move.stealFrom,
        stolen: victim ? pickRandomCard(victim.hand, steal) : null,
      };
    }
    case 'endTurn':
      return { type: 'END_TURN', actorId: id };
  }
}

/** Play the whole snake draft using the bot policy; returns the PLAY state. */
function driveSetup(state: GameState, dice: () => [number, number] = () => [2, 3]): GameState {
  let s = state;
  for (let guard = 0; guard < 200 && s.phase === 'SETUP'; guard++) {
    const id = owing(s)!;
    const move = decideBotMove(s, id)!;
    s = reduce(s, toAction(s, id, move, dice)).state;
  }
  return s;
}

/** Auto-play `turns` full PLAY turns via the bot policy, asserting termination. */
function autoPlay(state: GameState, dice: () => [number, number], turns: number): GameState {
  const target = state.turnNumber + turns;
  let s = state;
  let steps = 0;
  while (s.turnNumber < target && s.phase === 'PLAY') {
    if (steps++ > 5000) throw new Error('bot loop did not terminate');
    const id = owing(s);
    if (!id) throw new Error('no seat owes input');
    const move = decideBotMove(s, id);
    if (!move) throw new Error('decideBotMove returned null for an owing seat');
    s = reduce(s, toAction(s, id, move, dice)).state;
  }
  return s;
}

describe('decideBotMove — setup', () => {
  it('places a setup settlement on the highest-pip legal vertex', () => {
    const s = started();
    const move = decideBotMove(s, 'p1')!;
    expect(move.kind).toBe('placeSetupSettlement');
    const vertex = (move as { vertex: number }).vertex;
    // satisfies the distance rule and is the maximum pip value among legal spots.
    expect(s.board!.buildings[vertex]).toBeUndefined();
    let maxPips = -1;
    for (let v = 0; v < BOARD.vertices.length; v++) {
      if (BOARD.vertices[v].vertices.every((n) => !s.board!.buildings[n])) {
        maxPips = Math.max(maxPips, vertexPips(s, v));
      }
    }
    expect(vertexPips(s, vertex)).toBe(maxPips);
  });

  it('then places a setup road on a free edge of that settlement', () => {
    let s = started();
    const settle = decideBotMove(s, 'p1') as { vertex: number };
    s = reduce(s, { type: 'PLACE_SETUP_SETTLEMENT', actorId: 'p1', vertex: settle.vertex }).state;
    const road = decideBotMove(s, 'p1')!;
    expect(road.kind).toBe('placeSetupRoad');
    const edge = (road as { edge: number }).edge;
    expect(BOARD.edges[edge].vertices).toContain(settle.vertex);
    // It is legal: reduce accepts it.
    expect(() => reduce(s, { type: 'PLACE_SETUP_ROAD', actorId: 'p1', edge }).state).not.toThrow();
  });

  it('drives the whole snake draft to PLAY without stalling', () => {
    const play = driveSetup(started());
    expect(play.phase).toBe('PLAY');
    expect(play.turnPhase).toBe('MUST_ROLL');
    // Every seat placed two settlements.
    const counts = play.players.map(
      (p) => Object.values(play.board!.buildings).filter((b) => b.owner === p.id).length,
    );
    expect(counts).toEqual([2, 2, 2]);
  });
});

describe('decideBotMove — turn loop', () => {
  it('rolls when it must, then ends the turn in ACTIONS', () => {
    const play = driveSetup(started());
    expect(decideBotMove(play, play.players[play.turnIndex].id)).toEqual({ kind: 'roll' });
    const rolled = reduce(play, { type: 'ROLL', actorId: play.players[play.turnIndex].id, dice: [2, 3] }).state;
    expect(rolled.turnPhase).toBe('ACTIONS');
    expect(decideBotMove(rolled, rolled.players[rolled.turnIndex].id)).toEqual({ kind: 'endTurn' });
  });

  it('cycles many turns to completion (non-7 rolls)', () => {
    const play = driveSetup(started());
    const after = autoPlay(play, () => [2, 3], 12);
    expect(after.turnNumber).toBe(play.turnNumber + 12);
    expect(after.phase).toBe('PLAY');
  });

  it('handles a 7 every turn (move robber) without stalling', () => {
    const play = driveSetup(started());
    const after = autoPlay(play, () => [3, 4], 9); // every roll is a 7
    expect(after.turnNumber).toBe(play.turnNumber + 9);
  });

  it('is deterministic: the same state yields the same move', () => {
    const play = driveSetup(started());
    const id = play.players[play.turnIndex].id;
    expect(decideBotMove(play, id)).toEqual(decideBotMove(play, id));
  });
});

describe('decideBotMove — the 7', () => {
  it('discards exactly the required count from the largest holdings', () => {
    const play = driveSetup(started());
    const p1 = play.players[0];
    const hand = { brick: 5, wood: 3, sheep: 0, wheat: 0, ore: 0 };
    const state: GameState = {
      ...play,
      turnPhase: 'DISCARD',
      discard: { required: { [p1.id]: 4 } },
      players: play.players.map((p) => (p.id === p1.id ? { ...p, hand } : p)),
    };
    const move = decideBotMove(state, p1.id)!;
    expect(move.kind).toBe('discard');
    const res = (move as { resources: Partial<Record<Resource, number>> }).resources;
    const total = Object.values(res).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(4);
    // From the largest holdings first: 3 brick + 1 wood.
    expect(res).toEqual({ brick: 3, wood: 1 });
    // And the reducer accepts it.
    expect(() => reduce(state, { type: 'DISCARD', actorId: p1.id, discard: res })).not.toThrow();
  });

  it('moves the robber to a legal tile and steals legally', () => {
    const play = driveSetup(started());
    const id = play.players[play.turnIndex].id;
    const state: GameState = { ...play, turnPhase: 'MOVE_ROBBER' };
    const move = decideBotMove(state, id)!;
    expect(move.kind).toBe('moveRobber');
    const m = move as { tile: number; stealFrom: string | null };
    expect(m.tile).not.toBe(state.board!.robberTile);
    // The reducer accepts the move with server-filled steal.
    expect(() => reduce(state, toAction(state, id, move, () => [2, 3]))).not.toThrow();
  });
});
