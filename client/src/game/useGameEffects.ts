/**
 * The client effect pipeline (issue 0024, extended in 0025): the single consumer
 * of the narration event stream that animations (and, in 0026, sounds) hang off.
 *
 * It tracks a cursor into the store's append-only `events` log and reacts only to
 * events that arrive *after* mount — a reconnect pushes a fresh snapshot but no
 * event replay, so the board never re-animates its existing pieces. Driving the
 * effects from the event (rather than from a React mount or a state diff) is what
 * makes that guarantee hold and lets a steal know exactly which two players to
 * flash even though the card itself is hidden.
 *
 * Robber slide / dice settle / current-turn pulse are *not* here: those are
 * positional/turn effects the components render straight from snapshot state via
 * CSS, with no per-event cue to carry.
 */

import { useEffect, useRef, useState } from 'react';
import { effectsForEvent } from '@catan/shared';
import { useStore } from '../store';

/** How long a freshly-placed piece keeps its pop-in class. Matches the CSS. */
const POP_MS = 420;
/** How long a floating +N/−N stays up. Matches the CSS. */
const FLOAT_MS = 1100;
/** How long a roster row flashes on a steal. Matches the CSS. */
const FLASH_MS = 750;

/** A transient signed hand change floating off a player's roster row. */
export interface HandFloat {
  /** Bumps on every new float so React replays the animation for repeats. */
  id: number;
  amount: number;
}

export interface GameEffects {
  /** Vertices/edges whose piece should currently play its pop-in animation. */
  poppedVertices: ReadonlySet<number>;
  poppedEdges: ReadonlySet<number>;
  /** Latest hand-change float per player id. */
  handFloats: ReadonlyMap<string, HandFloat>;
  /** Player ids whose roster row is currently flashing (a steal touched them). */
  rosterFlash: ReadonlySet<string>;
  /** True briefly when the local player just gained cards (pulse own hand). */
  handPulse: boolean;
}

export function useGameEffects(): GameEffects {
  const events = useStore((s) => s.events);
  const youId = useStore((s) => s.view?.youId ?? null);
  // null until the first run, which seeds the cursor at the current end so any
  // events already present at mount (or after a reconnect) are not replayed.
  const cursor = useRef<number | null>(null);
  const floatId = useRef(0);
  const [poppedVertices, setPoppedVertices] = useState<ReadonlySet<number>>(new Set());
  const [poppedEdges, setPoppedEdges] = useState<ReadonlySet<number>>(new Set());
  const [handFloats, setHandFloats] = useState<ReadonlyMap<string, HandFloat>>(new Map());
  const [rosterFlash, setRosterFlash] = useState<ReadonlySet<string>>(new Set());
  const [handPulse, setHandPulse] = useState(false);

  useEffect(() => {
    if (cursor.current === null) {
      cursor.current = events.length;
      return;
    }
    for (let i = cursor.current; i < events.length; i++) {
      const { animation } = effectsForEvent(events[i]);
      if (!animation) continue;
      switch (animation.kind) {
        case 'buildingPlaced':
          addTransient(setPoppedVertices, animation.vertex, POP_MS);
          break;
        case 'roadPlaced':
          addTransient(setPoppedEdges, animation.edge, POP_MS);
          break;
        case 'handDelta': {
          const id = ++floatId.current;
          floatFor(setHandFloats, animation.playerId, { id, amount: animation.amount });
          if (animation.playerId === youId && animation.amount > 0) pulseHand(setHandPulse);
          break;
        }
        case 'steal':
          addTransient(setRosterFlash, animation.from, FLASH_MS);
          addTransient(setRosterFlash, animation.to, FLASH_MS);
          break;
      }
    }
    cursor.current = events.length;
  }, [events, youId]);

  return { poppedVertices, poppedEdges, handFloats, rosterFlash, handPulse };
}

/** Add `id` to a set, then drop it once its effect has played. */
function addTransient<T>(
  set: (fn: (prev: ReadonlySet<T>) => ReadonlySet<T>) => void,
  id: T,
  ms: number,
): void {
  set((prev) => new Set(prev).add(id));
  setTimeout(
    () =>
      set((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    ms,
  );
}

/** Show a player's latest hand float, then clear it. */
function floatFor(
  set: (fn: (prev: ReadonlyMap<string, HandFloat>) => ReadonlyMap<string, HandFloat>) => void,
  playerId: string,
  float: HandFloat,
): void {
  set((prev) => new Map(prev).set(playerId, float));
  setTimeout(
    () =>
      set((prev) => {
        // Only clear if this exact float is still the current one.
        if (prev.get(playerId)?.id !== float.id) return prev;
        const next = new Map(prev);
        next.delete(playerId);
        return next;
      }),
    FLOAT_MS,
  );
}

/** Briefly flag the local hand as pulsing after a gain. */
function pulseHand(set: (v: boolean) => void): void {
  set(true);
  setTimeout(() => set(false), FLOAT_MS);
}
