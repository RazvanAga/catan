import { MAX_PLAYERS, MIN_PLAYERS } from '@catan/shared';
import { useStore } from '../store';
import { commands } from '../socket';
import { COLOR_HEX } from '../colors';

export function LobbyScreen() {
  const view = useStore((s) => s.view)!;
  const error = useStore((s) => s.error);

  const youAreOwner = view.youId != null && view.youId === view.ownerId;
  const count = view.players.length;
  const canStart = youAreOwner && count >= MIN_PLAYERS && count <= MAX_PLAYERS;

  return (
    <div className="screen center">
      <div className="card">
        <h1>Lobby</h1>
        <p className="muted">
          {count}/{MAX_PLAYERS} players · need {MIN_PLAYERS} to start
        </p>

        <ul className="roster">
          {view.players.map((p) => (
            <li key={p.id} className="roster-row">
              <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
              <span className="roster-name">
                {p.name}
                {p.id === view.youId && <span className="tag">you</span>}
              </span>
              {p.isOwner && <span className="tag owner">owner</span>}
            </li>
          ))}
        </ul>

        {error && <p className="error">{error}</p>}

        {youAreOwner ? (
          <button className="primary" disabled={!canStart} onClick={() => commands.startGame()}>
            {count < MIN_PLAYERS ? `Waiting for ${MIN_PLAYERS - count} more…` : 'Start game'}
          </button>
        ) : (
          <p className="muted">Waiting for the owner to start the game…</p>
        )}
      </div>
    </div>
  );
}
