/**
 * Builds the authoritative Socket.IO server (HTTP + io + the singleton Room) and
 * wires every connection's message handlers, *without* listening on a port. The
 * production entrypoint (`index.ts`) calls this and then `.listen()`; tests call
 * it on an ephemeral port and inject deterministic RNG / a short vacancy clock.
 *
 * Connection lifecycle:
 *   connect -> client emits `auth { token? }`
 *     - known token            -> reclaim that exact seat (un-greys it)
 *     - new visitor, vacant seat open -> claim & inherit that seat
 *     - new visitor in LOBBY   -> issue a token, send the lobby snapshot
 *     - new visitor mid-game   -> `blocked { game_in_progress }`
 *   `join` / `startGame` / game intents -> re-validated by `reduce`, then broadcast
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  Action,
  BoardSetup,
  ClientToServerEvents,
  DevCard,
  IllegalActionError,
  ServerToClientEvents,
  createBoardSetup,
  createDevDeck,
} from '@catan/shared';
import { Room } from './room.js';

export interface GameServerOptions {
  /** Allowed CORS origin for the browser client. */
  clientOrigin?: string;
  /** How long a seat stays reclaimable before going vacant (ms). */
  vacancyMs?: number;
  /** Override the dice source (tests want determinism). */
  rollDice?: () => [number, number];
  /** Override the bot-pacing wait (tests inject an immediate delay). */
  delay?: (ms: number) => Promise<void>;
  /** Override board generation (tests want determinism). */
  makeBoard?: () => BoardSetup;
  /** Override dev-deck generation (tests want determinism). */
  makeDevDeck?: () => DevCard[];
}

/** Two fair dice, server-side. The reducer is fed the result as action data. */
function defaultRollDice(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

export function createGameServer(opts: GameServerOptions = {}) {
  const rollDice = opts.rollDice ?? defaultRollDice;
  const makeBoard = opts.makeBoard ?? (() => createBoardSetup());
  const makeDevDeck = opts.makeDevDeck ?? (() => createDevDeck());

  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Catan server up.\n');
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: opts.clientOrigin ?? 'http://localhost:5173', methods: ['GET', 'POST'] },
  });

  const room = new Room({ vacancyMs: opts.vacancyMs, rollDice, delay: opts.delay });

  io.on('connection', (socket) => {
    // The token is the secret; the seat is always derived from it through the
    // room, so a room reset (which clears seats) takes effect immediately.
    let token: string | null = null;
    const seat = (): string | null => (token ? room.seatForToken(token) : null);

    function reportError(err: unknown): void {
      const message = err instanceof IllegalActionError ? err.message : 'Something went wrong.';
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

      const owned = room.seatForToken(token);
      if (owned) {
        room.reclaimSeat(socket.id, socket, owned);
        return;
      }
      if (room.phase !== 'LOBBY') {
        // A seat that timed out is open to anyone: inherit that vacant position.
        if (room.claimVacantSeat(socket.id, socket, token)) return;
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

    // Bots (issue 0016): owner-only seat management while in the lobby. The room
    // picks an available color and a "Bot N" name; the reducer re-validates the
    // owner/LOBBY/room-full/color gates and rejects a non-owner caller.
    socket.on('addBot', () => {
      const pid = seat();
      if (!pid) return;
      try {
        room.addBot(pid);
      } catch (err) {
        reportError(err);
      }
    });
    socket.on('removeBot', ({ playerId }) => act((pid) => ({ type: 'REMOVE_BOT', actorId: pid, playerId })));

    // The server owns all RNG: dice, board arrangement, and the shuffled dev deck
    // are generated here and passed into the (deterministic) reducer as data.
    socket.on('startGame', () =>
      act((pid) => ({ type: 'START_GAME', actorId: pid, board: makeBoard(), devDeck: makeDevDeck() })),
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

    socket.on('buyDevCard', () => act((pid) => ({ type: 'BUY_DEV_CARD', actorId: pid })));
    // For a Knight the server rolls the stolen card (same as moveRobber); other
    // cards' params pass straight through to the reducer.
    socket.on('playDevCard', ({ play }) =>
      act((pid) => {
        if (play.card === 'knight') {
          return {
            type: 'PLAY_DEV_CARD',
            actorId: pid,
            play: {
              card: 'knight',
              tile: play.tile,
              stealFrom: play.stealFrom ?? null,
              stolen: play.stealFrom ? room.pickStolenCard(play.stealFrom) : null,
            },
          };
        }
        return { type: 'PLAY_DEV_CARD', actorId: pid, play };
      }),
    );

    // Post-game replay: the owner resets to a fresh lobby, same seats kept.
    socket.on('newGame', () => act((pid) => ({ type: 'NEW_GAME', actorId: pid })));

    // Dev/testing convenience: wipe the room back to an empty lobby and tell every
    // client to re-auth (so even "game in progress" tabs return to the join screen).
    socket.on('resetRoom', () => {
      room.reset();
      io.emit('roomReset');
    });

    socket.on('disconnect', () => {
      room.handleDisconnect(socket.id);
    });
  });

  return { httpServer, io, room };
}
