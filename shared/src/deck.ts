/**
 * The base-game development-card deck. The full effects arrive in issue 0010,
 * but the deck must exist from game start (its shuffled order is fixed when the
 * game begins and drawn from the front). The server shuffles with its RNG and
 * passes the order into `START_GAME`.
 */

import { shuffle } from './board/content.js';
import { DevCard } from './types.js';

/** Base game: 14 knights, 5 victory points, 2 each of the three progress cards. */
const DEV_DECK: DevCard[] = [
  ...Array<DevCard>(14).fill('knight'),
  ...Array<DevCard>(5).fill('victory_point'),
  ...Array<DevCard>(2).fill('road_building'),
  ...Array<DevCard>(2).fill('year_of_plenty'),
  ...Array<DevCard>(2).fill('monopoly'),
];

export function createDevDeck(rng: () => number = Math.random): DevCard[] {
  return shuffle(DEV_DECK, rng);
}
