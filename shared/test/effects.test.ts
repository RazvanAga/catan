/**
 * The pure event→cue mapper (issue 0024). Tests the presentation *policy* — which
 * cue an event implies — not how the client renders it.
 */

import { describe, expect, it } from 'vitest';
import { effectsForEvent, type GameEvent } from '../src/index.js';

describe('effectsForEvent', () => {
  it('maps a built settlement to a building-placed animation at its vertex', () => {
    const event: GameEvent = { type: 'SETTLEMENT_BUILT', playerId: 'p1', vertex: 12, setup: false };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'buildingPlaced', vertex: 12 });
  });

  it('maps a built city to a building-placed animation at its vertex', () => {
    const event: GameEvent = { type: 'CITY_BUILT', playerId: 'p1', vertex: 7 };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'buildingPlaced', vertex: 7 });
  });

  it('maps a built road to a road-placed animation at its edge', () => {
    const event: GameEvent = { type: 'ROAD_BUILT', playerId: 'p1', edge: 5, setup: true };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'roadPlaced', edge: 5 });
  });

  it('returns no cue for an event with no visible effect (yet)', () => {
    const event: GameEvent = { type: 'TURN_ENDED', playerId: 'p1' };
    expect(effectsForEvent(event)).toEqual({});
  });

  it('never produces a sound cue in this slice', () => {
    const event: GameEvent = { type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 4], total: 7 };
    expect(effectsForEvent(event).sound).toBeUndefined();
  });
});
