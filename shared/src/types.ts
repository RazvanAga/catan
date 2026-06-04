/**
 * Core game types for the singleton Catan room.
 *
 * The shapes here grow slice by slice. `reduce` / `projectStateForPlayer`
 * signatures stay fixed; each issue adds Action/GameEvent variants and, where
 * needed, GameState fields. All non-determinism (dice, deck order, steals) is
 * supplied as action data — never generated inside the reducer.
 */

import { BoardSetup, PortType, Resource, TileResource } from './board/index.js';

export type PlayerColor = 'red' | 'blue' | 'orange' | 'white';

/** The four base-game player colors, in display order. */
export const PLAYER_COLORS: readonly PlayerColor[] = ['red', 'blue', 'orange', 'white'];

/**
 * Room lifecycle: LOBBY -> SETUP -> PLAY -> ENDED -> (LOBBY on "New game").
 * SETUP is the snake-draft; PLAY runs the per-turn machine (see TurnPhase).
 */
export type RoomPhase = 'LOBBY' | 'SETUP' | 'PLAY' | 'ENDED';

/** Per-turn sub-phase during PLAY. */
export type TurnPhase = 'MUST_ROLL' | 'ACTIONS' | 'DISCARD' | 'MOVE_ROBBER';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;

export const RESOURCES: readonly Resource[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];

export type ResourceCounts = Record<Resource, number>;

/** Base-game build costs. */
export const BUILD_COSTS = {
  road: { brick: 1, wood: 1 },
  settlement: { brick: 1, wood: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
} as const satisfies Record<string, Partial<ResourceCounts>>;

/** Base-game per-player piece limits. */
export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 } as const;

export type DevCard = 'knight' | 'road_building' | 'year_of_plenty' | 'monopoly' | 'victory_point';

/** A held development card, tagged with the turn it was bought (can't play same turn). */
export interface DevCardHolding {
  card: DevCard;
  boughtOnTurn: number;
}

export interface Player {
  /** Public seat id. Distinct from the secret session token (server-only). */
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  /** Private hand of resource cards (zeros in the lobby). */
  hand: ResourceCounts;
  /** Private development cards. */
  devCards: DevCardHolding[];
  /** Knights played (for Largest Army). */
  knightsPlayed: number;
}

export interface Building {
  owner: string;
  /** false = settlement (1 VP / 1 production), true = city (2 VP / 2 production). */
  city: boolean;
}

export interface Road {
  owner: string;
}

/** Live board: the randomized content plus placed pieces and the robber. */
export interface BoardState {
  setup: BoardSetup;
  robberTile: number;
  /** vertex id -> building. */
  buildings: Record<number, Building>;
  /** edge id -> road. */
  roads: Record<number, Road>;
}

/** Snake-draft progress during SETUP. */
export interface SetupState {
  /** Seating-order indices forming the full placement order (forward then reverse). */
  order: number[];
  /** Index into `order` for whose placement is next. */
  step: number;
  /** Within the current player's mini-turn: place a settlement, then its road. */
  pending: 'settlement' | 'road';
  /** The vertex just placed this mini-turn, so the road must attach to it. */
  lastSettlement: number | null;
}

export type TradeResponse = 'accept' | 'decline';

/** An active player's pending player↔player trade offer (issue 0008). */
export interface TradeProposal {
  proposer: string;
  /** What the proposer offers. */
  give: Partial<ResourceCounts>;
  /** What the proposer asks for in return. */
  want: Partial<ResourceCounts>;
  /** Other players' responses, by player id. */
  responses: Record<string, TradeResponse>;
}

export interface Bonuses {
  longestRoad: string | null;
  longestRoadLength: number;
  largestArmy: string | null;
  largestArmyCount: number;
}

export interface GameState {
  phase: RoomPhase;
  /** Join order; `players[0]` is the room owner. */
  players: Player[];
  /** Carried across games for the winner's crown; null until someone wins. */
  previousWinnerId: string | null;

