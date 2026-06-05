/**
 * Development cards (issue 0010): buying (and the bought card staying hidden),
 * the one-per-turn and not-bought-this-turn guards, play legality in both
 * MUST_ROLL and ACTIONS, each card's effect, and Largest Army award/reassign.
 *
 * Cards are injected directly onto a player (with a chosen `boughtOnTurn`) so a
 * test doesn't have to buy first; the deck is set explicitly where buying is
 * under test. Built on a real post-setup board (turnNumber === 1).
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD,
  DevCard,
  GameState,
  edgeConnectsToNetwork,
  projectStateForPlayer,
  reduce,
  robberVictims,
} from '../src/index.js';
import { inActions, playThroughSetup, withHand } from './game-helpers.js';

function withDevCard(state: GameState, playerId: string, card: DevCard, boughtOnTurn: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, devCards: [...p.devCards, { card, boughtOnTurn }] } : p,
    ),
  };
}

/** A tile the robber can move to with no one to steal from (for clean Knight tests). */
function emptyTileFor(state: GameState, actor: string): number {
  const here = state.board!.robberTile;
  return BOARD.tiles.find((t) => t.id !== here && robberVictims(state, t.id, actor).length === 0)!.id;
}

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

describe('buying a dev card', () => {
  it('draws the front of the deck, charges the cost, and hides the card from opponents', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = withHand(state, 'p1', { sheep: 1, wheat: 1, ore: 1 });
    state = { ...state, devDeck: ['knight', 'monopoly'] };

    const res = reduce(state, { type: 'BUY_DEV_CARD', actorId: 'p1' });
    const p1 = res.state.players.find((p) => p.id === 'p1')!;
    expect(p1.devCards).toEqual([{ card: 'knight', boughtOnTurn: 1 }]);
    expect(p1.hand).toEqual({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });
    expect(res.state.devDeck).toEqual(['monopoly']);
    expect(res.events).toContainEqual({ type: 'DEV_CARD_BOUGHT', playerId: 'p1' });

    // Opponent sees only a count; the owner sees the actual card.
    const asP2 = projectStateForPlayer(res.state, 'p2');
    expect(asP2.players.find((p) => p.id === 'p1')!.devCardCount).toBe(1);
    const asP1 = projectStateForPlayer(res.state, 'p1');
    expect(asP1.you!.devCards).toEqual([{ card: 'knight', boughtOnTurn: 1 }]);
  });

  it('requires the cost and a non-empty deck', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = { ...state, devDeck: ['knight'] };
    expect(() => reduce(withHand(state, 'p1', {}), { type: 'BUY_DEV_CARD', actorId: 'p1' })).toThrow(
      /cannot afford/i,
    );
    const empty = { ...withHand(state, 'p1', { sheep: 1, wheat: 1, ore: 1 }), devDeck: [] as DevCard[] };
    expect(() => reduce(empty, { type: 'BUY_DEV_CARD', actorId: 'p1' })).toThrow(/deck is empty/i);
  });
});

describe('play guards', () => {
  it('allows at most one dev card per turn', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = withDevCard(state, 'p1', 'monopoly', 0);
    state = withDevCard(state, 'p1', 'year_of_plenty', 0);
    state = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'monopoly', resource: 'wheat' } }).state;
    expect(state.devCardPlayedThisTurn).toBe(true);
    expect(() =>
      reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'year_of_plenty', resources: ['ore', 'ore'] } }),
    ).toThrow(/already played/i);
  });

  it('cannot play a card bought this turn', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = withDevCard(state, 'p1', 'monopoly', state.turnNumber); // bought this very turn
    expect(() =>
      reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'monopoly', resource: 'wheat' } }),
    ).toThrow(/no playable monopoly/i);
  });

  it('is legal before rolling (MUST_ROLL) as well as in ACTIONS', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']); // still MUST_ROLL
    expect(state.turnPhase).toBe('MUST_ROLL');
    state = withDevCard(state, 'p1', 'monopoly', 0);
    const res = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'monopoly', resource: 'wheat' } });
    expect(res.state.turnPhase).toBe('MUST_ROLL'); // a pre-roll play does not consume the roll
    expect(res.state.devCardPlayedThisTurn).toBe(true);
  });
});

