/**
 * Bot decision policy (issue 0017): a pure function that, given the full game
 * state and a bot's seat id, returns the single next RNG-free intent the bot
 * wants — or null when the bot owes nothing right now. The server driver calls
 * it repeatedly (filling RNG, re-validating through `reduce`), so a bot's whole
 * turn emerges as a sequence of single moves.
 *
 * The bot reads the full `GameState` (it runs inside the trusted server), but its
 * moves are still re-validated by the same reducer a human's go through, so a bug
 * can never produce an illegal effect — at worst a rejected move.
 *
 * `BotMove` mirrors the client→server inputs minus the actor id and minus any
 * server RNG (dice faces, the stolen card): the driver fills those in. This slice
 * covers a non-stalling but unproductive loop — setup placement, roll, end-turn,
 * and the reactive 7 phases (discard, move robber). Building, dev cards, and
 * trade responses arrive in later slices.
 */

import { BOARD } from '../board/index.js';
import { BUILD_COSTS, GameState, PIECE_LIMITS, Resource, ResourceCounts, TradeResponse } from '../types.js';
import { RESOURCES } from '../types.js';
import {
  canAfford,
  edgeConnectsToNetwork,
  getPlayer,
  handTotal,
  hasRoadTouchingVertex,
  robberVictims,
  satisfiesDistanceRule,
} from './helpers.js';
import { publicVictoryPoints } from './scoring.js';
import { bestBankRatio } from './trade.js';

/** A dev-card play the bot wants, RNG-free (a knight's stolen card is server-rolled). */
export type BotDevPlay =
  | { card: 'knight'; tile: number; stealFrom: string | null }
  | { card: 'road_building'; edges: number[] }
  | { card: 'year_of_plenty'; resources: Resource[] }
  | { card: 'monopoly'; resource: Resource };

export type BotMove =
  | { kind: 'placeSetupSettlement'; vertex: number }
  | { kind: 'placeSetupRoad'; edge: number }
  | { kind: 'roll' }
  | { kind: 'discard'; resources: Partial<ResourceCounts> }
  | { kind: 'moveRobber'; tile: number; stealFrom: string | null }
  | { kind: 'respondTrade'; response: TradeResponse }
  | { kind: 'playDevCard'; play: BotDevPlay }
  | { kind: 'buildCity'; vertex: number }
  | { kind: 'buildSettlement'; vertex: number }
  | { kind: 'buildRoad'; edge: number }
  | { kind: 'buyDevCard' }
  | { kind: 'tradeBank'; give: Resource; receive: Resource }
  | { kind: 'endTurn' };

export function decideBotMove(state: GameState, botId: string): BotMove | null {
  // A forced discard is owed regardless of whose turn it is; resolve it first.
  if (state.phase === 'PLAY' && state.turnPhase === 'DISCARD') {
    const owed = state.discard?.required[botId] ?? 0;
    return owed > 0 ? { kind: 'discard', resources: chooseDiscard(state, botId, owed) } : null;
  }

  // A non-active bot responds to an open (human-proposed) trade it hasn't answered.
  if (
    state.phase === 'PLAY' &&
    state.trade &&
    state.trade.proposer !== botId &&
    state.trade.responses[botId] === undefined
  ) {
    return { kind: 'respondTrade', response: decideTradeResponse(state, botId) };
  }

  // Everything else is only the current player's to act on.
  const current = state.players[state.turnIndex];
  if (!current || current.id !== botId) return null;

  if (state.phase === 'SETUP') {
    return state.setup?.pending === 'road' ? decideSetupRoad(state) : decideSetupSettlement(state);
  }

  if (state.phase === 'PLAY') {
    switch (state.turnPhase) {
      case 'MUST_ROLL':
        return { kind: 'roll' };
      case 'MOVE_ROBBER':
        return decideRobber(state, botId);
      case 'ACTIONS':
        return decideActions(state, botId);
    }
  }
  return null;
}

/** Probability "pips" of a number token (5 for 6/8 … 1 for 2/12), 0 for none. */
function pip(token: number | null): number {
  return token == null ? 0 : 6 - Math.abs(7 - token);
}

/** Total production pips of the tiles touching a vertex — a cheap value heuristic. */
function vertexPips(state: GameState, vertex: number): number {
  const tokens = state.board!.setup.tileTokens;
  return BOARD.vertices[vertex].tiles.reduce((sum, t) => sum + pip(tokens[t]), 0);
}

