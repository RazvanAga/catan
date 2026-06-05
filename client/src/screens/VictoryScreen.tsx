import { useStore } from '../store';
import { COLOR_HEX } from '../colors';

/**
 * Shown to everyone once the room reaches ENDED. Names the winner and reveals
 * the full final standings — including the hidden victory-point cards that were
 * secret during play — sorted by total VP.
 */
export function VictoryScreen() {
  const view = useStore((s) => s.view)!;
  const scores = view.finalScores ?? [];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const ranked = [...scores].sort((a, b) => b.total - a.total);
  const winner = view.winner ? byId.get(view.winner) : undefined;

  return (
    <div className="screen center">
      <div className="card">
        <h1>🏆 {winner?.name ?? 'Someone'} wins!</h1>
        <p className="muted">Final standings</p>

        <ul className="roster">
          {ranked.map((s, i) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} className={`roster-row${s.playerId === view.winner ? ' current' : ''}`}>
                <span className="dot" style={{ background: p ? COLOR_HEX[p.color] : '#888' }} />
                <span className="roster-name">
                  {i === 0 && <span title="winner">👑</span>} {p?.name ?? s.playerId}
                  {s.playerId === view.youId && <span className="tag">you</span>}
                </span>
                <span className="roster-stats">
                  <span title="total victory points">{s.total} VP</span>
                  {s.hiddenVictoryPoints > 0 && (
                    <span className="muted" title="hidden VP cards revealed">
                      (+{s.hiddenVictoryPoints} hidden)
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="muted">Use “Reset room” to start a new game.</p>
      </div>
    </div>
  );
}
