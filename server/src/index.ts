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
  Action,
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
  // The token is the secret; the seat is always derived from it through the
  // room, so a room reset (which clears seats) takes effect immediately without
  // this socket reconnecting.
  let token: string | null = null;
  const seat = (): string | null => (token ? room.seatForToken(token) : null);

  function reportError(err: unknown): void {
    const message =
      err instanceof IllegalActionError ? err.message : 'Something went wrong.';
    socket.emit('actionError', { message });
  }

  /** Resolve the caller's seat, build its action, and apply — reporting errors. */
  function act(build: (pid: string) => Action): void {
    const pid = seat();
    if (!pid) return;
    try {
      room.apply(build(pid));
    } catch (err) {
      reportError(err);
    }
  }

  socket.on('auth', (msg) => {
    token = msg.token ?? randomUUID();
    socket.emit('authed', { token });

    if (room.seatForToken(token)) {
      // Returning player reclaims their exact seat.
      room.addViewer(socket.id, socket, room.seatForToken(token));
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
    if (!token || seat()) return; // must auth first; ignore if already seated
    const newSeat = randomUUID();
    try {
      room.apply({ type: 'JOIN', playerId: newSeat, name: msg.name, color: msg.color });
    } catch (err) {
      reportError(err);
      return;
    }
    room.bindToken(token, newSeat);
    room.setViewerSeat(socket.id, newSeat);
    room.sendSnapshotTo(socket.id);
  });

  // The server owns all RNG: dice, board arrangement, and the shuffled dev deck
  // are generated here and passed into the (deterministic) reducer as data.
  socket.on('startGame', () =>
    act((pid) => ({ type: 'START_GAME', actorId: pid, board: createBoardSetup(), devDeck: createDevDeck() })),
  );
  socket.on('roll', () => act((pid) => ({ type: 'ROLL', actorId: pid, dice: rollDice() })));

  socket.on('placeSetupSettlement', ({ vertex }) =>
    act((pid) => ({ type: 'PLACE_SETUP_SETTLEMENT', actorId: pid, vertex })),
  );
  socket.on('placeSetupRoad', ({ edge }) => act((pid) => ({ type: 'PLACE_SETUP_ROAD', actorId: pid, edge })));
  socket.on('endTurn', () => act((pid) => ({ type: 'END_TURN', actorId: pid })));
  socket.on('buildRoad', ({ edge }) => act((pid) => ({ type: 'BUILD_ROAD', actorId: pid, edge })));
  socket.on('buildSettlement', ({ vertex }) => act((pid) => ({ type: 'BUILD_SETTLEMENT', actorId: pid, vertex })));
  socket.on('buildCity', ({ vertex }) => act((pid) => ({ type: 'BUILD_CITY', actorId: pid, vertex })));
  socket.on('tradeBank', ({ give, receive }) => act((pid) => ({ type: 'TRADE_BANK', actorId: pid, give, receive })));
  socket.on('proposeTrade', ({ give, want }) => act((pid) => ({ type: 'PROPOSE_TRADE', actorId: pid, give, want })));
  socket.on('respondTrade', ({ response }) => act((pid) => ({ type: 'RESPOND_TRADE', actorId: pid, response })));
  socket.on('confirmTrade', ({ partnerId }) => act((pid) => ({ type: 'CONFIRM_TRADE', actorId: pid, partnerId })));
  socket.on('cancelTrade', () => act((pid) => ({ type: 'CANCEL_TRADE', actorId: pid })));

  socket.on('discard', ({ resources }) => act((pid) => ({ type: 'DISCARD', actorId: pid, discard: resources })));
  // The active player names the tile and (if any) the victim; the server rolls
  // which card is taken, so the stolen card is never the client's to choose.
  socket.on('moveRobber', ({ tile, stealFrom }) =>
    act((pid) => ({
      type: 'MOVE_ROBBER',
      actorId: pid,
      tile,
      stealFrom: stealFrom ?? null,
      stolen: stealFrom ? room.pickStolenCard(stealFrom) : null,
    })),
  );

  // Dev/testing convenience: wipe the room back to an empty lobby and tell every
  // client to re-auth (so even "game in progress" tabs return to the join screen).
  socket.on('resetRoom', () => {
    room.reset();
    io.emit('roomReset');
  });

  socket.on('disconnect', () => {
    room.removeViewer(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Catan server listening on http://localhost:${PORT}`);
  console.log(`Accepting client origin: ${CLIENT_ORIGIN}`);
});
