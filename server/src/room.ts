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
  BotMove,
  GameEvent,
  GameState,
  IllegalActionError,
  PLAYER_COLORS,
  PlayerColor,
  Resource,
  ResourceCounts,
  ServerToClientEvents,
  decideBotMove,
  initialState,
  pickRandomCard,
  projectStateForPlayer,
  reduce,
} from '@catan/shared';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';

type ClientSocket = Socket<Record<string, never>, ServerToClientEvents>;

interface Viewer {
  socket: ClientSocket;
  /** The seat this viewer occupies, or null for an unseated lobby visitor. */
  playerId: string | null;
}

/** After this long disconnected, a seat goes vacant (claimable + auto-skipped). */
const DEFAULT_VACANCY_MS = 2 * 60 * 1000;

export class Room {
  private state: GameState = initialState();
  /** Secret session token -> public seat id. The token never leaves the server. */
  private readonly tokenToPlayerId = new Map<string, string>();
  /** All currently-connected sockets, seated or not, keyed by socket id. */
  private readonly viewers = new Map<string, Viewer>();
  /** Append-only narration log for the whole room's life. */
  private readonly eventLog: GameEvent[] = [];
  /** Pending "disconnected -> vacant" timers, keyed by seat id. */
  private readonly vacancyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly vacancyMs: number;
  /** Dice source for bot rolls — the same RNG the human `roll` handler uses. */
  private readonly rollDice: () => [number, number];

