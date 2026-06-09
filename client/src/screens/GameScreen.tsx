/**
 * The in-game screen for SETUP and PLAY: the SVG board, a turn/phase banner,
 * the player's own hand, and the public roster (colors, VP, hand counts, whose
 * turn). Setup placement is interactive — legal vertices/edges are highlighted
 * for the active player and clicking them sends the placement intent.
 */

import { useEffect, useState } from 'react';
import { BUILD_COSTS, DevCard, GameView, RESOURCES, Resource, canAfford } from '@catan/shared';
import { useStore } from '../store';
import { commands } from '../socket';
import { Board } from '../game/Board';
import { useGameEffects, HandFloat } from '../game/useGameEffects';
import {
  BuildKind,
  bankRatio,
  canAffordBuild,
  isMyTurn,
  legalBuildTargets,
  legalRoadEdges,
  legalRobberTiles,
  legalSetupRoads,
  legalSetupSettlements,
  robberVictimsAt,
} from '../game/affordances';
import { TradePanel } from './TradePanel';
import { ResSelect } from './tradeControls';
import { COLOR_HEX } from '../colors';
import { Road, House, Castle, FileQuestion, Swords, File, Crown } from 'lucide-react';

export function GameScreen() {
  const view = useStore((s) => s.view)!;
  const error = useStore((s) => s.error);
  const myTurn = isMyTurn(view);
  // Event-driven effects: pieces pop in, hand changes float off roster rows, a
  // steal flashes both players, the local hand pulses on a gain (incl. bot turns).
  const { poppedVertices, poppedEdges, handFloats, rosterFlash, handPulse } = useGameEffects();
  const [buildMode, setBuildMode] = useState<BuildKind | null>(null);
  // When the robber lands on a tile with multiple stealable players, hold the
  // chosen tile here until the active player picks whom to steal from.
  const [robberTile, setRobberTile] = useState<number | null>(null);
  // The in-progress development-card play, if any (knight/road need board input;
  // year_of_plenty/monopoly resolve in their own panels).
  const [devAction, setDevAction] = useState<'knight' | 'road' | 'yop' | 'monopoly' | null>(null);
  const [knightTile, setKnightTile] = useState<number | null>(null);
  const [roadEdges, setRoadEdges] = useState<number[]>([]);

  const phase = view.turn?.phase;
  const mustMoveRobber = view.phase === 'PLAY' && myTurn && phase === 'MOVE_ROBBER';
  const canBuild = view.phase === 'PLAY' && myTurn && phase === 'ACTIONS';
  const canPlayDev =
    view.phase === 'PLAY' && myTurn && (phase === 'ACTIONS' || phase === 'MUST_ROLL') && !view.turn?.devCardPlayedThisTurn;
  const activeBuild = canBuild ? buildMode : null;
  // A dev play in progress only counts while it's still legal to play one.
  const dev = canPlayDev ? devAction : null;

  function resetDev() {
    setDevAction(null);
    setKnightTile(null);
    setRoadEdges([]);
  }

  let highlightVertices: Set<number> | undefined;
  let highlightEdges: Set<number> | undefined;
  let highlightTiles: Set<number> | undefined;
  if (view.phase === 'SETUP' && myTurn) {
    if (view.setup?.pending === 'settlement') highlightVertices = legalSetupSettlements(view);
    else highlightEdges = legalSetupRoads(view);
  } else if (mustMoveRobber || dev === 'knight') {
    highlightTiles = legalRobberTiles(view);
  } else if (dev === 'road') {
    highlightEdges = new Set([...legalRoadEdges(view)].filter((e) => !roadEdges.includes(e)));
  } else if (activeBuild === 'road') {
    highlightEdges = legalBuildTargets(view, 'road');
  } else if (activeBuild === 'settlement') {
    highlightVertices = legalBuildTargets(view, 'settlement');
  } else if (activeBuild === 'city') {
    highlightVertices = legalBuildTargets(view, 'city');
  }

  function onTileClick(tile: number) {
    if (mustMoveRobber) {
      const victims = robberVictimsAt(view, tile);
      if (victims.length === 0) commands.moveRobber(tile, null);
      else if (victims.length === 1) commands.moveRobber(tile, victims[0]);
      else setRobberTile(tile); // multiple targets — ask whom to steal from
    } else if (dev === 'knight') {
      const victims = robberVictimsAt(view, tile);
      if (victims.length === 0) {
        commands.playDevCard({ card: 'knight', tile, stealFrom: null });
        resetDev();
      } else if (victims.length === 1) {
        commands.playDevCard({ card: 'knight', tile, stealFrom: victims[0] });
        resetDev();
      } else setKnightTile(tile);
    }
  }

  function onVertexClick(v: number) {
    if (view.phase === 'SETUP') commands.placeSetupSettlement(v);
    else if (activeBuild === 'settlement') {
      commands.buildSettlement(v);
      setBuildMode(null);
    } else if (activeBuild === 'city') {
      commands.buildCity(v);
      setBuildMode(null);
    }
  }
  function onEdgeClick(e: number) {
    if (view.phase === 'SETUP') commands.placeSetupRoad(e);
    else if (dev === 'road') {
      const next = roadEdges.includes(e) ? roadEdges : [...roadEdges, e];
      if (next.length >= 2) {
        commands.playDevCard({ card: 'road_building', edges: next.slice(0, 2) });
        resetDev();
      } else setRoadEdges(next);
    } else if (activeBuild === 'road') {
      commands.buildRoad(e);
      setBuildMode(null);
    }
  }

  return (
    <div className="game-layout">
      <aside className="rail">
        <div className="brand">CATAN</div>
        <div className="rail-panels">
          <div className="rail-scoreboard">
            <Players view={view} handFloats={handFloats} rosterFlash={rosterFlash} />
          </div>
          {canBuild && <BankTrade view={view} />}
          {view.phase === 'PLAY' && <TradePanel view={view} canAct={canBuild} />}
        </div>
      </aside>

      <div className="board-stage">
        <div className="board-wrap">
          <Board
            view={view}
            highlightVertices={highlightVertices}
            highlightEdges={highlightEdges}
            highlightTiles={highlightTiles}
            poppedVertices={poppedVertices}
            poppedEdges={poppedEdges}
            onVertexClick={onVertexClick}
            onEdgeClick={onEdgeClick}
            onTileClick={onTileClick}
          />
        </div>

        <div className="stage-foreground">
          {view.phase === 'PLAY' && <DiscardPanel view={view} />}
          {mustMoveRobber && (
            <RobberPanel
              view={view}
              tile={robberTile}
              onSteal={(victim) => {
                if (robberTile != null) commands.moveRobber(robberTile, victim);
                setRobberTile(null);
              }}
              onCancel={() => setRobberTile(null)}
            />
          )}
          {dev === 'knight' && (
            <RobberPanel
              view={view}
              tile={knightTile}
              title="Knight — move the robber"
              onSteal={(victim) => {
                if (knightTile != null) commands.playDevCard({ card: 'knight', tile: knightTile, stealFrom: victim });
                resetDev();
              }}
              onCancel={resetDev}
            />
          )}
          {dev === 'road' && (
            <div className="robber">
              <div className="robber-title">Road Building — pick {2 - roadEdges.length} road(s)</div>
              <p className="build-hint">Click highlighted edges.</p>
              {roadEdges.length === 1 && (
                <button
                  className="build-btn"
                  onClick={() => {
                    commands.playDevCard({ card: 'road_building', edges: roadEdges });
                    resetDev();
                  }}
                >
                  Place just this one
                </button>
              )}
              <button className="build-btn" onClick={resetDev}>
                Cancel
              </button>
            </div>
          )}
          {dev === 'yop' && (
            <PickResources
              title="Year of Plenty — take 2"
              count={2}
              onConfirm={(resources) => {
                commands.playDevCard({ card: 'year_of_plenty', resources });
                resetDev();
              }}
              onCancel={resetDev}
            />
          )}
          {dev === 'monopoly' && (
            <PickResources
              title="Monopoly — claim all of one"
              count={1}
              onConfirm={(resources) => {
                commands.playDevCard({ card: 'monopoly', resource: resources[0] });
                resetDev();
              }}
              onCancel={resetDev}
            />
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>

      <Hand view={view} pulse={handPulse} />

      <div className="action-bar">
        {canBuild && (
          <BuildBar view={view} mode={buildMode} setMode={setBuildMode} canBuyDev={canBuild} onBuyDev={() => commands.buyDevCard()} />
        )}
        {view.phase === 'PLAY' && (
          <DevPanel
            view={view}
            canPlay={!!canPlayDev}
            onPlay={(card) => {
              setBuildMode(null);
              if (card === 'knight') setDevAction('knight');
              else if (card === 'road_building') setDevAction('road');
              else if (card === 'year_of_plenty') setDevAction('yop');
              else if (card === 'monopoly') setDevAction('monopoly');
            }}
          />
        )}
        <div className="action-spacer" />
        {view.phase === 'PLAY' && <ActionBar view={view} myTurn={myTurn} />}
        <Banner view={view} myTurn={myTurn} />
      </div>
    </div>
  );
}

const BUILD_ICONS = { road: Road, settlement: House, city: Castle } as const;

function BuildBar({
  view,
  mode,
  setMode,
  canBuyDev,
  onBuyDev,
}: {
  view: GameView;
  mode: BuildKind | null;
  setMode: (m: BuildKind | null) => void;
  canBuyDev: boolean;
  onBuyDev: () => void;
}) {
  const kinds: BuildKind[] = ['road', 'settlement', 'city'];
  const devAffordable = view.you ? canAfford(view.you.hand, BUILD_COSTS.devCard) : false;
  const deckLeft = view.devDeckCount;
  return (
    <div className="buildbar">
      {kinds.map((kind) => {
        const Icon = BUILD_ICONS[kind];
        const affordable = canAffordBuild(view, kind);
        const active = mode === kind;
        return (
          <button
            key={kind}
            className={`build-btn build-icon-btn${active ? ' active' : ''}`}
            disabled={!affordable && !active}
            title={affordable ? `Build ${kind}` : `Can't afford a ${kind}`}
            onClick={() => setMode(active ? null : kind)}
          >
            <Icon size={18} />
          </button>
        );
      })}
      <div className="build-icon-wrap">
        <button
          className="build-btn build-icon-btn"
          disabled={!canBuyDev || !devAffordable || deckLeft === 0}
          title={deckLeft === 0 ? 'Deck empty' : devAffordable ? 'Buy a development card' : 'Need sheep + wheat + ore'}
          onClick={onBuyDev}
        >
          <FileQuestion size={18} />
        </button>
        {deckLeft > 0 && <span className="deck-badge">{deckLeft}</span>}
      </div>
      {mode && <span className="build-hint">Pick a highlighted spot</span>}
    </div>
  );
}

function Banner({ view, myTurn }: { view: GameView; myTurn: boolean }) {
  const current = view.players.find((p) => p.id === view.turn?.currentPlayerId);
  // A disconnected current player pauses the table; a vacant one is auto-skipped,
  // so only the disconnected (still-reclaimable) case lingers in the banner.
  const offline = current && !current.connected && !current.vacant ? ' — disconnected, paused' : '';
  let instruction = '';
  if (view.phase === 'SETUP') {
    const what = view.setup?.pending === 'road' ? 'a road' : 'a settlement';
    instruction = myTurn ? `Place ${what}.` : `Setup — waiting for ${current?.name ?? '…'}${offline}.`;
  } else if (view.phase === 'PLAY') {
    const phase = view.turn?.phase;
    const iOweDiscard = (view.discard?.required.find((r) => r.playerId === view.youId)?.count ?? 0) > 0;
    if (phase === 'DISCARD') {
      instruction = iOweDiscard ? 'Discard down to half your hand.' : `Waiting on discards…`;
    } else if (phase === 'MOVE_ROBBER') {
      instruction = myTurn ? 'Move the robber and steal a card.' : `${current?.name ?? '…'} is moving the robber${offline}.`;
    } else if (myTurn) {
      instruction = phase === 'MUST_ROLL' ? 'Your turn — roll the dice.' : 'Your turn.';
    } else {
      instruction = `Waiting for ${current?.name ?? '…'}${offline}.`;
    }
  }
  return (
    <div className={`banner${myTurn ? ' active' : ''}`}>
      <div className="banner-phase">{view.phase}</div>
      <div className="banner-instruction">{instruction}</div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

function Die({ value, onClick }: { value: number | null; onClick?: () => void }) {
  const [anim, setAnim] = useState(1);
  useEffect(() => {
    if (value !== null) return;
    const id = setInterval(() => setAnim((v) => (v % 6) + 1), 1000);
    return () => clearInterval(id);
  }, [value]);

  const face = value ?? anim;
  return (
    <div className={`die${onClick ? ' die-roll' : ''}`} onClick={onClick} title={onClick ? 'Roll' : String(value)}>
      <div className={`die-pips${value === null ? ' die-pips-anim' : ''}`}>
        {PIPS[face].map(([r, c], i) => (
          <span key={i} className="pip" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
        ))}
      </div>
    </div>
  );
}

function ActionBar({ view, myTurn }: { view: GameView; myTurn: boolean }) {
  const phase = view.turn?.phase;
  const roll = view.turn?.lastRoll;
  const mustRoll = phase === 'MUST_ROLL';
  return (
    <div className="actionbar">
      {mustRoll ? (
        <div className="dice">
          <Die value={null} onClick={myTurn ? () => commands.roll() : undefined} />
          <Die value={null} onClick={myTurn ? () => commands.roll() : undefined} />
        </div>
      ) : roll ? (
        // Re-key on each roll so the dice remount and replay the settle bounce.
        <div className="dice settle" key={`${view.turn?.turnNumber}-${roll[0]}-${roll[1]}`}>
          <Die value={roll[0]} />
          <Die value={roll[1]} />
          <span className="dice-total">= {roll[0] + roll[1]}</span>
        </div>
      ) : null}
      {myTurn && phase === 'ACTIONS' && (
        <button className="primary" onClick={() => commands.endTurn()}>
          End turn
        </button>
      )}
    </div>
  );
}

function BankTrade({ view }: { view: GameView }) {
  const [give, setGive] = useState<Resource>('wood');
  const [receive, setReceive] = useState<Resource>('brick');
  const hand = view.you?.hand;
  const ratio = bankRatio(view, give);
  const have = hand?.[give] ?? 0;
  const ok = give !== receive && have >= ratio;
  return (
    <div className="trade">
      <div className="trade-title">Bank / port trade</div>
      <div className="trade-row">
        <span className="trade-row-label">Give</span>
        <ResSelect value={give} onChange={setGive} emptyOf={(r) => (hand?.[r] ?? 0) === 0} />
        <div className="trade-row-right">
          <span className="ratio">{ratio}:1</span>
        </div>
      </div>
      <div className="trade-row">
        <span className="trade-row-label">Get</span>
        <ResSelect value={receive} onChange={setReceive} />
        <div className="trade-row-right" />
      </div>
      <button
        className="build-btn"
        disabled={!ok}
        title={ok ? '' : give === receive ? 'Pick different resources' : `Need ${ratio} ${give}`}
        onClick={() => commands.tradeBank(give, receive)}
      >
        Trade {ratio} → 1
      </button>
    </div>
  );
}

/**
 * Forced discard after a 7. Shown to a player who still owes a discard; the
 * player picks exactly `count` cards from their hand and submits. If a discard
 * is pending but this player doesn't owe one, we just show who we're waiting on.
 */
function DiscardPanel({ view }: { view: GameView }) {
  const owed = view.discard?.required.find((r) => r.playerId === view.youId)?.count ?? 0;
  const [picks, setPicks] = useState<Partial<Record<Resource, number>>>({});

  if (!view.discard) return null;

  if (owed === 0) {
    const waiting = view.discard.required
      .map((r) => view.players.find((p) => p.id === r.playerId)?.name ?? '…')
      .join(', ');
    return (
      <div className="discard">
        <div className="discard-title">Discarding…</div>
        <p className="build-hint">Waiting for: {waiting}</p>
      </div>
    );
  }

  const hand = view.you?.hand;
  const chosen = RESOURCES.reduce((a, r) => a + (picks[r] ?? 0), 0);
  const ready = chosen === owed;
  const bump = (res: Resource, delta: number) =>
    setPicks((prev) => {
      const max = hand?.[res] ?? 0;
      const next = Math.max(0, Math.min(max, (prev[res] ?? 0) + delta));
      return { ...prev, [res]: next };
    });

  return (
    <div className="discard">
      <div className="discard-title">
        Discard {owed} card{owed === 1 ? '' : 's'} ({chosen}/{owed})
      </div>
      <div className="discard-rows">
        {RESOURCES.map((res) => {
          const have = hand?.[res] ?? 0;
          const picked = picks[res] ?? 0;
          return (
            <div key={res} className="discard-row">
              <img src={`/icons/${res}.png`} className="discard-res-icon" alt={res} />
              <span className="discard-have">×{have}</span>
              <button className="step" disabled={picked === 0} onClick={() => bump(res, -1)}>
                −
              </button>
              <span className="discard-pick">{picked}</span>
              <button className="step" disabled={picked >= have || chosen >= owed} onClick={() => bump(res, 1)}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="primary"
        disabled={!ready}
        onClick={() => {
          commands.discard(picks);
          setPicks({});
        }}
      >
        Discard
      </button>
    </div>
  );
}

/**
 * Robber move: tiles are clicked on the board. When the chosen tile has several
 * stealable players, this panel asks which one to rob; otherwise it just shows a
 * hint (a lone or absent victim is resolved automatically on the tile click).
 */
function RobberPanel({
  view,
  tile,
  onSteal,
  onCancel,
  title = 'Move the robber',
}: {
  view: GameView;
  tile: number | null;
  onSteal: (victim: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  if (tile == null) {
    return (
      <div className="robber">
        <div className="robber-title">{title}</div>
        <p className="build-hint">Click a highlighted tile.</p>
      </div>
    );
  }
  const victims = robberVictimsAt(view, tile);
  return (
    <div className="robber">
      <div className="robber-title">Steal from…</div>
      <div className="robber-victims">
        {victims.map((id) => {
          const p = view.players.find((pl) => pl.id === id);
          if (!p) return null;
          return (
            <button key={id} className="build-btn" onClick={() => onSteal(id)}>
              <span className="dot" style={{ background: COLOR_HEX[p.color] }} /> {p.name} (🂠 {p.handCount})
            </button>
          );
        })}
      </div>
      <button className="build-btn" onClick={onCancel}>
        Pick a different tile
      </button>
    </div>
  );
}

const DEV_LABEL: Record<DevCard, string> = {
  knight: 'Knight',
  victory_point: 'Victory Point',
  road_building: 'Road Building',
  year_of_plenty: 'Year of Plenty',
  monopoly: 'Monopoly',
};

/**
 * Buy a development card and play the ones you hold. Counts are grouped by type;
 * a type is playable only if you hold a copy bought on an earlier turn and you
 * haven't already played a card this turn. Victory-point cards are never played.
 */
function DevPanel({
  view,
  canPlay,
  onPlay,
}: {
  view: GameView;
  canPlay: boolean;
  onPlay: (card: DevCard) => void;
}) {
  const cards = view.you?.devCards ?? [];
  const turnNumber = view.turn?.turnNumber ?? 0;
  const order: DevCard[] = ['knight', 'road_building', 'year_of_plenty', 'monopoly', 'victory_point'];
  const groups = order
    .map((card) => ({
      card,
      count: cards.filter((d) => d.card === card).length,
      playableNow: cards.some((d) => d.card === card && d.boughtOnTurn !== turnNumber),
    }))
    .filter((g) => g.count > 0);

  if (groups.length === 0) return null;

  return (
    <div className="devpanel">
      <ul className="devlist">
        {groups.map(({ card, count, playableNow }) => (
          <li key={card} className="devlist-row">
            <span className="dev-name">
              {DEV_LABEL[card]} ×{count}
            </span>
            {card !== 'victory_point' && (
              <button
                className="build-btn"
                disabled={!canPlay || !playableNow}
                title={playableNow ? `Play ${DEV_LABEL[card]}` : 'Not playable yet'}
                onClick={() => onPlay(card)}
              >
                Play
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small stepper picker for choosing exactly `count` resource cards (repeats allowed). */
function PickResources({
  title,
  count,
  onConfirm,
  onCancel,
}: {
  title: string;
  count: number;
  onConfirm: (resources: Resource[]) => void;
  onCancel: () => void;
}) {
  const [picks, setPicks] = useState<Partial<Record<Resource, number>>>({});
  const chosen = RESOURCES.reduce((a, r) => a + (picks[r] ?? 0), 0);
  const ready = chosen === count;
  const bump = (res: Resource, delta: number) =>
    setPicks((prev) => ({ ...prev, [res]: Math.max(0, (prev[res] ?? 0) + delta) }));

  return (
    <div className="discard">
      <div className="discard-title">
        {title} ({chosen}/{count})
      </div>
      <div className="discard-rows">
        {RESOURCES.map((res) => {
          const picked = picks[res] ?? 0;
          return (
            <div key={res} className="discard-row">
              <img src={`/icons/${res}.png`} className="discard-res-icon" alt={res} />
              <button className="step" disabled={picked === 0} onClick={() => bump(res, -1)}>
                −
              </button>
              <span className="discard-pick">{picked}</span>
              <button className="step" disabled={chosen >= count} onClick={() => bump(res, 1)}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="primary"
        disabled={!ready}
        onClick={() => onConfirm(RESOURCES.flatMap((r) => Array<Resource>(picks[r] ?? 0).fill(r)))}
      >
        Confirm
      </button>
      <button className="build-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function Players({
  view,
  handFloats,
  rosterFlash,
}: {
  view: GameView;
  handFloats: ReadonlyMap<string, HandFloat>;
  rosterFlash: ReadonlySet<string>;
}) {
  return (
    <ul className="roster">
      {view.players.map((p) => {
        const float = handFloats.get(p.id);
        return (
        <li
          key={p.id}
          className={`roster-row${p.isCurrentTurn ? ' current' : ''}${!p.connected ? ' offline' : ''}${
            rosterFlash.has(p.id) ? ' flash' : ''
          }`}
        >
          <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
          <span className="roster-name">
            {p.isPreviousWinner && <span title="previous winner">👑</span>} {p.name}
            {p.id === view.youId && <span className="tag">you</span>}
            {p.vacant ? (
              <span className="tag" title="seat open — claimable by anyone">vacant</span>
            ) : (
              !p.connected && <span className="tag" title="disconnected — reclaimable">offline</span>
            )}
          </span>
          <span className="roster-stats">
            <span
              className={`stat${view.bonuses.longestRoad === p.id ? ' stat-bonus' : ''}`}
              title={view.bonuses.longestRoad === p.id ? 'Longest road — Longest Road +2 VP' : 'Longest road'}
            >
              {p.roadLength}
              <Road size={14} />
            </span>
            <span
              className={`stat${view.bonuses.largestArmy === p.id ? ' stat-bonus' : ''}`}
              title={view.bonuses.largestArmy === p.id ? 'Army size — Largest Army +2 VP' : 'Army size'}
            >
              {p.knightsPlayed}
              <Swords size={14} />
            </span>
            <span className="stat" title="Development cards">
              {p.devCardCount}
              <FileQuestion size={14} />
            </span>
            <span className={`stat${float ? ' bump' : ''}`} title="Resource cards">
              {p.handCount}
              <File size={14} />
            </span>
            <span className="stat" title="Victory points">
              {p.publicVictoryPoints}
              <Crown size={14} />
            </span>
          </span>
          {float && (
            <span key={float.id} className={`hand-float ${float.amount > 0 ? 'gain' : 'loss'}`}>
              {float.amount > 0 ? '+' : '−'}
              {Math.abs(float.amount)}
            </span>
          )}
        </li>
        );
      })}
    </ul>
  );
}

function Hand({ view, pulse }: { view: GameView; pulse: boolean }) {
  if (!view.you) return null;
  const entries = Object.entries(view.you.hand) as [keyof typeof view.you.hand, number][];
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <div className={`hand${pulse ? ' pulse' : ''}`}>
      <div className="hand-title">Your hand ({total})</div>
      <div className="hand-cards">
        {entries.map(([res, n]) => (
          <div key={res} className={`hand-card${n === 0 ? ' empty' : ''}`}>
            <img src={`/icons/${res}.png`} className="hand-res-icon" alt={res} />
            <span className="hand-n">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