/** Pick the legal setup vertex with the highest production pips (ties: lowest id). */
function decideSetupSettlement(state: GameState): BotMove | null {
  const board = state.board!;
  let best = -1;
  let bestScore = -1;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (!satisfiesDistanceRule(board, v)) continue;
    const score = vertexPips(state, v);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best >= 0 ? { kind: 'placeSetupSettlement', vertex: best } : null;
}

/** Any free edge incident to the just-placed settlement. */
function decideSetupRoad(state: GameState): BotMove | null {
  const board = state.board!;
  const v = state.setup?.lastSettlement;
  if (v == null) return null;
  for (const e of BOARD.vertices[v].edges) {
    if (!board.roads[e]) return { kind: 'placeSetupRoad', edge: e };
  }
  return null;
}

/** Shed exactly `need` cards, always dropping from the largest holding first. */
function chooseDiscard(state: GameState, botId: string, need: number): Partial<ResourceCounts> {
  const player = getPlayer(state, botId);
  const hand: ResourceCounts = { ...(player?.hand ?? { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 }) };
  const out: Partial<ResourceCounts> = {};
  for (let i = 0; i < need; i++) {
    let pick: Resource | null = null;
    let max = 0;
    for (const r of RESOURCES) {
      if (hand[r] > max) {
        max = hand[r];
        pick = r;
      }
    }
    if (!pick) break;
    hand[pick] -= 1;
    out[pick] = (out[pick] ?? 0) + 1;
  }
  return out;
}

/**
 * Move the robber to hurt the strongest opponent: pick the tile whose adjacent
 * opponents have the most public VP, avoiding tiles touching the bot's own
 * buildings where possible. Then steal from the richest legal victim there.
 */
function decideRobber(state: GameState, botId: string): BotMove {
  const { tile, stealFrom } = chooseRobberTarget(state, botId);
  return { kind: 'moveRobber', tile, stealFrom };
}

/**
 * Pick where to move the robber (shared by the 7 and the Knight): the tile whose
 * adjacent opponents have the most public VP, avoiding our own buildings where
 * possible; then the richest legal victim there (or null when none).
 */
function chooseRobberTarget(state: GameState, botId: string): { tile: number; stealFrom: string | null } {
  const board = state.board!;
  let bestTile = -1;
  let bestScore = -Infinity;
  for (let t = 0; t < BOARD.tiles.length; t++) {
    if (t === board.robberTile) continue;
    const owners = new Set<string>();
    let touchesSelf = false;
    for (const v of BOARD.tiles[t].vertices) {
      const b = board.buildings[v];
      if (!b) continue;
      if (b.owner === botId) touchesSelf = true;
      else owners.add(b.owner);
    }
    let score = 0;
    for (const o of owners) score += publicVictoryPoints(state, o);
    if (touchesSelf) score -= 100; // never block our own production unless forced
    if (score > bestScore) {
      bestScore = score;
      bestTile = t;
    }
  }
  if (bestTile < 0) bestTile = board.robberTile === 0 ? 1 : 0; // defensive fallback

  const victims = robberVictims(state, bestTile, botId);
  let stealFrom: string | null = null;
  for (const id of victims) {
    if (stealFrom == null || handTotal(getPlayer(state, id)!.hand) > handTotal(getPlayer(state, stealFrom)!.hand)) {
      stealFrom = id;
    }
  }
  return { tile: bestTile, stealFrom };
}

// --- ACTIONS: spend resources, high value first (issue 0018) ------------------

function countOwn(state: GameState, botId: string, kind: 'road' | 'settlement' | 'city'): number {
  const board = state.board!;
  if (kind === 'road') return Object.values(board.roads).filter((r) => r.owner === botId).length;
  return Object.values(board.buildings).filter(
    (b) => b.owner === botId && b.city === (kind === 'city'),
  ).length;
}

/**
 * The action-phase ladder: take the first affordable, legal, highest-value build
 * — city, then settlement, then road — then buy a dev card with any surplus, else
 * end the turn. Each call yields one move; spending one move's resources lets the
 * driver re-ask, so a whole build-out emerges as a sequence that always reaches
 * END_TURN (resources strictly decrease, so it terminates).
 */
