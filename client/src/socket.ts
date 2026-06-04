/**
 * The single Socket.IO client connection and the thin command API the UI uses.
 *
 * On connect we present any stored session token; the server echoes back the
 * token to persist (so a reconnect reclaims the same seat). All server pushes
 * flow into the Zustand store, which is the only thing the UI renders from.
 */

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PlayerColor,
  Resource,
  ServerToClientEvents,
} from '@catan/shared';
import { useStore } from './store';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

// Local-testing convenience: tabs of the same browser share localStorage, so by
// default they'd reclaim the same seat. Passing a distinct `?u=<id>` in the URL
// namespaces the stored token, letting one browser hold several players at once
// (e.g. open ?u=1, ?u=2, ?u=3 in three tabs). Harmless in production.
const seatNamespace = new URLSearchParams(location.search).get('u') ?? '';
const TOKEN_KEY = 'catan.sessionToken' + (seatNamespace ? `:${seatNamespace}` : '');

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket: GameSocket = io(SERVER_URL, { autoConnect: true });

socket.on('connect', () => {
  useStore.getState().setStatus('connected');
  const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
  socket.emit('auth', { token });
});

socket.on('disconnect', () => {
  useStore.getState().setStatus('disconnected');
});

socket.io.on('reconnect_attempt', () => {
  useStore.getState().setStatus('connecting');
});

socket.on('authed', ({ token }) => {
  localStorage.setItem(TOKEN_KEY, token);
});

socket.on('snapshot', ({ view }) => {
  useStore.getState().setView(view);
});

socket.on('events', ({ events }) => {
  useStore.getState().appendEvents(events);
});

socket.on('blocked', ({ reason }) => {
  useStore.getState().setBlocked(reason);
});

socket.on('roomReset', () => {
  // Drop transient state and re-auth into the fresh lobby (works even from the
  // "game in progress" wall, since the server cleared all seats).
  useStore.setState({ events: [], error: null, blocked: null });
  socket.emit('auth', { token: localStorage.getItem(TOKEN_KEY) ?? undefined });
});

socket.on('actionError', ({ message }) => {
  useStore.getState().setError(message);
});

export const commands = {
  join(name: string, color: PlayerColor) {
    useStore.getState().setError(null);
    socket.emit('join', { name, color });
  },
  startGame() {
    useStore.getState().setError(null);
    socket.emit('startGame');
  },
  placeSetupSettlement(vertex: number) {
    useStore.getState().setError(null);
    socket.emit('placeSetupSettlement', { vertex });
  },
  placeSetupRoad(edge: number) {
    useStore.getState().setError(null);
    socket.emit('placeSetupRoad', { edge });
  },
  roll() {
    useStore.getState().setError(null);
    socket.emit('roll');
  },
  endTurn() {
    useStore.getState().setError(null);
    socket.emit('endTurn');
  },
  buildRoad(edge: number) {
    useStore.getState().setError(null);
    socket.emit('buildRoad', { edge });
  },
  buildSettlement(vertex: number) {
    useStore.getState().setError(null);
    socket.emit('buildSettlement', { vertex });
  },
  buildCity(vertex: number) {
    useStore.getState().setError(null);
    socket.emit('buildCity', { vertex });
  },
  tradeBank(give: Resource, receive: Resource) {
    useStore.getState().setError(null);
    socket.emit('tradeBank', { give, receive });
  },
  proposeTrade(give: Partial<Record<Resource, number>>, want: Partial<Record<Resource, number>>) {
    useStore.getState().setError(null);
    socket.emit('proposeTrade', { give, want });
  },
  respondTrade(response: 'accept' | 'decline') {
    useStore.getState().setError(null);
    socket.emit('respondTrade', { response });
  },
  confirmTrade(partnerId: string) {
    useStore.getState().setError(null);
    socket.emit('confirmTrade', { partnerId });
  },
  cancelTrade() {
    useStore.getState().setError(null);
    socket.emit('cancelTrade');
  },
  resetRoom() {
    socket.emit('resetRoom');
  },
};
