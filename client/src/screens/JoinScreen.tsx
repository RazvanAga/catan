import { useState } from 'react';
import { PLAYER_COLORS, type PlayerColor } from '@catan/shared';
import { useStore } from '../store';
import { commands } from '../socket';
import { COLOR_HEX } from '../colors';

export function JoinScreen() {
  const view = useStore((s) => s.view)!;
  const error = useStore((s) => s.error);

  const takenColors = new Set(view.players.map((p) => p.color));
  const firstFree = PLAYER_COLORS.find((c) => !takenColors.has(c)) ?? null;

  const [name, setName] = useState('');
  const [color, setColor] = useState<PlayerColor | null>(firstFree);

  const canJoin = name.trim().length > 0 && color != null && !takenColors.has(color);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canJoin || !color) return;
    commands.join(name.trim(), color);
  }

  return (
    <div className="screen center">
      <form className="card" onSubmit={submit}>
        <h1>Join the game</h1>
        {view.players.length > 0 && (
          <p className="muted">
            {view.players.length} player{view.players.length === 1 ? '' : 's'} already here
          </p>
        )}

        <label className="field">
          <span>Display name</span>
          <input
            autoFocus
            value={name}
            maxLength={20}
            placeholder="e.g. Alex"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span>Color</span>
          <div className="swatches">
            {PLAYER_COLORS.map((c) => {
              const taken = takenColors.has(c);
              return (
                <button
                  type="button"
                  key={c}
                  className={`swatch${color === c ? ' selected' : ''}${taken ? ' taken' : ''}`}
                  style={{ background: COLOR_HEX[c] }}
                  disabled={taken}
                  title={taken ? `${c} is taken` : c}
                  onClick={() => setColor(c)}
                />
              );
            })}
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary" disabled={!canJoin}>
          Join
        </button>
      </form>
    </div>
  );
}
