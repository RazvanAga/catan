/**
 * Shared building blocks for the bank and player trade panels so the two read
 * the same: a single-select row of resource icons, and a − N + counter. The
 * `emptyOf` predicate dims resources the player holds none of (give rows),
 * mirroring how the hand greys out empty resources.
 */

import { RESOURCES, Resource } from '@catan/shared';
import { RESOURCE_LABEL } from '../colors';

export function ResSelect({
  value,
  onChange,
  emptyOf,
}: {
  value: Resource;
  onChange: (r: Resource) => void;
  emptyOf?: (r: Resource) => boolean;
}) {
  return (
    <div className="res-select">
      {RESOURCES.map((r) => (
        <button
          key={r}
          className={`res-select-btn${r === value ? ' selected' : ''}${emptyOf?.(r) ? ' empty' : ''}`}
          onClick={() => onChange(r)}
          title={RESOURCE_LABEL[r]}
        >
          <img src={`/icons/${r}.png`} alt={r} />
        </button>
      ))}
    </div>
  );
}

export function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="counter">
      <button className="step" disabled={value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <span className="counter-n">{value}</span>
      <button className="step" disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}
