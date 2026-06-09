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

  it('maps granted resources to a positive hand-delta on that player', () => {
    const event: GameEvent = { type: 'RESOURCES_GRANTED', playerId: 'p1', resources: { wood: 2, brick: 1 } };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'handDelta', playerId: 'p1', amount: 3 });
  });

  it('maps discarded cards to a negative hand-delta', () => {
    const event: GameEvent = { type: 'CARDS_DISCARDED', playerId: 'p1', resources: { ore: 2 } };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'handDelta', playerId: 'p1', amount: -2 });
  });

  it('maps a monopoly to a positive hand-delta of the claimed count', () => {
    const event: GameEvent = { type: 'MONOPOLY', playerId: 'p1', resource: 'sheep', count: 4 };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'handDelta', playerId: 'p1', amount: 4 });
  });

  it('maps a steal to a both-parties flash cue', () => {
    const event: GameEvent = { type: 'CARD_STOLEN', from: 'p2', to: 'p1' };
    expect(effectsForEvent(event).animation).toEqual({ kind: 'steal', from: 'p2', to: 'p1' });
  });

  it('produces no cue for an empty grant', () => {
    const event: GameEvent = { type: 'RESOURCES_GRANTED', playerId: 'p1', resources: {} };
    expect(effectsForEvent(event)).toEqual({});
  });

  it('returns no cue for an event with no visible effect (yet)', () => {
    const event: GameEvent = { type: 'TURN_ENDED', playerId: 'p1' };
    expect(effectsForEvent(event)).toEqual({});
  });

  it('pairs a build with both a pop-in and a build sound', () => {
    const event: GameEvent = { type: 'ROAD_BUILT', playerId: 'p1', edge: 5, setup: false };
    expect(effectsForEvent(event)).toEqual({ animation: { kind: 'roadPlaced', edge: 5 }, sound: 'build' });
  });

  it('maps a dice roll to a dice sound (no animation)', () => {
    const event: GameEvent = { type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 4], total: 7 };
    expect(effectsForEvent(event)).toEqual({ sound: 'dice' });
  });

  it('maps a robber move to a robber sound', () => {
    const event: GameEvent = { type: 'ROBBER_MOVED', playerId: 'p1', tile: 4 };
    expect(effectsForEvent(event).sound).toBe('robber');
  });

  it('maps a win to a win sound', () => {
    const event: GameEvent = { type: 'GAME_WON', playerId: 'p1', victoryPoints: 10 };
    expect(effectsForEvent(event).sound).toBe('win');
  });

  it('maps dev-card buy and play to a dev sound', () => {
    expect(effectsForEvent({ type: 'DEV_CARD_BOUGHT', playerId: 'p1' }).sound).toBe('dev');
    expect(effectsForEvent({ type: 'DEV_CARD_PLAYED', playerId: 'p1', card: 'knight' }).sound).toBe('dev');
  });

  it('never produces the self-only yourTurn cue from the mapper', () => {
    // The your-turn chime is contextual (depends on the local seat), so the client
    // fires it; the pure mapper must never emit it.
    const sounds = ([] as (string | undefined)[]).concat(
      effectsForEvent({ type: 'TURN_STARTED', playerId: 'p1', turnNumber: 3 }).sound,
    );
    expect(sounds).not.toContain('yourTurn');
  });
});
