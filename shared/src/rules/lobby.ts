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
    connected: true,
    hand: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
  };
  return {
    state: { ...state, players: [...state.players, player] },
    events: [{ type: 'PLAYER_JOINED', playerId: player.id, name: player.name, color: player.color }],
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

export { IllegalActionError };
