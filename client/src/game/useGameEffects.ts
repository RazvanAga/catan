/**
 * The client effect pipeline (issue 0024): the single consumer of the narration
 * event stream that both animations (0024, 0025) and sounds (0026) hang off.
 *
 * It tracks a cursor into the store's append-only `events` log and reacts only to
 * events that arrive *after* mount — a reconnect pushes a fresh snapshot but no
 * event replay, so the board never re-animates its existing pieces. Driving the
 * pop-in from the event (rather than from a React mount) is what makes that
 * guarantee hold: only a piece named by a just-arrived BUILT event animates.
 *
 * Later slices extend this in two places: `effectsForEvent` (shared) gains more
 * cues, and the switch below gains the handlers that render / play them.
 */

import { useEffect, useRef, useState } from 'react';
import { effectsForEvent } from '@catan/shared';
import { useStore } from '../store';

/** How long a freshly-placed piece keeps its pop-in class. Matches the CSS. */
const POP_MS = 420;

export interface BoardEffects {
  /** Vertices whose building should currently play its pop-in animation. */
  poppedVertices: ReadonlySet<number>;
  /** Edges whose road should currently play its pop-in animation. */
  poppedEdges: ReadonlySet<number>;
}

export function useGameEffects(): BoardEffects {
  const events = useStore((s) => s.events);
  // null until the first run, which seeds the cursor at the current end so any
  // events already present at mount (or after a reconnect) are not replayed.
  const cursor = useRef<number | null>(null);
  const [poppedVertices, setPoppedVertices] = useState<ReadonlySet<number>>(new Set());
  const [poppedEdges, setPoppedEdges] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (cursor.current === null) {
      cursor.current = events.length;
      return;
    }
    for (let i = cursor.current; i < events.length; i++) {
      const { animation } = effectsForEvent(events[i]);
      if (!animation) continue;
      if (animation.kind === 'buildingPlaced') popTransient(setPoppedVertices, animation.vertex);
      else if (animation.kind === 'roadPlaced') popTransient(setPoppedEdges, animation.edge);
    }
    cursor.current = events.length;
  }, [events]);

  return { poppedVertices, poppedEdges };
}

/** Add `id` to the popped set, then drop it once the pop-in has played. */
function popTransient(set: (fn: (prev: ReadonlySet<number>) => ReadonlySet<number>) => void, id: number): void {
  set((prev) => new Set(prev).add(id));
  setTimeout(() => set((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  }), POP_MS);
}
