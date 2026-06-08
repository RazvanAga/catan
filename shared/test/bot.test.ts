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
  DevCard,
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
    case 'buildCity':
      return { type: 'BUILD_CITY', actorId: id, vertex: move.vertex };
    case 'buildSettlement':
      return { type: 'BUILD_SETTLEMENT', actorId: id, vertex: move.vertex };
    case 'buildRoad':
      return { type: 'BUILD_ROAD', actorId: id, edge: move.edge };
    case 'buyDevCard':
      return { type: 'BUY_DEV_CARD', actorId: id };
    case 'respondTrade':
      return { type: 'RESPOND_TRADE', actorId: id, response: move.response };
    case 'tradeBank':
      return { type: 'TRADE_BANK', actorId: id, give: move.give, receive: move.receive };
    case 'playDevCard': {
      const p = move.play;
      if (p.card === 'knight') {
        const victim = p.stealFrom ? s.players.find((pl) => pl.id === p.stealFrom)! : null;
        return {
          type: 'PLAY_DEV_CARD',
          actorId: id,
          play: { card: 'knight', tile: p.tile, stealFrom: p.stealFrom, stolen: victim ? pickRandomCard(victim.hand, steal) : null },
        };
      }
      return { type: 'PLAY_DEV_CARD', actorId: id, play: p };
    }
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
    if (steps++ > 50000) throw new Error('bot loop did not terminate');
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

// --- ACTIONS / building (issue 0018) -----------------------------------------

type Hand = Record<Resource, number>;
function setHand(state: GameState, id: string, hand: Partial<Hand>): GameState {
  const full: Hand = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0, ...hand };
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, hand: full } : p)) };
}
/** A PLAY/ACTIONS state for the current player (rolls a non-7 first). */
function inActions(state: GameState): GameState {
  const id = state.players[state.turnIndex].id;
  return reduce(state, { type: 'ROLL', actorId: id, dice: [2, 3] }).state;
}
/** Dice cycling through every producing total (3–6, 8–12) so resources flow. */
function diceCycler(): () => [number, number] {
  const seq: [number, number][] = [[1, 2], [1, 3], [2, 3], [3, 3], [3, 5], [4, 5], [5, 5], [5, 6], [6, 6]];
  let i = 0;
  return () => seq[i++ % seq.length];
}
function buildingPoints(state: GameState): number {
  return Object.values(state.board!.buildings).reduce((a, b) => a + (b.city ? 2 : 1), 0);
}

describe('decideBotMove — ACTIONS building ladder', () => {
  it('prefers upgrading to a city when affordable', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(s, id, { wheat: 2, ore: 3, brick: 1, wood: 1, sheep: 1 }); // affords all builds
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('buildCity');
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('builds a road when only a road is affordable', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(s, id, { brick: 1, wood: 1 });
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('buildRoad');
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('buys a development card with a spare sheep/wheat/ore', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = { ...setHand(s, id, { sheep: 1, wheat: 1, ore: 1 }), devDeck: ['knight'] };
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('buyDevCard');
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('ends the turn when nothing is affordable', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(s, id, {});
    expect(decideBotMove(s, id)).toEqual({ kind: 'endTurn' });
  });

  it('progresses a full bot game to more victory points than setup', () => {
    const play = driveSetup(started());
    const after = autoPlay(play, diceCycler(), 80);
    // Setup leaves 6 settlements (6 pts); real building must have happened.
    expect(buildingPoints(after)).toBeGreaterThan(6);
  });
});

// --- Development cards (issue 0019) ------------------------------------------

function withDev(state: GameState, id: string, card: DevCard, boughtOnTurn: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id ? { ...p, devCards: [...p.devCards, { card, boughtOnTurn }] } : p,
    ),
  };
}

