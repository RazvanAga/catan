/**
 * Player↔player trade UI. Three faces of the same `view.trade` state:
 *  - no open trade & my turn  -> propose form (give/want steppers)
 *  - my open trade            -> responses list with confirm + cancel
 *  - someone else's trade      -> accept / decline
 * Only quantities are ever shown; hands are never exposed by the projection.
 */

import { useState } from 'react';
import { GameView, RESOURCES, Resource } from '@catan/shared';
import { commands } from '../socket';
import { RESOURCE_LABEL } from '../colors';

type ResMap = Partial<Record<Resource, number>>;

function summary(map: ResMap): string {
  const parts = RESOURCES.filter((r) => (map[r] ?? 0) > 0).map((r) => `${map[r]} ${RESOURCE_LABEL[r]}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function TradePanel({ view, canAct }: { view: GameView; canAct: boolean }) {
  const trade = view.trade;
  const me = view.youId;

  if (trade && trade.proposer === me) return <ProposerView view={view} />;
  if (trade && me) return <ResponderView view={view} />;
  if (canAct && !trade) return <ProposeForm view={view} />;
  return null;
}

function ProposeForm({ view }: { view: GameView }) {
  const [give, setGive] = useState<ResMap>({});
  const [want, setWant] = useState<ResMap>({});
  const hand = view.you?.hand;

  const giveTotal = RESOURCES.reduce((a, r) => a + (give[r] ?? 0), 0);
  const wantTotal = RESOURCES.reduce((a, r) => a + (want[r] ?? 0), 0);
  const affordable = RESOURCES.every((r) => (give[r] ?? 0) <= (hand?.[r] ?? 0));
  const ok = giveTotal > 0 && wantTotal > 0 && affordable;

  return (
    <div className="trade">
      <div className="trade-title">Propose a trade</div>
      <Stepper label="You give" map={give} setMap={setGive} max={(r) => hand?.[r] ?? 0} />
      <Stepper label="You want" map={want} setMap={setWant} />
      <button
        className="build-btn"
        disabled={!ok}
        onClick={() => {
          commands.proposeTrade(give, want);
          setGive({});
          setWant({});
        }}
      >
        Send proposal
      </button>
    </div>
  );
}

function ProposerView({ view }: { view: GameView }) {
  const trade = view.trade!;
  const others = view.players.filter((p) => p.id !== view.youId);
  return (
    <div className="trade">
      <div className="trade-title">Your offer</div>
      <p className="trade-line">
        Give <b>{summary(trade.give)}</b> · Want <b>{summary(trade.want)}</b>
      </p>
      <ul className="trade-responses">
        {others.map((p) => {
          const r = trade.responses.find((x) => x.playerId === p.id)?.response;
          return (
            <li key={p.id}>
              <span>{p.name}</span>
              <span className={`resp ${r ?? 'pending'}`}>{r ?? 'waiting…'}</span>
              {r === 'accept' && (
                <button className="build-btn small" onClick={() => commands.confirmTrade(p.id)}>
                  Confirm
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button className="build-btn" onClick={() => commands.cancelTrade()}>
        Cancel
      </button>
    </div>
  );
}

function ResponderView({ view }: { view: GameView }) {
  const trade = view.trade!;
  const proposer = view.players.find((p) => p.id === trade.proposer);
  const mine = trade.responses.find((x) => x.playerId === view.youId)?.response;
  return (
    <div className="trade">
      <div className="trade-title">{proposer?.name ?? 'A player'} offers a trade</div>
      <p className="trade-line">
        You give <b>{summary(trade.want)}</b> · You get <b>{summary(trade.give)}</b>
      </p>
      {mine ? (
        <p className="muted">You {mine === 'accept' ? 'accepted' : 'declined'}.</p>
      ) : (
        <div className="trade-actions">
          <button className="build-btn" onClick={() => commands.respondTrade('accept')}>
            Accept
          </button>
          <button className="build-btn" onClick={() => commands.respondTrade('decline')}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  map,
  setMap,
  max,
}: {
  label: string;
  map: ResMap;
  setMap: (m: ResMap) => void;
  max?: (r: Resource) => number;
}) {
  function set(r: Resource, n: number) {
    const cap = max ? max(r) : 99;
    const clamped = Math.max(0, Math.min(cap, n));
    setMap({ ...map, [r]: clamped });
  }
  return (
    <div className="stepper">
      <div className="stepper-label">{label}</div>
      <div className="stepper-grid">
        {RESOURCES.map((r) => (
          <div key={r} className="stepper-cell">
            <img src={`/icons/${r}.png`} className="stepper-res-icon" alt={r} />
            <div className="stepper-controls">
              <button onClick={() => set(r, (map[r] ?? 0) - 1)}>−</button>
              <span>{map[r] ?? 0}</span>
              <button onClick={() => set(r, (map[r] ?? 0) + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
