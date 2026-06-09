/**
 * Presentation policy: which animation / sound cue a narration event implies.
 *
 * This is the single shared spine that the client's animation layer (issue 0024,
 * 0025) and sound layer (issue 0026) both consume, so "a built settlement pops in
 * and clicks" is decided in one tested place. It is pure and DOM/audio-free — it
 * maps a `GameEvent` to abstract cues; the client decides how to render them.
 *
 * Extended incrementally: 0024 covers piece placement, 0025 adds the rest of the
 * animations, 0026 fills in `SoundCue`.
 */

import type { GameEvent, ResourceCounts } from './types.js';

/**
 * A UI animation implied by a game event.
 *
 * `buildingPlaced` / `roadPlaced` pop a fresh board piece in. `handDelta` /
 * `steal` are the player-targeted "felt" effects (issue 0025): a signed hand
 * change floats off a player's roster row, and a steal flashes both parties. The
 * robber slide, dice settle and current-turn pulse are *not* here — they are
 * positional/turn effects the client renders straight from snapshot state via CSS,
 * with no per-event cue to carry.
 */
export type AnimationCue =
  | { kind: 'buildingPlaced'; vertex: number }
  | { kind: 'roadPlaced'; edge: number }
  | { kind: 'handDelta'; playerId: string; amount: number }
  | { kind: 'steal'; from: string; to: string };

/**
 * A sound to play for a game event (issue 0026), synthesized client-side.
 * `yourTurn` is never produced by the mapper — it is inherently self-only, so the
 * client fires it when a turn starts for the *local* seat.
 */
export type SoundCue =
  | 'dice'
  | 'build'
  | 'robber'
  | 'steal'
  | 'deal'
  | 'dev'
  | 'yourTurn'
  | 'win';

/** The presentation effects (animation and/or sound) a game event implies. */
export interface EventEffects {
  animation?: AnimationCue;
  sound?: SoundCue;
}

/**
 * Map a single narration event to its presentation cue(s). Events with no visible
 * effect (yet) return an empty object, so a caller can iterate every event
 * uniformly and act only on the cues it finds.
 */
export function effectsForEvent(event: GameEvent): EventEffects {
  switch (event.type) {
    case 'SETTLEMENT_BUILT':
    case 'CITY_BUILT':
      return { animation: { kind: 'buildingPlaced', vertex: event.vertex }, sound: 'build' };
    case 'ROAD_BUILT':
      return { animation: { kind: 'roadPlaced', edge: event.edge }, sound: 'build' };
    case 'DICE_ROLLED':
      return { sound: 'dice' };
    case 'RESOURCES_GRANTED': {
      const amount = sumCounts(event.resources);
      return amount > 0 ? { animation: { kind: 'handDelta', playerId: event.playerId, amount }, sound: 'deal' } : {};
    }
    case 'CARDS_DISCARDED': {
      const amount = sumCounts(event.resources);
      return amount > 0 ? { animation: { kind: 'handDelta', playerId: event.playerId, amount: -amount } } : {};
    }
    case 'MONOPOLY':
      return event.count > 0
        ? { animation: { kind: 'handDelta', playerId: event.playerId, amount: event.count } }
        : {};
    case 'ROBBER_MOVED':
      return { sound: 'robber' };
    case 'CARD_STOLEN':
      return { animation: { kind: 'steal', from: event.from, to: event.to }, sound: 'steal' };
    case 'DEV_CARD_BOUGHT':
    case 'DEV_CARD_PLAYED':
      return { sound: 'dev' };
    case 'GAME_WON':
      return { sound: 'win' };
    default:
      return {};
  }
}

/** Total number of cards in a (partial) resource-count bag. */
function sumCounts(counts: Partial<ResourceCounts>): number {
  return Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);
}
