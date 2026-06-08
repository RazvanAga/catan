/**
 * Integration tests for lobby bot management (issue 0016) over the Socket.IO seam:
 * the owner adds/removes bots, the server auto-assigns an available color and a
 * "Bot N" name, the projection exposes `isBot`, and non-owners are refused.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { GameView } from '@catan/shared';
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
