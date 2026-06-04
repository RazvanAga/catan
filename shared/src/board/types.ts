/**
 * Static board topology types — the frozen graph that is the single source of
 * truth for both rules and rendering. Topology (vertices/edges/tiles/ports and
 * their adjacency + pixel coordinates) is fixed for the base game; only the
 * *content* (resources, number tokens, robber start, port assignments) is
 * randomized at game start and lives in `BoardState` (see ../types).
 */

export type Resource = 'brick' | 'wood' | 'sheep' | 'wheat' | 'ore';
export type TileResource = Resource | 'desert';

/** A port is either generic 3:1 or a specific 2:1 for one resource. */
export type PortType = '3:1' | Resource;

export interface Axial {
  q: number;
  r: number;
}

export interface Pixel {
  x: number;
  y: number;
}

export interface TileTopo {
  id: number;
  axial: Axial;
  center: Pixel;
  /** 6 corner vertex ids, ordered clockwise from the top-right corner. */
  vertices: number[];
  /** 6 edge ids, ordered so edge i joins vertices[i] and vertices[(i+1)%6]. */
  edges: number[];
}

export interface VertexTopo {
  id: number;
  pixel: Pixel;
  /** Adjacent tile ids (1–3). */
  tiles: number[];
  /** Incident edge ids (2–3). */
  edges: number[];
  /** Vertex ids reachable across one edge (2–3). */
  vertices: number[];
}

export interface EdgeTopo {
  id: number;
  /** The two endpoint vertex ids, sorted ascending. */
  vertices: [number, number];
  /** Adjacent tile ids (1–2). */
  tiles: number[];
}

export interface PortTopo {
  id: number;
  /** The two settlement vertices that can access this port. */
  vertices: [number, number];
  /** Marker position for rendering (out in the sea past the two vertices). */
  pixel: Pixel;
}

export interface BoardTopology {
  tiles: TileTopo[];
  vertices: VertexTopo[];
  edges: EdgeTopo[];
  ports: PortTopo[];
}
