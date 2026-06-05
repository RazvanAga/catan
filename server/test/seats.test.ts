/**
 * Integration tests for the seat lifecycle (issue 0014) over the real Socket.IO
 * seam: a booted server on an ephemeral port driven by actual socket clients.
 * Covers token reclaim, the disconnected -> vacant transition, a newcomer taking
 * over a vacant seat (inheriting its position), and auto-skipping an unclaimed
 * vacant seat's turn so play continues.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { BOARD, type BoardState, type GameView } from '@catan/shared';
import { createGameServer } from '../src/app.js';

const COLORS = ['red', 'blue', 'orange'] as const;

/** A thin socket client that tracks its token and latest snapshot. */
class TestClient {
  readonly socket: Socket;
  token?: string;
  view?: GameView;
  blocked = false;
  private waiters: { pred: (v: GameView) => boolean; resolve: (v: GameView) => void; timer: NodeJS.Timeout }[] = [];

  constructor(port: number) {
    this.socket = connect(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
    this.socket.on('authed', (m: { token: string }) => (this.token = m.token));
    this.socket.on('blocked', () => (this.blocked = true));
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

  auth(token?: string): void {
    this.socket.emit('auth', token ? { token } : {});
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

const ownedBuildings = (view: GameView, seatId: string): number =>
  Object.values(view.board?.buildings ?? {}).filter((b) => b.owner === seatId).length;

const seatView = (view: GameView, seatId: string) => view.players.find((p) => p.id === seatId)!;

interface Harness {
  port: number;
  clients: TestClient[];
  seats: string[];
  /** Spawn an extra client against the same server (e.g. a reconnect/newcomer). */
  newClient: () => TestClient;
  close: () => void;
}

const harnesses: Harness[] = [];

afterEach(() => {
  for (const h of harnesses.splice(0)) h.close();
});

/** Boot a server, seat three players, and play through setup into PLAY. */
async function startPlayGame(vacancyMs: number): Promise<Harness> {
  const { httpServer, io } = createGameServer({ vacancyMs, rollDice: () => [3, 3] });
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as AddressInfo).port;

  const extras: TestClient[] = [];
  const newClient = (): TestClient => {
    const c = new TestClient(port);
    extras.push(c);
    return c;
  };

  const clients: TestClient[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new TestClient(port);
    c.auth();
    await c.waitFor(() => true); // first lobby snapshot
    c.emit('join', { name: `p${i}`, color: COLORS[i] });
    await c.waitFor((v) => v.youId != null);
    clients.push(c);
  }
  const seats = clients.map((c) => c.view!.youId!);
  const bySeat = new Map(seats.map((s, i) => [s, clients[i]]));

  const host = clients[0];
  host.emit('startGame');
  await host.waitFor((v) => v.phase === 'SETUP');

  let guard = 0;
  while (host.view!.phase === 'SETUP' && guard++ < 80) {
    const v = host.view!;
    const actor = bySeat.get(v.setup!.currentPlayerId)!;
    if (v.setup!.pending === 'settlement') {
      const vtx = firstLegalVertex(v.board!);
      actor.emit('placeSetupSettlement', { vertex: vtx });
      await host.waitFor((s) => !!s.board?.buildings[vtx]);
    } else {
      const edge = firstFreeEdge(v.board!, v.setup!.lastSettlement!);
      actor.emit('placeSetupRoad', { edge });
      await host.waitFor((s) => !!s.board?.roads[edge]);
    }
  }
  await host.waitFor((v) => v.phase === 'PLAY');

  const harness: Harness = {
    port,
    clients,
    seats,
    newClient,
    close: () => {
      for (const c of [...clients, ...extras]) c.close();
      io.close();
      httpServer.close();
    },
  };
  harnesses.push(harness);
  return harness;
}

describe('seat lifecycle over the socket seam', () => {
  it('reclaims the exact seat from a returning token', async () => {
    const { clients, seats, newClient } = await startPlayGame(10_000);
    const [host, p1] = clients;
    const p1Token = p1.token!;

    p1.close();
    await host.waitFor((v) => !seatView(v, seats[1]).connected);

    // A fresh socket presenting the same token gets that seat back, live again.
    const reborn = newClient();
    reborn.auth(p1Token);
    await reborn.waitFor((v) => v.youId === seats[1]);
    expect(seatView(reborn.view!, seats[1]).connected).toBe(true);
    expect(seatView(reborn.view!, seats[1]).vacant).toBe(false);
  });

  it('transitions a disconnected seat to vacant after the timeout', async () => {
    const { clients, seats } = await startPlayGame(120);
    const [host, p1] = clients;

    p1.close();
    // First greyed (disconnected but still reclaimable)…
    await host.waitFor((v) => !seatView(v, seats[1]).connected && !seatView(v, seats[1]).vacant);
    // …then vacant once the clock runs out.
    await host.waitFor((v) => seatView(v, seats[1]).vacant);
    expect(seatView(host.view!, seats[1]).connected).toBe(false);
  });

  it('lets a newcomer take over a vacant seat and inherit its position', async () => {
    const { clients, seats, newClient } = await startPlayGame(120);
    const [host, p1] = clients;
    const p1Seat = seats[1];
    const piecesBefore = ownedBuildings(host.view!, p1Seat);
    expect(piecesBefore).toBe(2); // two setup settlements

    p1.close();
    await host.waitFor((v) => seatView(v, p1Seat).vacant);

    // A brand-new visitor (no token) is handed the open seat and its full position.
    const newcomer = newClient();
    newcomer.auth();
    await newcomer.waitFor((v) => v.youId === p1Seat);
    expect(ownedBuildings(newcomer.view!, p1Seat)).toBe(piecesBefore);
    expect(newcomer.view!.you).not.toBeNull();
    // The seat is live again for everyone.
    await host.waitFor((v) => seatView(v, p1Seat).connected && !seatView(v, p1Seat).vacant);
  });

  it("auto-skips an unclaimed vacant seat's turn", async () => {
    const { clients, seats } = await startPlayGame(120);
    const [host, p1] = clients;
    // p0 (host) is the current player; p1 is next in turn order.
    expect(host.view!.turn!.currentPlayerId).toBe(seats[0]);

    p1.close();
    await host.waitFor((v) => seatView(v, seats[1]).vacant);

    // p0 takes its turn; ending it would pass to the vacant p1, who is skipped.
    host.emit('roll');
    await host.waitFor((v) => v.turn!.phase === 'ACTIONS');
    host.emit('endTurn');
    await host.waitFor((v) => v.turn!.currentPlayerId === seats[2]);
    expect(host.view!.turn!.currentPlayerId).toBe(seats[2]);
  });
});
