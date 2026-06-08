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
import { ResSelect, Counter } from './tradeControls';

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
  const [give, setGive] = useState<Resource>('wood');
  const [want, setWant] = useState<Resource>('brick');
  const [giveN, setGiveN] = useState(1);
  const [wantN, setWantN] = useState(1);
  const hand = view.you?.hand;
  const have = hand?.[give] ?? 0;

  const ok = give !== want && giveN > 0 && wantN > 0 && have >= giveN;

  return (
    <div className="trade">
      <div className="trade-title">Propose a trade</div>
      <div className="trade-row">
        <span className="trade-row-label">Give</span>
        <ResSelect value={give} onChange={setGive} emptyOf={(r) => (hand?.[r] ?? 0) === 0} />
        <div className="trade-row-right">
          <Counter value={giveN} onChange={setGiveN} min={1} max={Math.max(1, have)} />
        </div>
      </div>
      <div className="trade-row">
        <span className="trade-row-label">Get</span>
        <ResSelect value={want} onChange={setWant} />
        <div className="trade-row-right">
          <Counter value={wantN} onChange={setWantN} min={1} />
        </div>
      </div>
      <button
        className="build-btn"
        disabled={!ok}
        title={ok ? '' : give === want ? 'Pick different resources' : have < giveN ? `You only have ${have}` : ''}
        onClick={() => {
          commands.proposeTrade({ [give]: giveN }, { [want]: wantN });
          setGiveN(1);
          setWantN(1);
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

