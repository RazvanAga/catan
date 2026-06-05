/**
 * Victory-point scoring. Public VP (settlements, cities, Longest Road, Largest
 * Army) is visible to everyone; hidden VP development cards add to the holder's
 * own total but are not revealed until they win. The 10-VP win check (issue
 * 0012) uses the total including hidden cards.
 */

import { GameEvent, GameState, Player } from '../types.js';

export const VP_TO_WIN = 10;

/** 1 per settlement, 2 per city owned by `playerId`. */
export function buildingPoints(state: GameState, playerId: string): number {
  if (!state.board) return 0;
  let vp = 0;
  for (const b of Object.values(state.board.buildings)) {
    if (b.owner === playerId) vp += b.city ? 2 : 1;
  }
  return vp;
}

/** VP everyone can see: buildings + Longest Road + Largest Army. */
export function publicVictoryPoints(state: GameState, playerId: string): number {
  let vp = buildingPoints(state, playerId);
  if (state.bonuses.longestRoad === playerId) vp += 2;
  if (state.bonuses.largestArmy === playerId) vp += 2;
  return vp;
}

/** Hidden VP from victory-point development cards in a player's own hand. */
export function hiddenVictoryPoints(player: Player): number {
  return player.devCards.filter((d) => d.card === 'victory_point').length;
}

/** Full VP total including hidden cards — the win threshold is checked on this. */
export function totalVictoryPoints(state: GameState, player: Player): number {
  return publicVictoryPoints(state, player.id) + hiddenVictoryPoints(player);
}

/**
 * End the game if the active player has reached the win threshold. A player can
 * only win on their own turn, so we check just the player whose turn it is, on
 * their full total (public sources + hidden VP cards). Returns the ENDED state
 * and the win event, or null if no one has won yet. Called centrally by `reduce`
 * after every action, so any VP-changing move (build, a Largest Army / Longest
 * Road swing, or even drawing a hidden VP card) can trigger the win.
 */
export function checkVictory(state: GameState): { state: GameState; event: GameEvent } | null {
  if (state.phase !== 'PLAY') return null;
  const active = state.players[state.turnIndex];
  if (!active) return null;
  const vp = totalVictoryPoints(state, active);
  if (vp < VP_TO_WIN) return null;
  return {
    state: { ...state, phase: 'ENDED', winner: active.id, previousWinnerId: active.id },
    event: { type: 'GAME_WON', playerId: active.id, victoryPoints: vp },
  };
}