function decideActions(state: GameState, botId: string): BotMove {
  const dev = decidePlayDevCard(state, botId);
  if (dev) return dev;

  const hand = getPlayer(state, botId)!.hand;

  if (canAfford(hand, BUILD_COSTS.city) && countOwn(state, botId, 'city') < PIECE_LIMITS.city) {
    const v = bestCityVertex(state, botId);
    if (v != null) return { kind: 'buildCity', vertex: v };
  }
  if (canAfford(hand, BUILD_COSTS.settlement) && countOwn(state, botId, 'settlement') < PIECE_LIMITS.settlement) {
    const v = bestSettlementVertex(state, botId);
    if (v != null) return { kind: 'buildSettlement', vertex: v };
  }
  if (canAfford(hand, BUILD_COSTS.road) && countOwn(state, botId, 'road') < PIECE_LIMITS.road) {
    const e = bestRoadEdge(state, botId);
    if (e != null) return { kind: 'buildRoad', edge: e };
  }
  if (state.devDeck.length > 0 && canAfford(hand, BUILD_COSTS.devCard)) {
    return { kind: 'buyDevCard' };
  }
  const trade = decideBankTrade(state, botId);
  if (trade) return trade;
  return { kind: 'endTurn' };
}

// --- Bank/port trading to unblock a build (issue 0021) -----------------------

/**
 * When nothing is affordable, convert a surplus resource at the best bank/port
 * ratio toward the highest-priority build the bot has a legal target for — but
 * only when that build is actually *reachable* by trading (the surplus can cover
 * the whole deficit). One trade per call; each strictly shrinks the hand, so the
 * sequence terminates at the build (or END_TURN), never an endless trade loop.
 */
function decideBankTrade(state: GameState, botId: string): BotMove | null {
  const targets: { cost: Partial<ResourceCounts>; ok: boolean }[] = [
    {
      cost: BUILD_COSTS.city,
      ok: countOwn(state, botId, 'city') < PIECE_LIMITS.city && bestCityVertex(state, botId) != null,
    },
    {
      cost: BUILD_COSTS.settlement,
      ok:
        countOwn(state, botId, 'settlement') < PIECE_LIMITS.settlement &&
        bestSettlementVertex(state, botId) != null,
    },
    {
      cost: BUILD_COSTS.road,
      ok: countOwn(state, botId, 'road') < PIECE_LIMITS.road && bestRoadEdge(state, botId) != null,
    },
  ];
  for (const t of targets) {
    if (!t.ok) continue;
    const move = tradeTowardBuild(state, botId, t.cost);
    if (move) return move;
  }
  return null;
}

/** One bank trade toward `cost`, if the bot's surplus can fully cover its deficit. */
function tradeTowardBuild(state: GameState, botId: string, cost: Partial<ResourceCounts>): BotMove | null {
  const hand = getPlayer(state, botId)!.hand;
  const need: Partial<ResourceCounts> = {};
  let totalDeficit = 0;
  for (const r of RESOURCES) {
    const gap = (cost[r] ?? 0) - hand[r];
    if (gap > 0) {
      need[r] = gap;
      totalDeficit += gap;
    }
  }
  if (totalDeficit === 0) return null; // already affordable (handled earlier)

  // Resources held beyond what the build reserves can be traded away.
  let tradableOutput = 0;
  let give: Resource | null = null;
  let giveRatio = Infinity;
  for (const r of RESOURCES) {
    const surplus = hand[r] - (cost[r] ?? 0);
    if (surplus <= 0) continue;
    const ratio = bestBankRatio(state, botId, r);
    if (surplus < ratio) continue;
    tradableOutput += Math.floor(surplus / ratio);
    // Prefer the cheapest ratio, then the deepest surplus, as the resource to give.
    if (ratio < giveRatio || (ratio === giveRatio && give != null && surplus > hand[give] - (cost[give] ?? 0))) {
      give = r;
      giveRatio = ratio;
    }
  }
  if (give == null || tradableOutput < totalDeficit) return null; // build not reachable

  // Receive the resource we're shortest on.
  let receive: Resource | null = null;
  for (const r of RESOURCES) {
    if ((need[r] ?? 0) > (receive ? need[receive] ?? 0 : 0)) receive = r;
  }
  return receive ? { kind: 'tradeBank', give, receive } : null;
}

