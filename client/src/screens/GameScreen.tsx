/**
 * The in-game screen for SETUP and PLAY: the SVG board, a turn/phase banner,
 * the player's own hand, and the public roster (colors, VP, hand counts, whose
 * turn). Setup placement is interactive — legal vertices/edges are highlighted
 * for the active player and clicking them sends the placement intent.
 */

import { useState } from 'react';
import { GameView, RESOURCES, Resource } from '@catan/shared';
import { useStore } from '../store';
import { commands } from '../socket';
import { Board } from '../game/Board';
import {
  BuildKind,
  bankRatio,
  canAffordBuild,
  isMyTurn,
  legalBuildTargets,
  legalSetupRoads,
  legalSetupSettlements,
} from '../game/affordances';
import { TradePanel } from './TradePanel';
import { COLOR_HEX, RESOURCE_LABEL } from '../colors';

export function GameScreen() {
  const view = useStore((s) => s.view)!;
  const error = useStore((s) => s.error);
  const myTurn = isMyTurn(view);
  const [buildMode, setBuildMode] = useState<BuildKind | null>(null);

  const canBuild = view.phase === 'PLAY' && myTurn && view.turn?.phase === 'ACTIONS';
  const activeBuild = canBuild ? buildMode : null;

  let highlightVertices: Set<number> | undefined;
  let highlightEdges: Set<number> | undefined;
  if (view.phase === 'SETUP' && myTurn) {
    if (view.setup?.pending === 'settlement') highlightVertices = legalSetupSettlements(view);
    else highlightEdges = legalSetupRoads(view);
  } else if (activeBuild === 'road') {
    highlightEdges = legalBuildTargets(view, 'road');
  } else if (activeBuild === 'settlement') {
    highlightVertices = legalBuildTargets(view, 'settlement');
  } else if (activeBuild === 'city') {
    highlightVertices = legalBuildTargets(view, 'city');
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
    else if (activeBuild === 'road') {
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
          onVertexClick={onVertexClick}
          onEdgeClick={onEdgeClick}
        />
      </div>

      <aside className="sidebar">
        <Banner view={view} myTurn={myTurn} />
        {view.phase === 'PLAY' && <ActionBar view={view} myTurn={myTurn} />}
        {canBuild && <BuildBar view={view} mode={buildMode} setMode={setBuildMode} />}
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
    instruction = myTurn
      ? view.turn?.phase === 'MUST_ROLL'
        ? 'Your turn — roll the dice. (Actions arrive in a later slice.)'
        : 'Your turn.'
      : `Waiting for ${current?.name ?? '…'}.`;
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
