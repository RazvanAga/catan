import { useStore } from './store';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { BlockedScreen } from './screens/BlockedScreen';

/**
 * Top-level router. Everything is driven by the latest server snapshot
 * (`view`) plus the `blocked` flag — the client holds no game logic of its own.
 */
export function App() {
  const status = useStore((s) => s.status);
  const view = useStore((s) => s.view);
  const blocked = useStore((s) => s.blocked);

  if (blocked) {
    return <BlockedScreen reason={blocked} />;
  }

  if (status === 'connecting' || !view) {
    return (
      <div className="screen center">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  if (view.phase === 'SETUP' || view.phase === 'PLAY') {
    return <GameScreen />;
  }

  // LOBBY: show the join form until this client holds a seat, then the roster.
  return view.seated ? <LobbyScreen /> : <JoinScreen />;
}
