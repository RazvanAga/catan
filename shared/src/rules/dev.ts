/**
 * Development cards (issue 0010): buying and playing.
 *
 * Buying draws the front of the server-shuffled `devDeck` (the order is fixed at
 * START_GAME and arrives as action data, so the reducer stays pure). A bought
 * card is tagged with the turn it was bought and stays hidden from opponents
 * (the projection only exposes counts).
 *
 * Playing is guarded by two rules — at most one card per turn, and never a card
 * bought this turn — and is legal in both MUST_ROLL and ACTIONS. Effects:
 *   - knight: relocate the robber + steal (reusing resolveRobberMove) and count
 *     toward Largest Army (+2 VP at 3, reassigned only when strictly surpassed);
 *   - road_building: place up to two roads for free;
 *   - year_of_plenty: take two resources from the bank;
 *   - monopoly: take every copy of one resource from all other players.
 * Victory-point cards are never played (absent from DevCardPlay); they just
 * count toward the holder's hidden total.
 */

import {
  Action,
  BUILD_COSTS,
  DevCardHolding,
  GameEvent,
  GameState,
  PIECE_LIMITS,
  ResourceCounts,
  ReduceResult,
  RESOURCES,
} from '../types.js';
import { BOARD } from '../board/index.js';
import {
  addResources,
  assert,
  canAfford,
  currentPlayer,
  edgeConnectsToNetwork,
  negate,
  requirePlayer,
} from './helpers.js';
import { resolveRobberMove } from './robber.js';

const DEV_COST = BUILD_COSTS.devCard;

/** Number of knights a player must play to win (or take) Largest Army. */
const LARGEST_ARMY_MIN = 3;

export function buyDevCard(state: GameState, action: Extract<Action, { type: 'BUY_DEV_CARD' }>): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only buy a development card during play.');
  assert(state.turnPhase === 'ACTIONS', 'You can only buy a development card after rolling.');
  assert(currentPlayer(state).id === action.actorId, 'It is not your turn.');
  assert(state.devDeck.length > 0, 'The development deck is empty.');

  const player = requirePlayer(state, action.actorId);
  assert(canAfford(player.hand, DEV_COST), 'You cannot afford a development card.');

  const [card, ...rest] = state.devDeck;
  const holding: DevCardHolding = { card, boughtOnTurn: state.turnNumber };
  const players = state.players.map((p) =>
    p.id === action.actorId
      ? { ...p, hand: addResources(p.hand, negate(DEV_COST)), devCards: [...p.devCards, holding] }
      : p,
  );

  return {
    state: { ...state, devDeck: rest, players },
    events: [{ type: 'DEV_CARD_BOUGHT', playerId: action.actorId }],
  };
}

export function playDevCard(
  state: GameState,
  action: Extract<Action, { type: 'PLAY_DEV_CARD' }>,
): ReduceResult {
  assert(state.phase === 'PLAY', 'You can only play a development card during play.');
  assert(
    state.turnPhase === 'MUST_ROLL' || state.turnPhase === 'ACTIONS',
    'You cannot play a development card right now.',
  );
  assert(currentPlayer(state).id === action.actorId, 'It is not your turn.');
  assert(!state.devCardPlayedThisTurn, 'You have already played a development card this turn.');

  const player = requirePlayer(state, action.actorId);
  const { card } = action.play;
  // Consume one copy that was NOT bought this turn.
  const idx = player.devCards.findIndex((d) => d.card === card && d.boughtOnTurn !== state.turnNumber);
  assert(idx >= 0, `You have no playable ${card} card.`);

  // Base state: the card is spent and the once-per-turn gate is closed.
  const base: GameState = {
    ...state,
    devCardPlayedThisTurn: true,
    players: state.players.map((p) =>
      p.id === action.actorId ? { ...p, devCards: p.devCards.filter((_, i) => i !== idx) } : p,
    ),
  };
  const played: GameEvent = { type: 'DEV_CARD_PLAYED', playerId: action.actorId, card };

  switch (action.play.card) {
    case 'knight':
      return playKnight(base, action.actorId, action.play, played);
    case 'road_building':
      return playRoadBuilding(base, action.actorId, action.play, played);
    case 'year_of_plenty':
      return playYearOfPlenty(base, action.actorId, action.play, played);
    case 'monopoly':
      return playMonopoly(base, action.actorId, action.play, played);
  }
}

