/** Lobby rules: joining the room and starting the game. */

import {
  Action,
  GameEvent,
  GameState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  Player,
  ReduceResult,
  emptyBonuses,
  emptyHand,
} from '../types.js';
import { BoardState } from '../types.js';
import { assert, IllegalActionError } from './helpers.js';
import { buildSetupOrder } from './setup.js';

export function ownerId(state: GameState): string | null {
  return state.players[0]?.id ?? null;
}

export function join(state: GameState, action: Extract<Action, { type: 'JOIN' }>): ReduceResult {
  assert(state.phase === 'LOBBY', 'Cannot join: a game is already in progress.');
  assert(state.players.length < MAX_PLAYERS, `Cannot join: room is full (${MAX_PLAYERS} players).`);
  assert(!state.players.some((p) => p.id === action.playerId), 'Cannot join: already seated.');
  const name = action.name.trim();
  assert(name.length > 0, 'Cannot join: a display name is required.');
  assert(PLAYER_COLORS.includes(action.color), `Cannot join: unknown color "${action.color}".`);
  assert(
    !state.players.some((p) => p.color === action.color),
    `Cannot join: color "${action.color}" is already taken.`,
  );

  const player: Player = {
    id: action.playerId,
    name,
    color: action.color,
    isBot: false,
    connected: true,
    vacant: false,
    hand: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
  };
  return {
    state: { ...state, players: [...state.players, player] },
    events: [{ type: 'PLAYER_JOINED', playerId: player.id, name: player.name, color: player.color }],
  };
}

/**
 * The owner adds a bot to fill an empty seat (issue 0016). Validated like JOIN
 * (room not full, color free, name present) plus an owner/LOBBY gate. The seat is
 * a normal Player flagged `isBot`; the server picks an available color and a
 * "Bot N" name and passes them in as action data, mirroring how JOIN receives a
 * human's chosen name/color.
 */
export function addBot(state: GameState, action: Extract<Action, { type: 'ADD_BOT' }>): ReduceResult {
  assert(state.phase === 'LOBBY', 'Cannot add a bot: a game is already in progress.');
  assert(action.actorId === ownerId(state), 'Cannot add a bot: only the room owner may.');
  assert(state.players.length < MAX_PLAYERS, `Cannot add a bot: room is full (${MAX_PLAYERS} players).`);
  assert(!state.players.some((p) => p.id === action.playerId), 'Cannot add a bot: id already seated.');
  const name = action.name.trim();
  assert(name.length > 0, 'Cannot add a bot: a name is required.');
  assert(PLAYER_COLORS.includes(action.color), `Cannot add a bot: unknown color "${action.color}".`);
  assert(
    !state.players.some((p) => p.color === action.color),
    `Cannot add a bot: color "${action.color}" is already taken.`,
  );

  const bot: Player = {
    id: action.playerId,
    name,
    color: action.color,
    isBot: true,
    connected: true,
    vacant: false,
    hand: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
  };
  return {
    state: { ...state, players: [...state.players, bot] },
    events: [{ type: 'BOT_ADDED', playerId: bot.id, name: bot.name, color: bot.color }],
  };
}

/** The owner removes a bot it added (issue 0016). Only bot seats are removable. */
export function removeBot(state: GameState, action: Extract<Action, { type: 'REMOVE_BOT' }>): ReduceResult {
  assert(state.phase === 'LOBBY', 'Cannot remove a bot: a game is already in progress.');
  assert(action.actorId === ownerId(state), 'Cannot remove a bot: only the room owner may.');
  const target = state.players.find((p) => p.id === action.playerId);
  assert(target != null, 'Cannot remove a bot: no such seat.');
  assert(target!.isBot, 'Cannot remove a bot: that seat is not a bot.');
  return {
    state: { ...state, players: state.players.filter((p) => p.id !== action.playerId) },
    events: [{ type: 'BOT_REMOVED', playerId: target!.id, name: target!.name }],
  };
}

export function startGame(
  state: GameState,
  action: Extract<Action, { type: 'START_GAME' }>,
): ReduceResult {
  assert(state.phase === 'LOBBY', 'Cannot start: the game is not in the lobby.');
  assert(action.actorId === ownerId(state), 'Cannot start: only the room owner may start the game.');
  assert(state.players.length >= MIN_PLAYERS, `Cannot start: need at least ${MIN_PLAYERS} players.`);
  assert(state.players.length <= MAX_PLAYERS, `Cannot start: at most ${MAX_PLAYERS} players.`);

  const board: BoardState = {
    setup: action.board,
    robberTile: action.board.robberTile,
    buildings: {},
    roads: {},
  };

  // Everyone starts a fresh game with an empty hand and no dev cards/knights.
  const players = state.players.map((p) => ({
    ...p,
    hand: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
  }));

  const nextState: GameState = {
    ...state,
    phase: 'SETUP',
    players,
    board,
    setup: buildSetupOrder(players.length),
    turnIndex: 0,
    turnPhase: 'MUST_ROLL',
    turnNumber: 0,
    lastRoll: null,
    devDeck: action.devDeck,
    devCardPlayedThisTurn: false,
    bonuses: emptyBonuses(),
    trade: null,
    discard: null,
    winner: null,
  };

  const events: GameEvent[] = [{ type: 'GAME_STARTED', playerCount: players.length }];
  return { state: nextState, events };
}

/**
 * "New game" (issue 0013): from the victory screen the owner resets the room
 * back to a fresh LOBBY, keeping everyone seated with their names and colors.
 * The just-finished game's winner (`previousWinnerId`, set when the game ended)
 * is carried over so they wear the crown next game — this memory survives a New
 * game but not a server restart (it lives only in the in-memory state).
 */
export function newGame(state: GameState, action: Extract<Action, { type: 'NEW_GAME' }>): ReduceResult {
  assert(state.phase === 'ENDED', 'You can only start a new game once the current one has ended.');
  assert(action.actorId === ownerId(state), 'Cannot start a new game: only the room owner may.');

  // Keep the seats (id/name/color/connection) but clear every per-game hand.
  const players = state.players.map((p) => ({
    ...p,
    hand: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
  }));

  return {
    state: {
      phase: 'LOBBY',
      players,
      previousWinnerId: state.previousWinnerId,
      board: null,
      setup: null,
      turnIndex: 0,
      turnPhase: 'MUST_ROLL',
      turnNumber: 0,
      lastRoll: null,
      devDeck: [],
      devCardPlayedThisTurn: false,
      bonuses: emptyBonuses(),
      trade: null,
      discard: null,
      winner: null,
    },
    events: [{ type: 'NEW_GAME' }],
  };
}

export { IllegalActionError };