describe('knight', () => {
  it('moves the robber, steals, and counts toward the army', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    const { tileId, victim } = tileWithVictim(state, 'p1');
    state = withHand(state, 'p1', {});
    state = withHand(state, victim, { ore: 1 });
    state = withDevCard(state, 'p1', 'knight', 0);

    const res = reduce(state, {
      type: 'PLAY_DEV_CARD',
      actorId: 'p1',
      play: { card: 'knight', tile: tileId, stealFrom: victim, stolen: 'ore' },
    });
    expect(res.state.board!.robberTile).toBe(tileId);
    expect(res.state.players.find((p) => p.id === 'p1')!.hand.ore).toBe(1);
    expect(res.state.players.find((p) => p.id === victim)!.hand.ore).toBe(0);
    expect(res.state.players.find((p) => p.id === 'p1')!.knightsPlayed).toBe(1);
    expect(res.events).toContainEqual({ type: 'DEV_CARD_PLAYED', playerId: 'p1', card: 'knight' });
    expect(res.state.players.find((p) => p.id === 'p1')!.devCards).toEqual([]);
  });

  it('awards Largest Army at the third knight, not the second', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    const tile = emptyTileFor(state, 'p1');

    // Second knight: count reaches 2 -> no award.
    let s2 = { ...withDevCard(state, 'p1', 'knight', 0) };
    s2 = { ...s2, players: s2.players.map((p) => (p.id === 'p1' ? { ...p, knightsPlayed: 1 } : p)) };
    const r2 = reduce(s2, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'knight', tile, stealFrom: null, stolen: null } });
    expect(r2.state.players.find((p) => p.id === 'p1')!.knightsPlayed).toBe(2);
    expect(r2.state.bonuses.largestArmy).toBeNull();

    // Third knight: count reaches 3 -> award.
    let s3 = { ...withDevCard(state, 'p1', 'knight', 0) };
    s3 = { ...s3, players: s3.players.map((p) => (p.id === 'p1' ? { ...p, knightsPlayed: 2 } : p)) };
    const r3 = reduce(s3, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'knight', tile, stealFrom: null, stolen: null } });
    expect(r3.state.bonuses).toMatchObject({ largestArmy: 'p1', largestArmyCount: 3 });
    expect(r3.events).toContainEqual({ type: 'LARGEST_ARMY', playerId: 'p1', count: 3 });
  });

  it('reassigns Largest Army only when the holder is strictly surpassed', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    const tile = emptyTileFor(state, 'p1');
    state = withDevCard(state, 'p1', 'knight', 0);
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, knightsPlayed: 3 } : p)),
      bonuses: { ...state.bonuses, largestArmy: 'p2', largestArmyCount: 3 },
    };
    const res = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'knight', tile, stealFrom: null, stolen: null } });
    expect(res.state.bonuses).toMatchObject({ largestArmy: 'p1', largestArmyCount: 4 });
  });
});

describe('progress cards', () => {
  it('Road Building places two free roads connected to the network', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    const board = state.board!;
    const free: number[] = [];
    for (let e = 0; e < BOARD.edges.length && free.length < 2; e++) {
      if (!board.roads[e] && edgeConnectsToNetwork(board, e, 'p1')) free.push(e);
    }
    state = withHand(state, 'p1', {}); // free of charge — no cost needed
    state = withDevCard(state, 'p1', 'road_building', 0);

    const res = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'road_building', edges: free } });
    expect(res.state.board!.roads[free[0]]).toEqual({ owner: 'p1' });
    expect(res.state.board!.roads[free[1]]).toEqual({ owner: 'p1' });
    expect(res.state.players.find((p) => p.id === 'p1')!.hand).toEqual({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });
  });

  it('Year of Plenty grants two chosen resources', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = withHand(state, 'p1', {});
    state = withDevCard(state, 'p1', 'year_of_plenty', 0);
    const res = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'year_of_plenty', resources: ['wheat', 'ore'] } });
    const p1 = res.state.players.find((p) => p.id === 'p1')!;
    expect(p1.hand.wheat).toBe(1);
    expect(p1.hand.ore).toBe(1);
  });

  it('Monopoly sweeps one resource from every other player', () => {
    let state = inActions(playThroughSetup(['p1', 'p2', 'p3']));
    state = withHand(state, 'p1', { wheat: 1 });
    state = withHand(state, 'p2', { wheat: 3 });
    state = withHand(state, 'p3', { wheat: 2 });
    state = withDevCard(state, 'p1', 'monopoly', 0);

    const res = reduce(state, { type: 'PLAY_DEV_CARD', actorId: 'p1', play: { card: 'monopoly', resource: 'wheat' } });
    expect(res.state.players.find((p) => p.id === 'p1')!.hand.wheat).toBe(6);
    expect(res.state.players.find((p) => p.id === 'p2')!.hand.wheat).toBe(0);
    expect(res.state.players.find((p) => p.id === 'p3')!.hand.wheat).toBe(0);
    expect(res.events).toContainEqual({ type: 'MONOPOLY', playerId: 'p1', resource: 'wheat', count: 5 });
  });
});

describe('victory-point cards', () => {
  it('count toward the holder’s own total but stay hidden from opponents', () => {
    let state = playThroughSetup(['p1', 'p2', 'p3']);
    state = withDevCard(state, 'p1', 'victory_point', 1);

    const asP1 = projectStateForPlayer(state, 'p1');
    const asP2 = projectStateForPlayer(state, 'p2');
    const p1Public = asP2.players.find((p) => p.id === 'p1')!.publicVictoryPoints;
    expect(asP1.you!.hiddenVictoryPoints).toBe(1);
    expect(asP1.you!.totalVictoryPoints).toBe(p1Public + 1);
    // The opponent's view never exposes the card list, only the count.
    expect(asP2.players.find((p) => p.id === 'p1')!.devCardCount).toBe(1);
  });
});
