/**
 * Integration tests for lobby bot management (issue 0016) over the Socket.IO seam:
 * the owner adds/removes bots, the server auto-assigns an available color and a
 * "Bot N" name, the projection exposes `isBot`, and non-owners are refused.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { BOARD, type BoardState, type GameView } from '@catan/shared';
import { createGameServer } from '../src/app.js';

const COLORS = ['red', 'blue', 'orange'] as const;

class TestClient {
  readonly socket: Socket;
  token?: string;
  view?: GameView;
  private waiters: { pred: (v: GameView) => boolean; resolve: (v: GameView) => void; timer: NodeJS.Timeout }[] = [];

  constructor(port: number) {
    this.socket = connect(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
    this.socket.on('authed', (m: { token: string }) => (this.token = m.token));
    this.socket.on('snapshot', (m: { view: GameView }) => {
      this.view = m.view;
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m.view)) {
          clearTimeout(w.timer);
          w.resolve(m.view);
          return false;
        }
        return true;
      });
    });
  }

  emit(event: string, payload?: unknown): void {
    if (payload === undefined) this.socket.emit(event);
    else this.socket.emit(event, payload);
  }

  waitFor(pred: (v: GameView) => boolean, ms = 4000): Promise<GameView> {
    if (this.view && pred(this.view)) return Promise.resolve(this.view);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('waitFor: timed out')), ms);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  close(): void {
    this.socket.disconnect();
  }
}

interface Harness {
  clients: TestClient[];
  seats: string[];
  close: () => void;
}

const harnesses: Harness[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.close();
});

/** Boot a server and seat `n` humans in the LOBBY (no game start). */
async function lobby(n: number): Promise<Harness> {
  const { httpServer, io } = createGameServer({});
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as AddressInfo).port;

  const clients: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const c = new TestClient(port);
    c.emit('auth', {});
    await c.waitFor(() => true);
    c.emit('join', { name: `p${i}`, color: COLORS[i] });
    await c.waitFor((v) => v.youId != null);
    clients.push(c);
  }
  const seats = clients.map((c) => c.view!.youId!);
  const harness: Harness = {
    clients,
    seats,
    close: () => {
      for (const c of clients) c.close();
      io.close();
      httpServer.close();
    },
  };
  harnesses.push(harness);
  return harness;
}

// --- Helpers for driving a human seat through a bot-populated game -------------

function firstLegalVertex(board: BoardState): number {
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (board.buildings[v]) continue;
    if (BOARD.vertices[v].vertices.every((n) => !board.buildings[n])) return v;
  }
  throw new Error('no legal setup vertex');
}

function firstFreeEdge(board: BoardState, vertex: number): number {
  const e = BOARD.vertices[vertex].edges.find((eid) => !board.roads[eid]);
  if (e == null) throw new Error('no free setup edge');
  return e;
}

/** A legal robber destination for a human seat, with a victim if the tile has one. */
function legalRobberTile(view: GameView, mySeat: string): { tile: number; stealFrom: string | null } {
  const board = view.board!;
  for (let t = 0; t < BOARD.tiles.length; t++) {
    if (t === board.robberTile) continue;
    const owners = new Set<string>();
    for (const v of BOARD.tiles[t].vertices) {
      const b = board.buildings[v];
      if (b && b.owner !== mySeat) owners.add(b.owner);
    }
    const victim = view.players.find((p) => owners.has(p.id) && p.handCount > 0);
    return { tile: t, stealFrom: victim?.id ?? null };
  }
  return { tile: board.robberTile === 0 ? 1 : 0, stealFrom: null };
}

describe('lobby bots over the socket seam', () => {
  it('lets the owner add a bot with an auto color and "Bot N" name', async () => {
    const { clients } = await lobby(2); // red, blue taken
    const host = clients[0];
    host.emit('addBot');
    await host.waitFor((v) => v.players.length === 3);

    const bot = host.view!.players.find((p) => p.isBot)!;
    expect(bot.isBot).toBe(true);
    expect(bot.name).toBe('Bot 1');
    expect(['orange', 'white']).toContain(bot.color); // an available color
  });

  it('lets the owner remove a bot it added', async () => {
    const { clients } = await lobby(2);
    const host = clients[0];
    host.emit('addBot');
    await host.waitFor((v) => v.players.length === 3);
    const botId = host.view!.players.find((p) => p.isBot)!.id;

    host.emit('removeBot', { playerId: botId });
    await host.waitFor((v) => v.players.length === 2);
    expect(host.view!.players.some((p) => p.isBot)).toBe(false);
  });

  it('refuses a non-owner adding a bot', async () => {
    const { clients } = await lobby(2);
    const nonOwner = clients[1];
    nonOwner.emit('addBot');
    // The add is rejected, so the roster never grows. Give it a moment to settle.
    await new Promise((r) => setTimeout(r, 150));
    expect(nonOwner.view!.players.length).toBe(2);
  });

  it('fills distinct colors when several bots are added', async () => {
    const { clients } = await lobby(2);
    const host = clients[0];
    host.emit('addBot');
    await host.waitFor((v) => v.players.length === 3);
    host.emit('addBot');
    await host.waitFor((v) => v.players.length === 4);

    const colors = host.view!.players.map((p) => p.color);
    expect(new Set(colors).size).toBe(4); // all four base colors, no clash
    const botNames = host.view!.players.filter((p) => p.isBot).map((p) => p.name).sort();
    expect(botNames).toEqual(['Bot 1', 'Bot 2']);
  });
});

