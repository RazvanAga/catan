/**
 * The Socket.IO message protocol, shared by server and client so both sides
 * agree on event names and payloads. Typed `ClientToServerEvents` /
 * `ServerToClientEvents` interfaces feed Socket.IO's generics on both ends.
 */

import { GameEvent, PlayerColor, Resource, ResourceCounts, TradeResponse } from './types.js';
import { GameView } from './projection.js';

/** Reason a connection is refused a seat. */
export type BlockedReason = 'game_in_progress';

/**
 * Client-facing dev-card play params. Same shape as the engine's `DevCardPlay`
 * except a Knight omits `stolen` — the server rolls which card is taken (RNG)
 * and fills it in before handing the action to the reducer.
 */
export type DevCardPlayInput =
  | { card: 'knight'; tile: number; stealFrom: string | null }
  | { card: 'road_building'; edges: number[] }
  | { card: 'year_of_plenty'; resources: Resource[] }
  | { card: 'monopoly'; resource: Resource };

// --- Client -> Server payloads -------------------------------------------------

export interface AuthMsg {
  /** Previously-issued session token, if the client has one stored. */
  token?: string;
}

export interface JoinMsg {
  name: string;
  color: PlayerColor;
}

// --- Server -> Client payloads -------------------------------------------------

export interface AuthedMsg {
  /** The session token to persist client-side and present on reconnect. */
  token: string;
}

export interface SnapshotMsg {
  view: GameView;
}

export interface EventsMsg {
  events: GameEvent[];
}

export interface ErrorMsg {
  message: string;
}

export interface BlockedMsg {
  reason: BlockedReason;
}

export interface ClientToServerEvents {
  auth: (msg: AuthMsg) => void;
  join: (msg: JoinMsg) => void;
  startGame: () => void;
  // --- SETUP (issue 0004) ---
  placeSetupSettlement: (msg: { vertex: number }) => void;
  placeSetupRoad: (msg: { edge: number }) => void;
  // --- Turn loop (issue 0005) ---
  roll: () => void;
  endTurn: () => void;
  // --- Building (issue 0006) ---
  buildRoad: (msg: { edge: number }) => void;
  buildSettlement: (msg: { vertex: number }) => void;
  buildCity: (msg: { vertex: number }) => void;
  // --- Bank/port trading (issue 0007) ---
  tradeBank: (msg: { give: Resource; receive: Resource }) => void;
  // --- Player trading (issue 0008) ---
  proposeTrade: (msg: { give: Partial<ResourceCounts>; want: Partial<ResourceCounts> }) => void;
  respondTrade: (msg: { response: TradeResponse }) => void;
  confirmTrade: (msg: { partnerId: string }) => void;
  cancelTrade: () => void;
  // --- The 7: discard, move robber, steal (issue 0009) ---
  discard: (msg: { resources: Partial<ResourceCounts> }) => void;
  // The server picks which card is stolen (RNG); the client only names the tile
  // and the victim (null when the chosen tile has no stealable neighbour).
  moveRobber: (msg: { tile: number; stealFrom: string | null }) => void;
  // --- Development cards (issue 0010) ---
  buyDevCard: () => void;
  playDevCard: (msg: { play: DevCardPlayInput }) => void;
  // --- Dev/testing ---
  resetRoom: () => void;
}

export interface ServerToClientEvents {
  authed: (msg: AuthedMsg) => void;
  snapshot: (msg: SnapshotMsg) => void;
  events: (msg: EventsMsg) => void;
  actionError: (msg: ErrorMsg) => void;
  blocked: (msg: BlockedMsg) => void;
  /** The room was reset; clients should re-auth back into a fresh lobby. */
  roomReset: () => void;
}
