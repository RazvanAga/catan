import { create } from 'zustand';
import type { BlockedReason, GameEvent, GameView } from '@catan/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface AppState {
  status: ConnectionStatus;
  /** Latest personalized snapshot from the server; the single render source. */
  view: GameView | null;
  /** Set when the server refuses a seat (game already in progress). */
  blocked: BlockedReason | null;
  /** Append-only narration log, used for transient toasts. */
  events: GameEvent[];
  /** Last rejected-intent message from the server, shown then cleared. */
  error: string | null;

  setStatus: (status: ConnectionStatus) => void;
  setView: (view: GameView) => void;
  setBlocked: (reason: BlockedReason) => void;
  appendEvents: (events: GameEvent[]) => void;
  setError: (message: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  status: 'connecting',
  view: null,
  blocked: null,
  events: [],
  error: null,

  setStatus: (status) => set({ status }),
  setView: (view) => set({ view, blocked: null }),
  setBlocked: (reason) => set({ blocked: reason }),
  appendEvents: (events) => set((s) => ({ events: [...s.events, ...events] })),
  setError: (message) => set({ error: message }),
}));
