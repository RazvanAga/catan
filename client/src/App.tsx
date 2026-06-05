import { useStore } from './store';
import { commands } from './socket';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { VictoryScreen } from './screens/VictoryScreen';
import { BlockedScreen } from './screens/BlockedScreen';

/**
 * Top-level router. Everything is driven by the latest server snapshot
 * (`view`) plus the `blocked` flag — the client holds no game logic of its own.
 */
export function App() {
  return (
    <>
      <Screen />
      <ResetButton />
    </>
  );
}

function Screen() {
  const status = useStore((s) => s.status);
  const view = useStore((s) => s.view);
  const blocked = useStore((s) => s.blocked);

  if (blocked) return <BlockedScreen reason={blocked} />;

  if (status === 'connecting' || !view) {
    return (
      <div className="screen center">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  if (view.phase === 'SETUP' || view.phase === 'PLAY') return <GameScreen />;

  if (view.phase === 'ENDED') return <VictoryScreen />;

  // LOBBY: show the join form until this client holds a seat, then the roster.
  return view.seated ? <LobbyScreen /> : <JoinScreen />;
}

/** Dev-only: wipe the singleton room back to an empty lobby for everyone. */
function ResetButton() {
  return (
    <button
      className="reset-room"
      title="Reset the room back to an empty lobby (affects everyone)"
      onClick={() => {
        if (confirm('Reset the room for everyone? All seats and game state will be cleared.')) {
          commands.resetRoom();
        }
      }}
    >
      Reset room
    </button>
  );
}
