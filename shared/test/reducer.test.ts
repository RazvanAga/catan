/**
 * Canonical test style for the project: drive the pure reducer with
 * `(state, action)` and assert the observable resulting state and emitted
 * events — never internal helpers. No server, socket, browser, or RNG mocking.
 */

import { describe, expect, it } from 'vitest';
import { Action, IllegalActionError, initialState, ownerId, reduce } from '../src/index.js';
import { run, startAction } from './helpers.js';

const ALICE: Action = { type: 'JOIN', playerId: 'p1', name: 'Alice', color: 'red' };
const BOB: Action = { type: 'JOIN', playerId: 'p2', name: 'Bob', color: 'blue' };
const CARA: Action = { type: 'JOIN', playerId: 'p3', name: 'Cara', color: 'orange' };
const DAN: Action = { type: 'JOIN', playerId: 'p4', name: 'Dan', color: 'white' };

describe('JOIN', () => {
  it('seats a player and emits PLAYER_JOINED', () => {
    const { state, events } = reduce(initialState(), ALICE);
    expect(state.players).toMatchObject([{ id: 'p1', name: 'Alice', color: 'red', connected: true }]);
    expect(state.players[0].hand).toEqual({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });
    expect(events).toEqual([
      { type: 'PLAYER_JOINED', playerId: 'p1', name: 'Alice', color: 'red' },
    ]);
  });

  it('does not mutate the input state', () => {
    const before = initialState();
    reduce(before, ALICE);
    expect(before.players).toEqual([]);
  });

  it('trims the display name', () => {
    const { state } = reduce(initialState(), { ...ALICE, name: '  Alice  ' });
    expect(state.players[0].name).toBe('Alice');
  });

  it('rejects an empty display name', () => {
    expect(() => reduce(initialState(), { ...ALICE, name: '   ' })).toThrow(IllegalActionError);
  });

  it('rejects a color already taken', () => {
    const afterAlice = reduce(initialState(), ALICE).state;
    const collision: Action = { type: 'JOIN', playerId: 'p2', name: 'Bob', color: 'red' };
    expect(() => reduce(afterAlice, collision)).toThrow(/already taken/);
  });

  it('rejects a 5th player (room cap is 4)', () => {
    const full = run(initialState(), [ALICE, BOB, CARA, DAN]);
    const fifth: Action = { type: 'JOIN', playerId: 'p5', name: 'Eve', color: 'red' };
    expect(() => reduce(full, fifth)).toThrow(/full/);
  });

  it('rejects joining once the game is in progress', () => {
    const started = run(initialState(), [ALICE, BOB, CARA, startAction('p1')]);
    expect(() => reduce(started, DAN)).toThrow(/in progress/);
  });
});

describe('owner assignment', () => {
  it('makes the first joiner the owner', () => {
    const state = run(initialState(), [ALICE, BOB]);
    expect(ownerId(state)).toBe('p1');
  });
});

describe('START_GAME gating', () => {
  it('is rejected below 3 players', () => {
    const twoPlayers = run(initialState(), [ALICE, BOB]);
    expect(() => reduce(twoPlayers, startAction('p1'))).toThrow(/at least 3/);
  });

  it('is rejected for a non-owner', () => {
    const threePlayers = run(initialState(), [ALICE, BOB, CARA]);
    expect(() => reduce(threePlayers, startAction('p2'))).toThrow(/owner/);
  });

  it('transitions LOBBY -> SETUP for the owner with 3 players', () => {
    const threePlayers = run(initialState(), [ALICE, BOB, CARA]);
    const { state, events } = reduce(threePlayers, startAction('p1'));
    expect(state.phase).toBe('SETUP');
    expect(state.board).not.toBeNull();
    expect(events).toContainEqual({ type: 'GAME_STARTED', playerCount: 3 });
  });

  it('cannot be started twice', () => {
    const started = run(initialState(), [ALICE, BOB, CARA, startAction('p1')]);
    expect(() => reduce(started, startAction('p1'))).toThrow(/not in the lobby/);
  });
});
