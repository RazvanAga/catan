/**
 * The authoritative Socket.IO server for the singleton Catan room.
 *
 * Connection lifecycle:
 *   connect -> client emits `auth { token? }`
 *     - known token  -> reclaim that seat, send snapshot
 *     - new visitor in LOBBY -> issue a token, send the lobby snapshot (join form)
 *     - new visitor while IN_GAME -> `blocked { game_in_progress }` (the wall)
 *   `join { name, color }`  -> server mints a seat id, applies JOIN, binds token
 *   `startGame`             -> applies START_GAME as the acting seat
 *
 * The server is the sole authority: every intent is re-validated by `reduce`,
 * and only personalized projections (never raw state) are sent to clients.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  ClientToServerEvents,
  IllegalActionError,
  ServerToClientEvents,
  createBoardSetup,
  createDevDeck,
} from '@catan/shared';
import { Room } from './room.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

/** Two fair dice, server-side. The reducer is fed the result as action data. */
function rollDice(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Catan server up.\n');
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const room = new Room();

io.on('connection', (socket) => {
  // Per-connection identity, established on `auth`.
  let token: string | null = null;
  let playerId: string | null = null;

  function reportError(err: unknown): void {
    const message =
      err instanceof IllegalActionError ? err.message : 'Something went wrong.';
    socket.emit('actionError', { message });
  }

  socket.on('auth', (msg) => {
    token = msg.token ?? randomUUID();
    socket.emit('authed', { token });

    const existingSeat = room.seatForToken(token);
    if (existingSeat) {
      // Returning player reclaims their exact seat.
      playerId = existingSeat;
      room.addViewer(socket.id, socket, playerId);
      room.sendSnapshotTo(socket.id);
      return;
    }

    if (room.phase !== 'LOBBY') {
      // No seat and the game has started: show the "game in progress" wall.
      socket.emit('blocked', { reason: 'game_in_progress' });
      return;
    }

    // Fresh lobby visitor: tracked as an unseated viewer so the roster stays live.
    room.addViewer(socket.id, socket, null);
    room.sendSnapshotTo(socket.id);
  });

  socket.on('join', (msg) => {
    if (!token) return; // must auth first
    if (playerId) return; // already seated

    const newSeat = randomUUID();
    try {
      room.apply({ type: 'JOIN', playerId: newSeat, name: msg.name, color: msg.color });
    } catch (err) {
      reportError(err);
      return;
    }
    playerId = newSeat;
    room.bindToken(token, newSeat);
    room.setViewerSeat(socket.id, newSeat);
    room.sendSnapshotTo(socket.id);
  });

  socket.on('startGame', () => {
    if (!playerId) return;
    try {
      // The server owns all RNG: it generates the board arrangement and the
      // shuffled dev deck, then passes them into the (deterministic) reducer.
      room.apply({
        type: 'START_GAME',
        actorId: playerId,
        board: createBoardSetup(),
        devDeck: createDevDeck(),
      });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('placeSetupSettlement', ({ vertex }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'PLACE_SETUP_SETTLEMENT', actorId: playerId, vertex });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('placeSetupRoad', ({ edge }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'PLACE_SETUP_ROAD', actorId: playerId, edge });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('roll', () => {
    if (!playerId) return;
    try {
      room.apply({ type: 'ROLL', actorId: playerId, dice: rollDice() });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('endTurn', () => {
    if (!playerId) return;
    try {
      room.apply({ type: 'END_TURN', actorId: playerId });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('buildRoad', ({ edge }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'BUILD_ROAD', actorId: playerId, edge });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('buildSettlement', ({ vertex }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'BUILD_SETTLEMENT', actorId: playerId, vertex });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('buildCity', ({ vertex }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'BUILD_CITY', actorId: playerId, vertex });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('tradeBank', ({ give, receive }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'TRADE_BANK', actorId: playerId, give, receive });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('proposeTrade', ({ give, want }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'PROPOSE_TRADE', actorId: playerId, give, want });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('respondTrade', ({ response }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'RESPOND_TRADE', actorId: playerId, response });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('confirmTrade', ({ partnerId }) => {
    if (!playerId) return;
    try {
      room.apply({ type: 'CONFIRM_TRADE', actorId: playerId, partnerId });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('cancelTrade', () => {
    if (!playerId) return;
    try {
      room.apply({ type: 'CANCEL_TRADE', actorId: playerId });
    } catch (err) {
      reportError(err);
    }
  });

  socket.on('disconnect', () => {
    room.removeViewer(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Catan server listening on http://localhost:${PORT}`);
  console.log(`Accepting client origin: ${CLIENT_ORIGIN}`);
});
