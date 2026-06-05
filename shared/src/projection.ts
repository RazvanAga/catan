/**
 * The per-player view projector: `projectStateForPlayer(state, playerId) -> view`.
 *
 * The anti-cheat boundary. The server sends each client only the projection for
 * *their* seat. Public board state (tiles, tokens, ports, robber, placed pieces,
 * public VP) is shown to all; a player's resource hand and development cards are
 * full only in their own `you` block and appear to everyone else as counts. The
 * raw `GameState` (other players' actual cards) never crosses the wire.
 */

import {
  BoardState,
  Bonuses,
  DevCardHolding,
  GameState,
  PlayerColor,
  ResourceCounts,
  RoomPhase,
  TradeResponse,
  TurnPhase,
} from './types.js';
import { ownerId } from './reducer.js';
import { hiddenVictoryPoints, publicVictoryPoints, totalVictoryPoints } from './rules/scoring.js';

/**
 * A player's full final tally, revealed to everyone once the game has ENDED.
 * Until then hidden VP cards stay secret, so this is null during LOBBY/SETUP/PLAY.
 */
export interface FinalScore {
  playerId: string;
  total: number;
  publicVictoryPoints: number;
  hiddenVictoryPoints: number;
}

export interface PlayerView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isOwner: boolean;
  /** Total resource cards held (counts only — never which ones). */
  handCount: number;
  /** Total development cards held (hidden contents). */
  devCardCount: number;
  knightsPlayed: number;
  /** VP everyone can see (excludes hidden VP cards). */
  publicVictoryPoints: number;
  isCurrentTurn: boolean;
  isPreviousWinner: boolean;
}

/** The requesting player's own private data. */
export interface SelfView {
  id: string;
  hand: ResourceCounts;
  devCards: DevCardHolding[];
  /** This player's full VP including their own hidden VP cards. */
  totalVictoryPoints: number;
  hiddenVictoryPoints: number;
}

export interface TurnView {
  currentPlayerId: string;
  phase: TurnPhase;
  turnNumber: number;
  lastRoll: [number, number] | null;
  /** Whether the active player has already played a dev card this turn. */
  devCardPlayedThisTurn: boolean;
}

export interface SetupView {
  currentPlayerId: string;
  pending: 'settlement' | 'road';
  lastSettlement: number | null;
}

/** A pending player-trade, exposing only quantities — never anyone's full hand. */
export interface TradeView {
  proposer: string;
  give: Partial<ResourceCounts>;
  want: Partial<ResourceCounts>;
  responses: { playerId: string; response: TradeResponse }[];
}

/**
 * Pending forced discards after a 7: each listed player still owes `count`
 * cards. Counts only — derivable from public hand sizes anyway, so this leaks
 * nothing. Lets every client show who the table is waiting on.
 */
export interface DiscardView {
  required: { playerId: string; count: number }[];
}

export interface GameView {
  phase: RoomPhase;
  players: PlayerView[];
  youId: string | null;
  seated: boolean;
  you: SelfView | null;
  ownerId: string | null;
  previousWinnerId: string | null;
  /** Public board content + placed pieces; null until a game starts. */
  board: BoardState | null;
  turn: TurnView | null;
  setup: SetupView | null;
  bonuses: Bonuses;
  trade: TradeView | null;
  /** Outstanding forced discards after a 7, or null when none are pending. */
  discard: DiscardView | null;
  /** Development cards left to buy. */
  devDeckCount: number;
  winner: string | null;
  /** Full VP breakdown per player, revealed only once the game has ENDED. */
  finalScores: FinalScore[] | null;
}

export function projectStateForPlayer(state: GameState, playerId: string | null): GameView {
  const owner = ownerId(state);
  const currentId = state.players[state.turnIndex]?.id ?? null;

  const players: PlayerView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    isOwner: p.id === owner,
    handCount: sumHand(p.hand),
    devCardCount: p.devCards.length,
    knightsPlayed: p.knightsPlayed,
    publicVictoryPoints: publicVictoryPoints(state, p.id),
    isCurrentTurn: p.id === currentId,
    isPreviousWinner: p.id === state.previousWinnerId,
  }));

  const self = playerId ? state.players.find((p) => p.id === playerId) : undefined;
  const you: SelfView | null = self
    ? {
        id: self.id,
        hand: self.hand,
        devCards: self.devCards,
        totalVictoryPoints: totalVictoryPoints(state, self),
        hiddenVictoryPoints: hiddenVictoryPoints(self),
      }
    : null;

  const inGame = state.phase === 'SETUP' || state.phase === 'PLAY';
  const turn: TurnView | null =
    inGame && currentId
      ? {
          currentPlayerId: currentId,
          phase: state.turnPhase,
          turnNumber: state.turnNumber,
          lastRoll: state.lastRoll,
          devCardPlayedThisTurn: state.devCardPlayedThisTurn,
        }
      : null;

  const setup: SetupView | null =
    state.phase === 'SETUP' && state.setup && currentId
      ? {
          currentPlayerId: currentId,
          pending: state.setup.pending,
          lastSettlement: state.setup.lastSettlement,
        }
      : null;

  const trade: TradeView | null = state.trade
    ? {
        proposer: state.trade.proposer,
        give: state.trade.give,
        want: state.trade.want,
        responses: Object.entries(state.trade.responses).map(([pid, response]) => ({
          playerId: pid,
          response,
        })),
      }
    : null;

  const discard: DiscardView | null = state.discard
    ? {
        required: Object.entries(state.discard.required).map(([pid, count]) => ({
          playerId: pid,
          count,
        })),
      }
    : null;

  const finalScores: FinalScore[] | null =
    state.phase === 'ENDED'
      ? state.players.map((p) => ({
          playerId: p.id,
          total: totalVictoryPoints(state, p),
          publicVictoryPoints: publicVictoryPoints(state, p.id),
          hiddenVictoryPoints: hiddenVictoryPoints(p),
        }))
      : null;

  return {
    phase: state.phase,
    players,
    youId: playerId,
    seated: self != null,
    you,
    ownerId: owner,
    previousWinnerId: state.previousWinnerId,
    board: state.board,
    turn,
    setup,
    bonuses: state.bonuses,
    trade,
    discard,
    devDeckCount: state.devDeck.length,
    winner: state.winner,
    finalScores,
  };
}

function sumHand(hand: ResourceCounts): number {
  return (Object.values(hand) as number[]).reduce((a, b) => a + b, 0);
}