function playKnight(
  base: GameState,
  actorId: string,
  play: Extract<Action, { type: 'PLAY_DEV_CARD' }>['play'] & { card: 'knight' },
  played: GameEvent,
): ReduceResult {
  const { board, players, events } = resolveRobberMove(base, actorId, play.tile, play.stealFrom, play.stolen);
  const withKnight = players.map((p) =>
    p.id === actorId ? { ...p, knightsPlayed: p.knightsPlayed + 1 } : p,
  );
  const count = withKnight.find((p) => p.id === actorId)!.knightsPlayed;

  let bonuses = base.bonuses;
  const extra: GameEvent[] = [];
  if (count >= LARGEST_ARMY_MIN && count > base.bonuses.largestArmyCount) {
    bonuses = { ...bonuses, largestArmy: actorId, largestArmyCount: count };
    extra.push({ type: 'LARGEST_ARMY', playerId: actorId, count });
  }

  return {
    state: { ...base, board, players: withKnight, bonuses },
    events: [played, ...events, ...extra],
  };
}

function playRoadBuilding(
  base: GameState,
  actorId: string,
  play: { card: 'road_building'; edges: number[] },
  played: GameEvent,
): ReduceResult {
  assert(play.edges.length >= 1 && play.edges.length <= 2, 'Road Building places one or two roads.');
  let board = base.board!;
  const owner = actorId;
  const already = Object.values(board.roads).filter((r) => r.owner === owner).length;
  const events: GameEvent[] = [played];

  let placed = 0;
  for (const edge of play.edges) {
    assert(edge >= 0 && edge < BOARD.edges.length, 'No such edge.');
    assert(!board.roads[edge], 'That edge already has a road.');
    assert(already + placed < PIECE_LIMITS.road, 'No roads left to build.');
    assert(edgeConnectsToNetwork(board, edge, owner), 'A road must connect to your network.');
    board = { ...board, roads: { ...board.roads, [edge]: { owner } } };
    events.push({ type: 'ROAD_BUILT', playerId: owner, edge, setup: false });
    placed++;
  }

  return { state: { ...base, board }, events };
}

function playYearOfPlenty(
  base: GameState,
  actorId: string,
  play: { card: 'year_of_plenty'; resources: string[] },
  played: GameEvent,
): ReduceResult {
  assert(play.resources.length === 2, 'Year of Plenty takes exactly two resources.');
  const gain: Partial<ResourceCounts> = {};
  for (const r of play.resources) {
    assert((RESOURCES as readonly string[]).includes(r), 'Unknown resource.');
    const res = r as keyof ResourceCounts;
    gain[res] = (gain[res] ?? 0) + 1;
  }
  const players = base.players.map((p) => (p.id === actorId ? { ...p, hand: addResources(p.hand, gain) } : p));
  return {
    state: { ...base, players },
    events: [played, { type: 'RESOURCES_GRANTED', playerId: actorId, resources: gain }],
  };
}

function playMonopoly(
  base: GameState,
  actorId: string,
  play: { card: 'monopoly'; resource: string },
  played: GameEvent,
): ReduceResult {
  assert((RESOURCES as readonly string[]).includes(play.resource), 'Unknown resource.');
  const res = play.resource as keyof ResourceCounts;

  let taken = 0;
  const players = base.players.map((p) => {
    if (p.id === actorId) return p;
    taken += p.hand[res];
    return { ...p, hand: { ...p.hand, [res]: 0 } };
  });
  const withOwner = players.map((p) =>
    p.id === actorId ? { ...p, hand: addResources(p.hand, { [res]: taken }) } : p,
  );

  return {
    state: { ...base, players: withOwner },
    events: [played, { type: 'MONOPOLY', playerId: actorId, resource: res, count: taken }],
  };
}
