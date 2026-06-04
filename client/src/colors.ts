import type { PlayerColor, TileResource } from '@catan/shared';

/** Display hex for each player color swatch. */
export const COLOR_HEX: Record<PlayerColor, string> = {
  red: '#d23f3f',
  blue: '#3f6fd2',
  orange: '#e08a2e',
  white: '#e9e9ec',
};

/** Fill color per tile resource. */
export const RESOURCE_HEX: Record<TileResource, string> = {
  wood: '#2f6b3a',
  brick: '#b5562f',
  sheep: '#8fc15a',
  wheat: '#e0b53a',
  ore: '#6b7785',
  desert: '#d8c79a',
};

/** Short labels for resources / port types. */
export const RESOURCE_LABEL: Record<TileResource, string> = {
  wood: 'Wood',
  brick: 'Brick',
  sheep: 'Sheep',
  wheat: 'Wheat',
  ore: 'Ore',
  desert: 'Desert',
};
