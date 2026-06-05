/**
 * The in-game screen for SETUP and PLAY: the SVG board, a turn/phase banner,
 * the player's own hand, and the public roster (colors, VP, hand counts, whose
 * turn). Setup placement is interactive — legal vertices/edges are highlighted
 * for the active player and clicking them sends the placement intent.
 */

import { useState } from 'react';
import { BUILD_COSTS, DevCard, GameView, RESOURCES, Resource, canAfford } from '@catan/shared';
import { useStore } from '../store';
import { commands } from '../socket';
import { Board } from '../game/Board';
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
import { COLOR_HEX, RESOURCE_LABEL } from '../colors';

export function GameScreen() {
  const view = useStore((s) => s.view)!;
  const error = useStore((s) => s.error);
  const myTurn = isMyTurn(view);
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
      <div className="board-wrap">
        <Board
          view={view}
          highlightVertices={highlightVertices}
          highlightEdges={highlightEdges}
          highlightTiles={highlightTiles}
          onVertexClick={onVertexClick}
          onEdgeClick={onEdgeClick}
          onTileClick={onTileClick}
        />
      </div>

      <aside className="sidebar">
        <Banner view={view} myTurn={myTurn} />
        {view.phase === 'PLAY' && <ActionBar view={view} myTurn={myTurn} />}
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
        {canBuild && <BuildBar view={view} mode={buildMode} setMode={setBuildMode} />}
        {view.phase === 'PLAY' && (
          <DevPanel
            view={view}
            canBuy={canBuild}
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
        {canBuild && <BankTrade view={view} />}
        {view.phase === 'PLAY' && <TradePanel view={view} canAct={canBuild} />}
        {error && <p className="error">{error}</p>}
        <Players view={view} />
        <Hand view={view} />
      </aside>
    </div>
  );
}

function BuildBar({
  view,
  mode,
  setMode,
}: {
  view: GameView;
  mode: BuildKind | null;
  setMode: (m: BuildKind | null) => void;
}) {
  const kinds: BuildKind[] = ['road', 'settlement', 'city'];
  return (
    <div className="buildbar">
      {kinds.map((kind) => {
        const affordable = canAffordBuild(view, kind);
        const active = mode === kind;
        return (
          <button
            key={kind}
            className={`build-btn${active ? ' active' : ''}`}
            disabled={!affordable && !active}
            title={affordable ? `Build ${kind}` : `Can't afford a ${kind}`}
            onClick={() => setMode(active ? null : kind)}
          >
            {kind}
          </button>
        );
      })}
      {mode && <span className="build-hint">Pick a highlighted spot</span>}
    </div>
  );
}

function Banner({ view, myTurn }: { view: GameView; myTurn: boolean }) {
  const current = view.players.find((p) => p.id === view.turn?.currentPlayerId);
  let instruction = '';
  if (view.phase === 'SETUP') {
    const what = view.setup?.pending === 'road' ? 'a road' : 'a settlement';
    instruction = myTurn ? `Place ${what}.` : `Setup — waiting for ${current?.name ?? '…'}.`;
  } else if (view.phase === 'PLAY') {
    const phase = view.turn?.phase;
    const iOweDiscard = (view.discard?.required.find((r) => r.playerId === view.youId)?.count ?? 0) > 0;
    if (phase === 'DISCARD') {
      instruction = iOweDiscard ? 'Discard down to half your hand.' : `Waiting on discards…`;
    } else if (phase === 'MOVE_ROBBER') {
      instruction = myTurn ? 'Move the robber and steal a card.' : `${current?.name ?? '…'} is moving the robber.`;
    } else if (myTurn) {
      instruction = phase === 'MUST_ROLL' ? 'Your turn — roll the dice.' : 'Your turn.';
    } else {
      instruction = `Waiting for ${current?.name ?? '…'}.`;
    }
  }
  return (
    <div className={`banner${myTurn ? ' active' : ''}`}>
      <div className="banner-phase">{view.phase}</div>
      <div className="banner-instruction">{instruction}</div>
    </div>
  );
}

function ActionBar({ view, myTurn }: { view: GameView; myTurn: boolean }) {
  const phase = view.turn?.phase;
  const roll = view.turn?.lastRoll;
  return (
    <div className="actionbar">
      {roll && (
        <div className="dice" title="last roll">
          <span className="die">{roll[0]}</span>
          <span className="die">{roll[1]}</span>
          <span className="dice-total">= {roll[0] + roll[1]}</span>
        </div>
      )}
      {myTurn && phase === 'MUST_ROLL' && (
        <button className="primary" onClick={() => commands.roll()}>
          Roll dice
        </button>
      )}
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
  const ratio = bankRatio(view, give);
  const have = view.you?.hand[give] ?? 0;
  const ok = give !== receive && have >= ratio;
  return (
    <div className="banktrade">
      <div className="banktrade-title">Bank / port trade</div>
      <div className="banktrade-row">
        <span>Give</span>
        <select value={give} onChange={(e) => setGive(e.target.value as Resource)}>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABEL[r]}
            </option>
          ))}
        </select>
        <span className="ratio">{ratio}:1</span>
      </div>
      <div className="banktrade-row">
        <span>Get</span>
        <select value={receive} onChange={(e) => setReceive(e.target.value as Resource)}>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABEL[r]}
            </option>
          ))}
        </select>
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
              <span className="discard-res">{RESOURCE_LABEL[res]}</span>
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
  canBuy,
  canPlay,
  onPlay,
}: {
  view: GameView;
  canBuy: boolean;
  canPlay: boolean;
  onPlay: (card: DevCard) => void;
}) {
  const cards = view.you?.devCards ?? [];
  const turnNumber = view.turn?.turnNumber ?? 0;
  const affordable = view.you ? canAfford(view.you.hand, BUILD_COSTS.devCard) : false;
  const deckLeft = view.devDeckCount;

  // Stable display order, counting copies and the playable (not-bought-this-turn) ones.
  const order: DevCard[] = ['knight', 'road_building', 'year_of_plenty', 'monopoly', 'victory_point'];
  const groups = order
    .map((card) => ({
      card,
      count: cards.filter((d) => d.card === card).length,
      playableNow: cards.some((d) => d.card === card && d.boughtOnTurn !== turnNumber),
    }))
    .filter((g) => g.count > 0);

  return (
    <div className="devpanel">
      <div className="devpanel-title">Development cards</div>
      <button
        className="build-btn"
        disabled={!canBuy || !affordable || deckLeft === 0}
        title={deckLeft === 0 ? 'Deck empty' : affordable ? 'Buy a development card' : 'Need sheep + wheat + ore'}
        onClick={() => commands.buyDevCard()}
      >
        Buy card ({deckLeft} left)
      </button>
      {groups.length === 0 ? (
        <p className="build-hint">No development cards yet.</p>
      ) : (
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
      )}
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
              <span className="discard-res">{RESOURCE_LABEL[res]}</span>
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

function Players({ view }: { view: GameView }) {
  return (
    <ul className="roster">
      {view.players.map((p) => (
        <li key={p.id} className={`roster-row${p.isCurrentTurn ? ' current' : ''}`}>
          <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
          <span className="roster-name">
            {p.isPreviousWinner && <span title="previous winner">👑</span>} {p.name}
            {p.id === view.youId && <span className="tag">you</span>}
            {!p.connected && <span className="tag">offline</span>}
          </span>
          <span className="roster-stats">
            {view.bonuses.longestRoad === p.id && (
              <span title={`Longest Road (${view.bonuses.longestRoadLength}) +2 VP`}>🛣️</span>
            )}
            {view.bonuses.largestArmy === p.id && (
              <span title={`Largest Army (${view.bonuses.largestArmyCount}) +2 VP`}>⚔️</span>
            )}
            <span title="victory points">{p.publicVictoryPoints} VP</span>
            <span title="resource cards">🂠 {p.handCount}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Hand({ view }: { view: GameView }) {
  if (!view.you) return null;
  const entries = Object.entries(view.you.hand) as [keyof typeof view.you.hand, number][];
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="hand">
      <div className="hand-title">Your hand ({total})</div>
      <div className="hand-cards">
        {entries.map(([res, n]) => (
          <div key={res} className={`hand-card${n === 0 ? ' empty' : ''}`}>
            <span className="hand-res">{RESOURCE_LABEL[res]}</span>
            <span className="hand-n">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
