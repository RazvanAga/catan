/**
 * The single in-memory room — the server's authoritative state holder.
 *
 * It owns the one `GameState`, applies intents through the pure `reduce`, and
 * after every change pushes a *personalized* snapshot to each connected viewer
 * (the anti-cheat boundary) plus the batch of narration events. There is exactly
 * one Room per process; a server restart discards it (accepted in v1).
 */

import {
  Action,
  GameEvent,
  GameState,
  ServerToClientEvents,
  initialState,
  projectStateForPlayer,
  reduce,
} from '@catan/shared';
import type { Socket } from 'socket.io';

type ClientSocket = Socket<Record<string, never>, ServerToClientEvents>;

interface Viewer {
  socket: ClientSocket;
  /** The seat this viewer occupies, or null for an unseated lobby visitor. */
  playerId: string | null;
}

export class Room {
  private state: GameState = initialState();
  /** Secret session token -> public seat id. The token never leaves the server. */
  private readonly tokenToPlayerId = new Map<string, string>();
  /** All currently-connected sockets, seated or not, keyed by socket id. */
  private readonly viewers = new Map<string, Viewer>();
  /** Append-only narration log for the whole room's life. */
  private readonly eventLog: GameEvent[] = [];

  get phase() {
    return this.state.phase;
  }

  /** The seat a returning token owns, if any. */
  seatForToken(token: string): string | null {
    return this.tokenToPlayerId.get(token) ?? null;
  }

  bindToken(token: string, playerId: string): void {
    this.tokenToPlayerId.set(token, playerId);
  }

  addViewer(socketId: string, socket: ClientSocket, playerId: string | null): void {
    this.viewers.set(socketId, { socket, playerId });
  }

  setViewerSeat(socketId: string, playerId: string): void {
    const viewer = this.viewers.get(socketId);
    if (viewer) viewer.playerId = playerId;
  }

  removeViewer(socketId: string): void {
    this.viewers.delete(socketId);
  }

  /**
   * Apply an intent. Throws (via `reduce`) if illegal — the caller reports the
   * error to just that client. On success the new events are appended and every
   * viewer is re-broadcast.
   */
  apply(action: Action): void {
    const { state, events } = reduce(this.state, action);
    this.state = state;
    this.eventLog.push(...events);
    this.broadcast(events);
  }

  /**
   * Wipe the room back to an empty lobby: clear state, seats, tokens, and the
   * event log. Connected sockets stay (their `auth` re-seats them); callers
   * should prompt clients to re-auth. Dev/testing only.
   */
  reset(): void {
    this.state = initialState();
    this.tokenToPlayerId.clear();
    this.eventLog.length = 0;
    for (const viewer of this.viewers.values()) viewer.playerId = null;
  }

  /** Push a fresh personalized snapshot to one viewer (e.g. just after auth). */
  sendSnapshotTo(socketId: string): void {
    const viewer = this.viewers.get(socketId);
    if (!viewer) return;
    viewer.socket.emit('snapshot', { view: projectStateForPlayer(this.state, viewer.playerId) });
  }

  /** Personalized snapshot to all viewers; narration events to those seated/looking. */
  broadcast(newEvents: GameEvent[] = []): void {
    for (const viewer of this.viewers.values()) {
      viewer.socket.emit('snapshot', {
        view: projectStateForPlayer(this.state, viewer.playerId),
      });
      if (newEvents.length > 0) {
        viewer.socket.emit('events', { events: newEvents });
      }
    }
  }
}
