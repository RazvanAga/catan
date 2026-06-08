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

import type { GameEvent } from './types.js';

/** A board animation implied by a game event. Extended in issue 0025. */
export type AnimationCue =
  | { kind: 'buildingPlaced'; vertex: number }
  | { kind: 'roadPlaced'; edge: number };

/** A sound to play for a game event. Populated in issue 0026. */
export type SoundCue = never;

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
      return { animation: { kind: 'buildingPlaced', vertex: event.vertex } };
    case 'ROAD_BUILT':
      return { animation: { kind: 'roadPlaced', edge: event.edge } };
    default:
      return {};
  }
}