describe('decideBotMove — development cards', () => {
  it('plays a knight, moving the robber and counting toward Largest Army', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev(s, id, 'knight', 0), id, {});
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('playDevCard');
    expect((move as { play: { card: string } }).play.card).toBe('knight');
    const after = reduce(s, toAction(s, id, move, () => [2, 3])).state;
    expect(after.players.find((p) => p.id === id)!.knightsPlayed).toBe(1);
  });

  it('will not play a card bought this turn', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev(s, id, 'knight', s.turnNumber), id, {}); // bought this turn
    expect(decideBotMove(s, id)).toEqual({ kind: 'endTurn' });
  });

  it('plays at most one dev card per turn', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev({ ...s, devCardPlayedThisTurn: true }, id, 'knight', 0), id, {});
    expect(decideBotMove(s, id)).toEqual({ kind: 'endTurn' });
  });

  it('plays monopoly on the resource opponents hold most of', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    const [, p2, p3] = s.players;
    s = setHand(s, p2.id, { wheat: 3 });
    s = setHand(s, p3.id, { wheat: 2, ore: 1 });
    s = setHand(withDev(s, id, 'monopoly', 0), id, {});
    const move = decideBotMove(s, id)!;
    expect(move).toEqual({ kind: 'playDevCard', play: { card: 'monopoly', resource: 'wheat' } });
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('plays year of plenty toward an almost-affordable build', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev(s, id, 'year_of_plenty', 0), id, { wheat: 2, ore: 2 }); // one ore short of a city
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('playDevCard');
    const play = (move as { play: { card: string; resources: Resource[] } }).play;
    expect(play.card).toBe('year_of_plenty');
    expect(play.resources).toHaveLength(2);
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('plays road building on legal edges', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev(s, id, 'road_building', 0), id, {});
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('playDevCard');
    expect((move as { play: { card: string } }).play.card).toBe('road_building');
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('never plays a victory-point card', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(withDev(s, id, 'victory_point', 0), id, {});
    expect(decideBotMove(s, id)).toEqual({ kind: 'endTurn' });
  });

  it('buys, plays knights, and earns Largest Army in a real game', () => {
    const knights: DevCard[] = Array<DevCard>(20).fill('knight');
    const play = driveSetup({ ...started(), devDeck: knights });
    const after = autoPlay(play, diceCycler(), 150);
    // End-to-end: bots bought and played enough knights for one to take the bonus.
    expect(after.bonuses.largestArmy).not.toBeNull();
    expect(Math.max(...after.players.map((p) => p.knightsPlayed))).toBeGreaterThanOrEqual(3);
  });
  // A full all-bot 10-VP victory needs bank trading to unblock resource-starved
  // bots; that end-to-end test lives in issue 0021.
});

// --- Trade responses (issue 0020) --------------------------------------------

function withTrade(
  state: GameState,
  proposer: string,
  give: Partial<Hand>,
  want: Partial<Hand>,
): GameState {
  return { ...state, trade: { proposer, give, want, responses: {} } };
}

describe('decideBotMove — trade responses', () => {
  it('accepts a non-losing trade it can pay for', () => {
    let s = inActions(driveSetup(started()));
    const [p1, p2] = s.players;
    s = setHand(withTrade(s, p1.id, { wheat: 2 }, { brick: 1 }), p2.id, { brick: 1 });
    expect(decideBotMove(s, p2.id)).toEqual({ kind: 'respondTrade', response: 'accept' });
  });

  it('declines a trade it cannot pay for', () => {
    let s = inActions(driveSetup(started()));
    const [p1, p2] = s.players;
    s = setHand(withTrade(s, p1.id, { wheat: 2 }, { ore: 3 }), p2.id, { ore: 0 });
    expect(decideBotMove(s, p2.id)).toEqual({ kind: 'respondTrade', response: 'decline' });
  });

  it('declines a losing trade (gives more than it gets)', () => {
    let s = inActions(driveSetup(started()));
    const [p1, p2] = s.players;
    s = setHand(withTrade(s, p1.id, { wheat: 1 }, { brick: 2 }), p2.id, { brick: 2 });
    expect(decideBotMove(s, p2.id)).toEqual({ kind: 'respondTrade', response: 'decline' });
  });

  it('does not respond twice', () => {
    let s = inActions(driveSetup(started()));
    const [p1, p2] = s.players;
    s = setHand(withTrade(s, p1.id, { wheat: 2 }, { brick: 1 }), p2.id, { brick: 1 });
    s = { ...s, trade: { ...s.trade!, responses: { [p2.id]: 'accept' } } };
    expect(decideBotMove(s, p2.id)).toBeNull();
  });

  it('the active proposer never auto-responds to its own trade', () => {
    let s = inActions(driveSetup(started()));
    const [p1] = s.players;
    s = setHand(withTrade(s, p1.id, { wheat: 1 }, { brick: 1 }), p1.id, {});
    // p1 is the current player with an open trade it proposed: it ends its turn,
    // it does not respond to itself.
    expect(decideBotMove(s, p1.id)).toEqual({ kind: 'endTurn' });
  });
});

// --- Bank/port trading (issue 0021) ------------------------------------------

describe('decideBotMove — bank trading', () => {
  it('trades surplus to unblock a build it is short on', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    // Has wheat for a city but no ore; a deep wood surplus covers the ore at 4:1.
    s = setHand(s, id, { wheat: 2, wood: 12 });
    const move = decideBotMove(s, id)!;
    expect(move.kind).toBe('tradeBank');
    const m = move as { give: Resource; receive: Resource };
    expect(m.give).toBe('wood');
    expect(m.receive).toBe('ore');
    expect(() => reduce(s, toAction(s, id, move, () => [2, 3]))).not.toThrow();
  });

  it('does not trade when no build is reachable, just ends the turn', () => {
    let s = inActions(driveSetup(started()));
    const id = s.players[s.turnIndex].id;
    s = setHand(s, id, { wood: 3 }); // too little surplus to reach anything
    expect(decideBotMove(s, id)).toEqual({ kind: 'endTurn' });
  });

  it('drives an all-bot game to a 10-VP victory once trading is available', () => {
    const play = driveSetup(started());
    const after = autoPlay(play, diceCycler(), 600);
    expect(after.phase).toBe('ENDED');
    expect(after.winner).not.toBeNull();
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
