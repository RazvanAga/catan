/**
 * Win condition (issue 0012). A player wins the instant they reach 10 VP on
 * their own turn, from any mix of sources — buildings, the Longest Road /
 * Largest Army bonuses, and hidden victory-point dev cards. The room flips to
 * ENDED, the winner is recorded, and the projection reveals every player's full
 * tally (hidden cards included).
 */

import { describe, expect, it } from 'vitest';
import {
  Building,
  GameState,
  checkVictory,
  projectStateForPlayer,
  reduce,
} from '../src/index.js';

const COLORS = ['red', 'blue', 'orange', 'white'] as const;

/** A bare PLAY-phase state: `ids[0]` is the active player, in ACTIONS. */
function playState(
  ids: string[],
  buildings: Record<number, Building>,
  overrides: Partial<GameState> = {},
): GameState {
  const players = ids.map((id, i) => ({
    id,
    name: id,
    color: COLORS[i],
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
    board: { setup: null as never, robberTile: 0, buildings, roads: {} },
    setup: null,
    turnIndex: 0,
    turnPhase: 'ACTIONS',
    turnNumber: 5,
    lastRoll: [3, 4],
    devDeck: [],
    devCardPlayedThisTurn: false,
    bonuses: { longestRoad: null, longestRoadLength: 0, largestArmy: null, largestArmyCount: 0 },
    trade: null,
    discard: null,
    winner: null,
    ...overrides,
  };
}

const settlement = (owner: string): Building => ({ owner, city: false });
const city = (owner: string): Building => ({ owner, city: true });

describe('win condition', () => {
  it('ends the game when a build pushes the active player to 10 (mixed sources)', () => {
    // p1: settlement at 0 (1) + three cities (6) = 7 building VP, plus Largest
    // Army (+2) = 9. Upgrading the settlement to a city adds the 10th point.
    const state = playState(
      ['p1', 'p2', 'p3'],
      { 0: settlement('p1'), 10: city('p1'), 20: city('p1'), 30: city('p1') },
      {
        bonuses: { longestRoad: null, longestRoadLength: 0, largestArmy: 'p1', largestArmyCount: 3 },
      },
    );
    const p1 = { ...state, players: state.players.map((p) => (p.id === 'p1' ? { ...p, hand: { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 3 } } : p)) };

    // Not won yet at 9.
    expect(checkVictory(p1)).toBeNull();

    const res = reduce(p1, { type: 'BUILD_CITY', actorId: 'p1', vertex: 0 });
    expect(res.state.phase).toBe('ENDED');
    expect(res.state.winner).toBe('p1');
    expect(res.state.previousWinnerId).toBe('p1');
    expect(res.events).toContainEqual({ type: 'GAME_WON', playerId: 'p1', victoryPoints: 10 });
  });

  it('a hidden victory-point card can trigger the win, and is revealed to all', () => {
    // p1 sits at 9 public VP from buildings (four cities + a settlement); drawing
    // a VP card from the deck takes the hidden total to 10.
    const base = playState(
      ['p1', 'p2', 'p3'],
      { 0: city('p1'), 1: city('p1'), 2: city('p1'), 3: city('p1'), 4: settlement('p1') },
      { devDeck: ['victory_point'] },
    );
    const ready: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === 'p1' ? { ...p, hand: { brick: 0, wood: 0, sheep: 1, wheat: 1, ore: 1 } } : p,
      ),
    };

    const res = reduce(ready, { type: 'BUY_DEV_CARD', actorId: 'p1' });
    expect(res.state.phase).toBe('ENDED');
    expect(res.state.winner).toBe('p1');
    expect(res.events).toContainEqual({ type: 'GAME_WON', playerId: 'p1', victoryPoints: 10 });

    // The win reveals the full tally — including the previously hidden card — to
    // every seat (here projected for an opponent).
    const view = projectStateForPlayer(res.state, 'p2');
    expect(view.finalScores).not.toBeNull();
    const p1Score = view.finalScores!.find((s) => s.playerId === 'p1')!;
    expect(p1Score.total).toBe(10);
    expect(p1Score.hiddenVictoryPoints).toBe(1);
  });

  it('only the active player can win — an off-turn 10 does not end the game', () => {
    // p2 holds 10 VP worth of buildings, but it is p1's turn.
    const state = playState(['p1', 'p2', 'p3'], {
      0: city('p2'),
      1: city('p2'),
      2: city('p2'),
      3: city('p2'),
      4: city('p2'),
    });
    expect(checkVictory(state)).toBeNull();
  });

  it('does not reveal hidden VP totals before the game ends', () => {
    const state = playState(['p1', 'p2', 'p3'], { 0: settlement('p1') });
    expect(projectStateForPlayer(state, 'p2').finalScores).toBeNull();
  });
});