  constructor(opts: { vacancyMs?: number; rollDice?: () => [number, number] } = {}) {
    this.vacancyMs = opts.vacancyMs ?? DEFAULT_VACANCY_MS;
    this.rollDice =
      opts.rollDice ?? (() => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
  }

  get phase() {
    return this.state.phase;
  }

  /** The seat a returning token owns, if any. */
  seatForToken(token: string): string | null {
    return this.tokenToPlayerId.get(token) ?? null;
  }

  /** True while at least one seat is vacant and open for a newcomer to claim. */
  hasVacantSeat(): boolean {
    return this.state.players.some((p) => p.vacant);
  }

  /**
   * Pick the card to steal from `victimId`, server-side (the one piece of robber
   * RNG). The reducer stays pure and re-validates the choice; this just reads the
   * authoritative hand the projection never exposes. Null if the victim is empty.
   */
  pickStolenCard(victimId: string): Resource | null {
    const victim = this.state.players.find((p) => p.id === victimId);
    return victim ? pickRandomCard(victim.hand) : null;
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
   * Apply a (client-driven) intent. Throws (via `reduce`) if illegal — the
   * caller reports the error to just that client. On success the new events are
   * appended, every viewer is re-broadcast, and we settle any vacant seats that
   * the move may have handed the turn to.
   */
  apply(action: Action): void {
    this.dispatch(action);
    this.drive();
  }

  // --- Bots in the lobby (issue 0016) -----------------------------------------

  /**
   * The owner adds a bot: the server picks an available color and a "Bot N" name
   * (the bit of "RNG"/state-derived choice that stays out of the pure reducer) and
   * applies ADD_BOT, which re-validates the owner/LOBBY/room-full/color gates.
   */
  addBot(actorId: string): void {
    const color = this.firstAvailableColor();
    if (!color) throw new IllegalActionError('Cannot add a bot: room is full.');
    this.apply({ type: 'ADD_BOT', actorId, playerId: randomUUID(), name: this.nextBotName(), color });
  }

  removeBot(actorId: string, playerId: string): void {
    this.apply({ type: 'REMOVE_BOT', actorId, playerId });
  }

  /** First base-game color no seat is using, or undefined when all four are taken. */
  private firstAvailableColor(): PlayerColor | undefined {
    const taken = new Set(this.state.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !taken.has(c));
  }

  /** The lowest "Bot N" name not already in use, so removed bots free their name. */
  private nextBotName(): string {
    const taken = new Set(this.state.players.map((p) => p.name));
    for (let n = 1; ; n++) {
      const name = `Bot ${n}`;
      if (!taken.has(name)) return name;
    }
  }

  /** Reduce + broadcast a single action, without the vacant-seat settling pass. */
  private dispatch(action: Action): void {
    const { state, events } = reduce(this.state, action);
    this.state = state;
    this.eventLog.push(...events);
    this.broadcast(events);
  }

  /**
   * Wipe the room back to an empty lobby: clear state, seats, tokens, timers, and
   * the event log. Connected sockets stay (their `auth` re-seats them); callers
   * should prompt clients to re-auth. Dev/testing only.
   */
  reset(): void {
    this.state = initialState();
    this.tokenToPlayerId.clear();
    this.eventLog.length = 0;
    for (const t of this.vacancyTimers.values()) clearTimeout(t);
    this.vacancyTimers.clear();
    for (const viewer of this.viewers.values()) viewer.playerId = null;
  }

  // --- Seat lifecycle (issue 0014) --------------------------------------------

  /**
   * A returning player reclaims their exact seat via their token: register the
   * socket, cancel any pending vacancy timer, and mark the seat connected again
   * (which also clears a vacant flag if the seat had already timed out).
   */
  reclaimSeat(socketId: string, socket: ClientSocket, playerId: string): void {
    this.addViewer(socketId, socket, playerId);
    this.clearVacancyTimer(playerId);
    const seat = this.state.players.find((p) => p.id === playerId);
    if (seat && (!seat.connected || seat.vacant)) {
      this.apply({ type: 'SET_CONNECTED', playerId, connected: true });
    } else {
      this.sendSnapshotTo(socketId);
    }
  }

  /**
   * A brand-new visitor (their token owns no seat) claims an open vacant seat,
   * inheriting its full position. Binds their token to that seat id and marks it
   * connected. Returns false (so the caller can show the wall) if none is open.
   */
  claimVacantSeat(socketId: string, socket: ClientSocket, token: string): boolean {
    const vacant = this.state.players.find((p) => p.vacant);
    if (!vacant) return false;
    this.bindToken(token, vacant.id);
    this.addViewer(socketId, socket, vacant.id);
    this.clearVacancyTimer(vacant.id);
    this.apply({ type: 'SET_CONNECTED', playerId: vacant.id, connected: true });
    return true;
  }

  /**
   * Handle a socket dropping. If it was the seat's last live socket and a game is
   * in progress, grey the seat (disconnected) and start its vacancy countdown.
   * Merely disconnecting never auto-resolves anything — if the seat owes input,
   * play simply waits with a "waiting for X" banner until it returns or vacates.
   */
  handleDisconnect(socketId: string): void {
    const viewer = this.viewers.get(socketId);
    this.removeViewer(socketId);
    const playerId = viewer?.playerId;
    if (!playerId) return;
    // Another tab/socket still holds this seat? Then it stays connected.
    if ([...this.viewers.values()].some((v) => v.playerId === playerId)) return;
    if (this.state.phase !== 'SETUP' && this.state.phase !== 'PLAY') return;
    const seat = this.state.players.find((p) => p.id === playerId);
    if (!seat || !seat.connected) return;
    this.apply({ type: 'SET_CONNECTED', playerId, connected: false });
    this.startVacancyTimer(playerId);
  }

  private startVacancyTimer(playerId: string): void {
    this.clearVacancyTimer(playerId);
    const timer = setTimeout(() => {
      this.vacancyTimers.delete(playerId);
      const seat = this.state.players.find((p) => p.id === playerId);
      if (seat && !seat.connected && !seat.vacant) {
        this.dispatch({ type: 'VACATE_SEAT', playerId });
        this.drive();
      }
    }, this.vacancyMs);
    // Don't keep the process alive just for a vacancy timer.
    if (typeof timer.unref === 'function') timer.unref();
    this.vacancyTimers.set(playerId, timer);
  }

  private clearVacancyTimer(playerId: string): void {
    const timer = this.vacancyTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.vacancyTimers.delete(playerId);
    }
  }

  /**
   * Keep play moving after a state change: auto-resolve vacant seats (skip their
   * turns, auto-discard) and drive any bot seat that owes input (issue 0017),
   * interleaved, until no automated seat owes anything. A bot ending its turn may
   * hand the table to a vacant seat or another bot, so the two are driven in one
   * loop. Bounded by a guard so a logic bug degrades to stopping, never a hang.
   */
  private drive(): void {
    const guard = this.state.players.length * 200 + 100;
    for (let i = 0; i < guard; i++) {
      if (this.stepVacant()) continue;
      if (this.stepBot()) continue;
      break;
    }
  }

  /**
   * One vacant-seat resolution, if any is owed: auto-discard for a vacant seat
   * that owes a discard, else auto-skip a vacant seat whose turn it is. Only
   * vacant seats are auto-resolved — a merely disconnected human still blocks
   * (the table waits for it). Returns whether it acted.
   */
  private stepVacant(): boolean {
    const s = this.state;
    if (s.phase !== 'PLAY') return false;
    if (s.discard) {
      const owedByVacant = Object.keys(s.discard.required).find(
        (pid) => s.players.find((p) => p.id === pid)?.vacant,
      );
      if (owedByVacant) {
        this.autoDiscard(owedByVacant);
        return true;
      }
      return false; // waiting on a present (if disconnected) player's discard
    }
    const current = s.players[s.turnIndex];
    if (current?.vacant && !s.players.every((p) => p.vacant)) {
      this.dispatch({ type: 'SKIP_TURN', actorId: current.id });
      return true;
    }
    return false;
  }

  /**
   * One bot move, if a bot owes input: ask the pure policy what the owing bot
   * wants, translate it into a full action (filling RNG the same way the human
   * socket handlers do), and dispatch it. Returns whether it acted.
   */
  private stepBot(): boolean {
    const botId = this.botOwingInput();
    if (!botId) return false;
    const move = decideBotMove(this.state, botId);
    if (!move) return false;
    this.dispatch(this.botMoveToAction(botId, move));
    return true;
  }

  /** The bot whose input the game is currently waiting on, or null. */
  private botOwingInput(): string | null {
    const s = this.state;
    if (s.phase !== 'SETUP' && s.phase !== 'PLAY') return null;
    // A forced discard can be owed by a non-active bot; resolve those first.
    if (s.phase === 'PLAY' && s.turnPhase === 'DISCARD' && s.discard) {
      const ower = Object.keys(s.discard.required).find(
        (pid) => s.players.find((p) => p.id === pid)?.isBot,
      );
      return ower ?? null;
    }
    // A bot that hasn't yet answered an open (human-proposed) trade proposal.
    if (s.phase === 'PLAY' && s.trade) {
      const trade = s.trade;
      const responder = s.players.find(
        (p) => p.isBot && p.id !== trade.proposer && trade.responses[p.id] === undefined,
      );
      if (responder) return responder.id;
    }
    const current = s.players[s.turnIndex];
    return current?.isBot ? current.id : null;
  }

  /** Translate a bot's RNG-free move into a full action, supplying server RNG. */
  private botMoveToAction(botId: string, move: BotMove): Action {
    switch (move.kind) {
      case 'placeSetupSettlement':
        return { type: 'PLACE_SETUP_SETTLEMENT', actorId: botId, vertex: move.vertex };
      case 'placeSetupRoad':
        return { type: 'PLACE_SETUP_ROAD', actorId: botId, edge: move.edge };
      case 'roll':
        return { type: 'ROLL', actorId: botId, dice: this.rollDice() };
      case 'discard':
        return { type: 'DISCARD', actorId: botId, discard: move.resources };
      case 'buildCity':
        return { type: 'BUILD_CITY', actorId: botId, vertex: move.vertex };
      case 'buildSettlement':
        return { type: 'BUILD_SETTLEMENT', actorId: botId, vertex: move.vertex };
      case 'buildRoad':
        return { type: 'BUILD_ROAD', actorId: botId, edge: move.edge };
      case 'buyDevCard':
        return { type: 'BUY_DEV_CARD', actorId: botId };
      case 'respondTrade':
        return { type: 'RESPOND_TRADE', actorId: botId, response: move.response };
      case 'playDevCard': {
        const p = move.play;
        if (p.card === 'knight') {
          return {
            type: 'PLAY_DEV_CARD',
            actorId: botId,
            play: {
              card: 'knight',
              tile: p.tile,
              stealFrom: p.stealFrom,
              stolen: p.stealFrom ? this.pickStolenCard(p.stealFrom) : null,
            },
          };
        }
        return { type: 'PLAY_DEV_CARD', actorId: botId, play: p };
      }
      case 'moveRobber':
        return {
          type: 'MOVE_ROBBER',
          actorId: botId,
          tile: move.tile,
          stealFrom: move.stealFrom,
          stolen: move.stealFrom ? this.pickStolenCard(move.stealFrom) : null,
        };
      case 'endTurn':
        return { type: 'END_TURN', actorId: botId };
    }
  }

  /** Discard the required number of (randomly chosen) cards for a vacant seat. */
  private autoDiscard(playerId: string): void {
    const need = this.state.discard?.required[playerId] ?? 0;
    const seat = this.state.players.find((p) => p.id === playerId);
    if (!seat || need <= 0) return;
    const hand: ResourceCounts = { ...seat.hand };
    const discard: Partial<ResourceCounts> = {};
    for (let i = 0; i < need; i++) {
      const card = pickRandomCard(hand);
      if (!card) break;
      hand[card] -= 1;
      discard[card] = (discard[card] ?? 0) + 1;
    }
    this.dispatch({ type: 'DISCARD', actorId: playerId, discard });
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
