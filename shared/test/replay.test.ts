/**
 * Post-game replay & crown (issue 0013). After a game ENDs, the owner's
 * "New game" resets the room to a fresh LOBBY while keeping everyone seated, and
 * the just-finished winner is remembered (`previousWinnerId`) so they wear the
 * crown in the next game.
 */

import { describe, expect, it } from 'vitest';
import { GameState, Player, projectStateForPlayer, reduce } from '../src/index.js';
import { startAction } from './helpers.js';

const COLORS = ['red', 'blue', 'orange', 'white'] as const;

function seat(id: string, i: number): Player {
  return {
    id,
    name: `name-${id}`,
    color: COLORS[i],
    isBot: false,
    connected: true,
    vacant: false,
    hand: { brick: 2, wood: 1, sheep: 0, wheat: 3, ore: 1 },
    devCards: [{ card: 'victory_point', boughtOnTurn: 2 }],
    knightsPlayed: 3,
  };
}

/** An ENDED game won by `ids[0]`. */
function endedGame(ids: string[]): GameState {
  return {
    phase: 'ENDED',
    players: ids.map(seat),
    previousWinnerId: ids[0],
    board: { setup: null as never, robberTile: 4, buildings: { 0: { owner: ids[0], city: true } }, roads: {} },
    setup: null,
    turnIndex: 0,
    turnPhase: 'ACTIONS',
    turnNumber: 30,
    lastRoll: [2, 5],
    devDeck: ['knight'],
    devCardPlayedThisTurn: true,
    bonuses: { longestRoad: ids[0], longestRoadLength: 6, largestArmy: ids[0], largestArmyCount: 3 },
    trade: null,
    discard: null,
    winner: ids[0],
  };
}

describe('NEW_GAME', () => {
  it('resets to a fresh lobby but keeps the same seats', () => {
    const ended = endedGame(['p1', 'p2', 'p3']);
    const { state } = reduce(ended, { type: 'NEW_GAME', actorId: 'p1' });

    expect(state.phase).toBe('LOBBY');
    // Same players, names and colors retained.
    expect(state.players.map((p) => [p.id, p.name, p.color])).toEqual([
      ['p1', 'name-p1', 'red'],
      ['p2', 'name-p2', 'blue'],
      ['p3', 'name-p3', 'orange'],
    ]);
    // Per-game state wiped.
    expect(state.board).toBeNull();
    expect(state.players.every((p) => p.knightsPlayed === 0 && p.devCards.length === 0)).toBe(true);
    expect(state.players.every((p) => Object.values(p.hand).every((n) => n === 0))).toBe(true);
    expect(state.bonuses).toEqual({ longestRoad: null, longestRoadLength: 0, largestArmy: null, largestArmyCount: 0 });
    expect(state.winner).toBeNull();
  });

  it('remembers the previous winner across the reset and into the next game', () => {
    const ended = endedGame(['p1', 'p2', 'p3']);
    const lobby = reduce(ended, { type: 'NEW_GAME', actorId: 'p1' }).state;
    expect(lobby.previousWinnerId).toBe('p1');

    // Starting the next game keeps the crown on last game's winner.
    const next = reduce(lobby, startAction('p1')).state;
    expect(next.previousWinnerId).toBe('p1');
    const view = projectStateForPlayer(next, 'p2');
    expect(view.players.find((p) => p.id === 'p1')!.isPreviousWinner).toBe(true);
    expect(view.players.find((p) => p.id === 'p2')!.isPreviousWinner).toBe(false);
  });

  it('is owner-only and only allowed once the game has ended', () => {
    const ended = endedGame(['p1', 'p2', 'p3']);
    expect(() => reduce(ended, { type: 'NEW_GAME', actorId: 'p2' })).toThrow(/owner/);

    const playing: GameState = { ...ended, phase: 'PLAY', winner: null };
    expect(() => reduce(playing, { type: 'NEW_GAME', actorId: 'p1' })).toThrow(/ended/);
  });
});
