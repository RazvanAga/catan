/**
 * Board *content* — the variable layer randomized at game start on top of the
 * frozen topology: which resource each tile produces, its number token, where
 * the robber starts, and each port's trade type. Per the design, the server
 * generates this with its own RNG and passes it into the reducer as action
 * data (`START_GAME.board`); the reducer never rolls dice itself.
 */

import { BOARD } from './board.js';
import { PortType, Resource, TileResource } from './types.js';

/** The randomized arrangement chosen at game start. Indexed by topology id. */
export interface BoardSetup {
  /** Resource per tile id (length 19); exactly one 'desert'. */
  tileResources: TileResource[];
  /** Number token per tile id; null on the desert. */
  tileTokens: (number | null)[];
  /** Tile id the robber starts on (the desert). */
  robberTile: number;
  /** Trade type per port id (length 9). */
  portTypes: PortType[];
}

/** Base-game tile resource counts: 4 wood/sheep/wheat, 3 brick/ore, 1 desert = 19. */
const RESOURCE_BAG: TileResource[] = [
  ...Array<TileResource>(4).fill('wood'),
  ...Array<TileResource>(4).fill('sheep'),
  ...Array<TileResource>(4).fill('wheat'),
  ...Array<TileResource>(3).fill('brick'),
  ...Array<TileResource>(3).fill('ore'),
  'desert',
];

/** The 18 base-game number tokens (no 7). */
const TOKEN_BAG: number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

/** 9 ports: 4 generic 3:1 + one specific 2:1 per resource. */
const PORT_BAG: PortType[] = ['3:1', '3:1', '3:1', '3:1', 'brick', 'wood', 'sheep', 'wheat', 'ore'];

/** The "red" high-frequency tokens that must not touch on the physical board. */
const RED_TOKENS = new Set([6, 8]);

/**
 * Pairs of tile ids that share an edge (i.e. physically adjacent hexes), derived
 * once from the frozen topology. Each interior edge borders exactly two tiles.
 */
const ADJACENT_TILE_PAIRS: [number, number][] = BOARD.edges
  .filter((e) => e.tiles.length === 2)
  .map((e) => [e.tiles[0], e.tiles[1]]);

/** True if any two adjacent tiles both carry a red (6/8) token. */
function hasAdjacentRed(tileTokens: (number | null)[]): boolean {
  return ADJACENT_TILE_PAIRS.some(
    ([a, b]) => RED_TOKENS.has(tileTokens[a] ?? 0) && RED_TOKENS.has(tileTokens[b] ?? 0),
  );
}

/** Fisher–Yates shuffle using an injected RNG; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Produce a random base-game board arrangement. Pure given `rng`, so it is
 * deterministic and testable; the server supplies a real RNG. Number tokens are
 * re-dealt to the non-desert tiles until no two red tokens (6 or 8) sit on
 * adjacent tiles — the physical board's balance rule. A near-certain few
 * attempts suffice; the cap just guarantees termination.
 */
export function createBoardSetup(rng: () => number = Math.random): BoardSetup {
  const tileResources = shuffle(RESOURCE_BAG, rng);
  const robberTile = tileResources.indexOf('desert');

  let tileTokens: (number | null)[] = [];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const tokens = shuffle(TOKEN_BAG, rng);
    let t = 0;
    tileTokens = tileResources.map((res) => (res === 'desert' ? null : tokens[t++]));
    if (!hasAdjacentRed(tileTokens)) break;
  }

  const portTypes = shuffle(PORT_BAG, rng).slice(0, BOARD.ports.length);

  return { tileResources, tileTokens, robberTile, portTypes };
}

/** Resources that actually produce (everything but the desert). */
export function isProducing(resource: TileResource): resource is Resource {
  return resource !== 'desert';
}