  // --- game-only; null/empty until a game starts ---
  board: BoardState | null;
  setup: SetupState | null;
  /** Index into `players` whose turn it is (during SETUP and PLAY). */
  turnIndex: number;
  turnPhase: TurnPhase;
  /** Monotonic turn counter (used to gate "dev card bought this turn"). */
  turnNumber: number;
  lastRoll: [number, number] | null;
  /** Remaining dev cards in server-shuffled order; drawn from the front. */
  devDeck: DevCard[];
  /** At most one dev card may be played per turn. */
  devCardPlayedThisTurn: boolean;
  bonuses: Bonuses;
  /** The active player's open player-trade offer, or null. */
  trade: TradeProposal | null;
  winner: string | null;
}

export function emptyHand(): ResourceCounts {
  return { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function emptyBonuses(): Bonuses {
  return { longestRoad: null, longestRoadLength: 0, largestArmy: null, largestArmyCount: 0 };
}

/**
 * Intents applied to the game. Each carries everything the reducer needs to
 * validate it — including the actor and any server-rolled randomness.
 */
export type Action =
  | { type: 'JOIN'; playerId: string; name: string; color: PlayerColor }
  | { type: 'START_GAME'; actorId: string; board: BoardSetup; devDeck: DevCard[] }
  // --- SETUP (issue 0004) ---
  | { type: 'PLACE_SETUP_SETTLEMENT'; actorId: string; vertex: number }
  | { type: 'PLACE_SETUP_ROAD'; actorId: string; edge: number }
  // --- Turn loop (issue 0005) ---
  | { type: 'ROLL'; actorId: string; dice: [number, number] }
  | { type: 'END_TURN'; actorId: string }
  // --- Building (issue 0006) ---
  | { type: 'BUILD_ROAD'; actorId: string; edge: number }
  | { type: 'BUILD_SETTLEMENT'; actorId: string; vertex: number }
  | { type: 'BUILD_CITY'; actorId: string; vertex: number }
  // --- Bank/port trading (issue 0007) ---
  | { type: 'TRADE_BANK'; actorId: string; give: Resource; receive: Resource }
  // --- Player trading (issue 0008) ---
  | { type: 'PROPOSE_TRADE'; actorId: string; give: Partial<ResourceCounts>; want: Partial<ResourceCounts> }
  | { type: 'RESPOND_TRADE'; actorId: string; response: TradeResponse }
  | { type: 'CONFIRM_TRADE'; actorId: string; partnerId: string }
  | { type: 'CANCEL_TRADE'; actorId: string };

/** Append-only narration entries emitted by `reduce`, for toasts/animations. */
export type GameEvent =
  | { type: 'PLAYER_JOINED'; playerId: string; name: string; color: PlayerColor }
  | { type: 'GAME_STARTED'; playerCount: number }
  | { type: 'SETTLEMENT_BUILT'; playerId: string; vertex: number; setup: boolean }
  | { type: 'ROAD_BUILT'; playerId: string; edge: number; setup: boolean }
  | { type: 'RESOURCES_GRANTED'; playerId: string; resources: Partial<ResourceCounts> }
  | { type: 'SETUP_COMPLETE' }
  | { type: 'TURN_STARTED'; playerId: string; turnNumber: number }
  | { type: 'DICE_ROLLED'; playerId: string; dice: [number, number]; total: number }
  | { type: 'NO_PRODUCTION'; total: number }
  | { type: 'TURN_ENDED'; playerId: string }
  | { type: 'CITY_BUILT'; playerId: string; vertex: number }
  | { type: 'BANK_TRADE'; playerId: string; give: Resource; count: number; receive: Resource }
  | { type: 'TRADE_PROPOSED'; proposer: string }
  | { type: 'TRADE_RESPONDED'; playerId: string; response: TradeResponse }
  | { type: 'TRADE_CONFIRMED'; proposer: string; partnerId: string }
  | { type: 'TRADE_CANCELLED'; proposer: string };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

export type { BoardSetup, PortType, Resource, TileResource };
