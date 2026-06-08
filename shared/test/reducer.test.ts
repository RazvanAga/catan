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

const addBot = (actorId: string, id: string, color: Action extends never ? never : any): Action => ({
  type: 'ADD_BOT',
  actorId,
  playerId: id,
  name: 'Bot 1',
  color,
});

describe('ADD_BOT / REMOVE_BOT', () => {
  it('seats a bot with isBot set and emits BOT_ADDED', () => {
    const lobby = run(initialState(), [ALICE, BOB, CARA]);
    const { state, events } = reduce(lobby, addBot('p1', 'b1', 'white'));
    expect(state.players).toHaveLength(4);
    expect(state.players[3]).toMatchObject({ id: 'b1', color: 'white', isBot: true, connected: true });
    expect(events).toContainEqual({ type: 'BOT_ADDED', playerId: 'b1', name: 'Bot 1', color: 'white' });
  });

  it('marks human joiners as not bots', () => {
    const { state } = reduce(initialState(), ALICE);
    expect(state.players[0].isBot).toBe(false);
  });

  it('rejects a non-owner adding a bot', () => {
    const lobby = run(initialState(), [ALICE, BOB, CARA]);
    expect(() => reduce(lobby, addBot('p2', 'b1', 'white'))).toThrow(/owner/);
  });

  it('rejects a bot when the room is full', () => {
    const full = run(initialState(), [ALICE, BOB, CARA, DAN]);
    expect(() => reduce(full, addBot('p1', 'b1', 'white'))).toThrow(/full/);
  });

  it('rejects a bot whose color is already taken', () => {
    const lobby = run(initialState(), [ALICE, BOB, CARA]);
    expect(() => reduce(lobby, addBot('p1', 'b1', 'red'))).toThrow(/already taken/);
  });

  it('rejects adding a bot once the game has started', () => {
    const started = run(initialState(), [ALICE, BOB, CARA, startAction('p1')]);
    expect(() => reduce(started, addBot('p1', 'b1', 'white'))).toThrow(/in progress/);
  });

  it('removes a bot the owner added, emitting BOT_REMOVED', () => {
    const withBot = run(initialState(), [ALICE, BOB, CARA, addBot('p1', 'b1', 'white')]);
    const { state, events } = reduce(withBot, { type: 'REMOVE_BOT', actorId: 'p1', playerId: 'b1' });
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(events).toContainEqual({ type: 'BOT_REMOVED', playerId: 'b1', name: 'Bot 1' });
  });

  it('refuses to remove a human via REMOVE_BOT', () => {
    const lobby = run(initialState(), [ALICE, BOB, CARA]);
    expect(() => reduce(lobby, { type: 'REMOVE_BOT', actorId: 'p1', playerId: 'p2' })).toThrow(/not a bot/);
  });

  it('rejects a non-owner removing a bot', () => {
    const withBot = run(initialState(), [ALICE, BOB, CARA, addBot('p1', 'b1', 'white')]);
    expect(() => reduce(withBot, { type: 'REMOVE_BOT', actorId: 'p2', playerId: 'b1' })).toThrow(/owner/);
  });

  it('carries bots into a New game', () => {
    // Start with a bot, end the game, then New game keeps the bot seated.
    const withBot = run(initialState(), [ALICE, BOB, addBot('p1', 'b1', 'white'), startAction('p1')]);
    const ended = { ...withBot, phase: 'ENDED' as const };
    const { state } = reduce(ended, { type: 'NEW_GAME', actorId: 'p1' });
    expect(state.phase).toBe('LOBBY');
    expect(state.players.find((p) => p.id === 'b1')?.isBot).toBe(true);
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