interface BotGame {
  host: TestClient;
  humanSeat: string;
}

/**
 * Boot a server (with deterministic dice), seat one human owner, add `bots` bots,
 * start, and drive the snake draft — the human places on its own turns while the
 * server auto-drives the bot seats. Returns once play has reached PLAY.
 */
async function startBotGame(bots: number, rollDice: () => [number, number]): Promise<BotGame> {
  const { httpServer, io } = createGameServer({ rollDice });
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as AddressInfo).port;

  const host = new TestClient(port);
  host.emit('auth', {});
  await host.waitFor(() => true);
  host.emit('join', { name: 'human', color: 'red' });
  await host.waitFor((v) => v.youId != null);
  const humanSeat = host.view!.youId!;

  for (let i = 0; i < bots; i++) {
    host.emit('addBot');
    await host.waitFor((v) => v.players.length === 2 + i);
  }

  host.emit('startGame');
  await host.waitFor((v) => v.phase === 'SETUP');

  let guard = 0;
  while (host.view!.phase === 'SETUP' && guard++ < 100) {
    const v = host.view!;
    if (v.setup!.currentPlayerId !== humanSeat) {
      // A bot's placement — the server drives it; wait for the turn to move on.
      await host.waitFor((s) => s.phase !== 'SETUP' || s.setup!.currentPlayerId !== v.setup!.currentPlayerId);
      continue;
    }
    if (v.setup!.pending === 'settlement') {
      const vtx = firstLegalVertex(v.board!);
      host.emit('placeSetupSettlement', { vertex: vtx });
      await host.waitFor((s) => !!s.board?.buildings[vtx]);
    } else {
      const edge = firstFreeEdge(v.board!, v.setup!.lastSettlement!);
      host.emit('placeSetupRoad', { edge });
      await host.waitFor((s) => !!s.board?.roads[edge]);
    }
  }
  await host.waitFor((v) => v.phase === 'PLAY');

  harnesses.push({ clients: [host], seats: [humanSeat], close: () => { host.close(); io.close(); httpServer.close(); } });
  return { host, humanSeat };
}

/** Play `turns` full PLAY turns, handling the human's obligations; bots auto-play. */
async function playTurns(game: BotGame, turns: number, opts: { sevens: boolean }): Promise<void> {
  const { host, humanSeat } = game;
  const target = host.view!.turn!.turnNumber + turns;
  let guard = 0;
  while (host.view!.turn!.turnNumber < target && host.view!.phase === 'PLAY' && guard++ < 400) {
    const v = host.view!;
    if (v.turn!.currentPlayerId !== humanSeat) {
      await host.waitFor(
        (s) => s.phase !== 'PLAY' || s.turn!.currentPlayerId === humanSeat || s.turn!.turnNumber >= target,
      );
      continue;
    }
    switch (v.turn!.phase) {
      case 'MUST_ROLL':
        host.emit('roll');
        await host.waitFor((s) => s.turn!.phase !== 'MUST_ROLL' || s.turn!.currentPlayerId !== humanSeat);
        break;
      case 'MOVE_ROBBER': {
        const { tile, stealFrom } = legalRobberTile(v, humanSeat);
        host.emit('moveRobber', { tile, stealFrom });
        await host.waitFor((s) => s.turn!.phase !== 'MOVE_ROBBER');
        break;
      }
      case 'ACTIONS':
        host.emit('endTurn');
        await host.waitFor((s) => s.turn!.currentPlayerId !== humanSeat || s.turn!.turnNumber >= target);
        break;
      default:
        await host.waitFor((s) => s.turn!.phase !== v.turn!.phase);
    }
    void opts;
  }
}

describe('bots play through the server driver', () => {
  it('auto-places bot settlements during setup', async () => {
    const { host } = await startBotGame(2, () => [2, 3]);
    // Each of the two bots placed two settlements without the test acting for them.
    for (const p of host.view!.players.filter((pp) => pp.isBot)) {
      const owned = Object.values(host.view!.board!.buildings).filter((b) => b.owner === p.id).length;
      expect(owned).toBe(2);
    }
  });

  it('auto-takes bot turns so play cycles without stalling (non-7)', async () => {
    const game = await startBotGame(2, () => [2, 3]);
    const before = game.host.view!.turn!.turnNumber;
    await playTurns(game, 9, { sevens: false });
    expect(game.host.view!.turn!.turnNumber).toBeGreaterThanOrEqual(before + 9);
  });

  it('auto-moves the robber on bot turns when every roll is a 7', async () => {
    const game = await startBotGame(2, () => [3, 4]); // 7 every roll
    const before = game.host.view!.turn!.turnNumber;
    await playTurns(game, 6, { sevens: true });
    expect(game.host.view!.turn!.turnNumber).toBeGreaterThanOrEqual(before + 6);
  });
});
