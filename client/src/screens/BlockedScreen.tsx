import type { BlockedReason } from '@catan/shared';

const MESSAGES: Record<BlockedReason, { title: string; body: string }> = {
  game_in_progress: {
    title: 'Game in progress',
    body: 'A game is already underway in this room. You can join the next one once it finishes.',
  },
};

export function BlockedScreen({ reason }: { reason: BlockedReason }) {
  const { title, body } = MESSAGES[reason];
  return (
    <div className="screen center">
      <div className="card">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
      </div>
    </div>
  );
}