/** The bot's own settlement (not yet a city) with the highest production pips. */
function bestCityVertex(state: GameState, botId: string): number | null {
  const board = state.board!;
  let best: number | null = null;
  let bestScore = -1;
  for (const [vid, b] of Object.entries(board.buildings)) {
    if (b.owner !== botId || b.city) continue;
    const v = Number(vid);
    const score = vertexPips(state, v);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/** A legal settlement spot (distance rule + own road) with the highest pips. */
function bestSettlementVertex(state: GameState, botId: string): number | null {
  const board = state.board!;
  let best: number | null = null;
  let bestScore = -1;
  for (let v = 0; v < BOARD.vertices.length; v++) {
    if (!satisfiesDistanceRule(board, v)) continue;
    if (!hasRoadTouchingVertex(board, v, botId)) continue;
    const score = vertexPips(state, v);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/**
 * Legal free roads connected to the bot's network, sorted best-first: a road that
 * reaches a new (empty, distance-legal) high-pip settlement spot outranks one that
 * reaches none, so the network grows toward useful expansion.
 */
function legalRoadEdges(state: GameState, botId: string): number[] {
  const board = state.board!;
  const scored: { e: number; score: number }[] = [];
  for (let e = 0; e < BOARD.edges.length; e++) {
    if (board.roads[e]) continue;
    if (!edgeConnectsToNetwork(board, e, botId)) continue;
    let score = 0;
    for (const v of BOARD.edges[e].vertices) {
      if (satisfiesDistanceRule(board, v)) score = Math.max(score, vertexPips(state, v) + 1);
    }
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e - b.e);
  return scored.map((s) => s.e);
}

function bestRoadEdge(state: GameState, botId: string): number | null {
  return legalRoadEdges(state, botId)[0] ?? null;
}

// --- Development cards (issue 0019) -------------------------------------------

/**
 * Play at most one development card per turn, never one bought this turn. Ordered
 * by impact: a knight (move the robber + steal, toward Largest Army), then a
 * monopoly when opponents hold a worthwhile pile, then year-of-plenty toward a
 * build, then road building when legal roads exist. Victory-point cards are never
 * played — they only count. Returns null when nothing is worth playing.
 */
function decidePlayDevCard(state: GameState, botId: string): BotMove | null {
  if (state.devCardPlayedThisTurn) return null;
  const me = getPlayer(state, botId)!;
  const playable = (card: string): boolean =>
    me.devCards.some((d) => d.card === card && d.boughtOnTurn !== state.turnNumber);

  if (playable('knight')) {
    const { tile, stealFrom } = chooseRobberTarget(state, botId);
    return { kind: 'playDevCard', play: { card: 'knight', tile, stealFrom } };
  }
  if (playable('monopoly')) {
    const resource = bestMonopolyResource(state, botId);
    if (resource) return { kind: 'playDevCard', play: { card: 'monopoly', resource } };
  }
  if (playable('year_of_plenty')) {
    return { kind: 'playDevCard', play: { card: 'year_of_plenty', resources: bestYearOfPlenty(state, botId) } };
  }
  if (playable('road_building')) {
    const all = legalRoadEdges(state, botId);
    const room = PIECE_LIMITS.road - countOwn(state, botId, 'road');
    const edges = all.slice(0, Math.min(2, room));
    if (edges.length >= 1) return { kind: 'playDevCard', play: { card: 'road_building', edges } };
  }
  return null;
}

/** The resource opponents hold the most of in total (worth monopolizing), or null. */
function bestMonopolyResource(state: GameState, botId: string): Resource | null {
  let best: Resource | null = null;
  let bestTotal = 0;
  for (const r of RESOURCES) {
    let total = 0;
    for (const p of state.players) if (p.id !== botId) total += p.hand[r];
    if (total > bestTotal) {
      bestTotal = total;
      best = r;
    }
  }
  return best;
}

// --- Trade responses (issue 0020) --------------------------------------------

function sumMap(map: Partial<ResourceCounts>): number {
  return (Object.values(map) as number[]).reduce((a, b) => a + b, 0);
}

/**
 * Accept a proposed trade only if the bot can pay what's wanted and the swap is
 * non-losing — it receives at least as many cards as it gives. Bots never counter
 * or initiate, so this is the only player-trade move a bot makes.
 */
function decideTradeResponse(state: GameState, botId: string): TradeResponse {
  const trade = state.trade!;
  const me = getPlayer(state, botId)!;
  // The proposer offers `give` (which the bot would receive) for `want` (which the
  // bot would pay). The responder's side is therefore: pay `want`, gain `give`.
  if (!canAfford(me.hand, trade.want)) return 'decline';
  return sumMap(trade.give) >= sumMap(trade.want) ? 'accept' : 'decline';
}

/** Two resources that move the bot toward its cheapest unaffordable build. */
function bestYearOfPlenty(state: GameState, botId: string): Resource[] {
  const hand = getPlayer(state, botId)!.hand;
  for (const cost of [BUILD_COSTS.city, BUILD_COSTS.settlement, BUILD_COSTS.road, BUILD_COSTS.devCard]) {
    const missing: Resource[] = [];
    for (const r of RESOURCES) {
      const gap = ((cost as Partial<ResourceCounts>)[r] ?? 0) - hand[r];
      for (let i = 0; i < gap; i++) missing.push(r);
    }
    if (missing.length === 1) return [missing[0], missing[0]];
    if (missing.length === 2) return missing;
  }
  return ['wheat', 'ore'];
}
