/**
 * The offline board-topology generator. Runs the hex math once to produce the
 * fixed base-game graph: 19 tiles, 54 vertices, 72 edges, 9 ports, with full
 * adjacency and SVG pixel coordinates. The output is frozen as `BOARD`
 * (see ./board.ts) and verified hard by tests before anything trusts it.
 *
 * Geometry: pointy-top hexes (a vertex points up), axial coordinates, board
 * laid out as a radius-2 hexagon (rows of 3-4-5-4-3 = 19 tiles).
 */

import { Axial, BoardTopology, EdgeTopo, Pixel, PortTopo, TileTopo, VertexTopo } from './types.js';

/** Hex "size" = center-to-corner distance, in SVG px. */
const HEX_SIZE = 60;
const SQRT3 = Math.sqrt(3);

function hexCenter({ q, r }: Axial): Pixel {
  return {
    x: HEX_SIZE * SQRT3 * (q + r / 2),
    y: HEX_SIZE * (3 / 2) * r,
  };
}

function hexCorner(center: Pixel, i: number): Pixel {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: center.x + HEX_SIZE * Math.cos(angle),
    y: center.y + HEX_SIZE * Math.sin(angle),
  };
}

/** A stable integer key for a pixel point; distinct vertices are ~60px apart. */
function pointKey(p: Pixel): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** The 19 axial coordinates of a radius-2 hexagon. */
function hexAxials(): Axial[] {
  const out: Axial[] = [];
  const N = 2;
  for (let q = -N; q <= N; q++) {
    const r1 = Math.max(-N, -q - N);
    const r2 = Math.min(N, -q + N);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
}

export function generateBoardTopology(): BoardTopology {
  const axials = hexAxials();

  // --- Tiles + shared vertices (deduped by rounded pixel position) ----------
  const vertexByKey = new Map<string, VertexTopo>();
  const tiles: TileTopo[] = [];

  function internVertex(p: Pixel): VertexTopo {
    const key = pointKey(p);
    let v = vertexByKey.get(key);
    if (!v) {
      v = { id: vertexByKey.size, pixel: { x: round2(p.x), y: round2(p.y) }, tiles: [], edges: [], vertices: [] };
      vertexByKey.set(key, v);
    }
    return v;
  }

  axials.forEach((axial, tileId) => {
    const center = hexCenter(axial);
    const cornerVertexIds: number[] = [];
    for (let i = 0; i < 6; i++) {
      const v = internVertex(hexCorner(center, i));
      cornerVertexIds.push(v.id);
      if (!v.tiles.includes(tileId)) v.tiles.push(tileId);
    }
    tiles.push({
      id: tileId,
      axial,
      center: { x: round2(center.x), y: round2(center.y) },
      vertices: cornerVertexIds,
      edges: [], // filled below
    });
  });

  const vertices = [...vertexByKey.values()].sort((a, b) => a.id - b.id);

  // --- Edges (deduped by vertex pair) ---------------------------------------
  const edgeByKey = new Map<string, EdgeTopo>();
  function internEdge(a: number, b: number): EdgeTopo {
    const key = edgeKey(a, b);
    let e = edgeByKey.get(key);
    if (!e) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      e = { id: edgeByKey.size, vertices: [lo, hi], tiles: [] };
      edgeByKey.set(key, e);
    }
    return e;
  }

  for (const tile of tiles) {
    for (let i = 0; i < 6; i++) {
      const a = tile.vertices[i];
      const b = tile.vertices[(i + 1) % 6];
      const e = internEdge(a, b);
      tile.edges.push(e.id);
      if (!e.tiles.includes(tile.id)) e.tiles.push(tile.id);
    }
  }

  const edges = [...edgeByKey.values()].sort((a, b) => a.id - b.id);

  // --- Vertex adjacency (edges + neighbor vertices) -------------------------
  for (const e of edges) {
    const [a, b] = e.vertices;
    vertices[a].edges.push(e.id);
    vertices[b].edges.push(e.id);
    vertices[a].vertices.push(b);
    vertices[b].vertices.push(a);
  }
  for (const v of vertices) {
    v.edges.sort((x, y) => x - y);
    v.vertices.sort((x, y) => x - y);
    v.tiles.sort((x, y) => x - y);
  }
  for (const e of edges) e.tiles.sort((x, y) => x - y);

  // --- Ports along the perimeter --------------------------------------------
  const ports = generatePorts(vertices, edges);

  return { tiles, vertices, edges, ports };
}

/**
 * Place the 9 base-game ports on perimeter edges. We walk the outer boundary
 * (edges touching a single tile) as a cycle and place a port every few edges,
 * matching the real board's evenly-spaced 9-port frame. Resource *types* are
 * assigned at game start, not here.
 */
function generatePorts(vertices: VertexTopo[], edges: EdgeTopo[]): PortTopo[] {
  const perimeterEdges = edges.filter((e) => e.tiles.length === 1);

  // Build perimeter-vertex adjacency from perimeter edges, then walk the cycle.
  const adj = new Map<number, number[]>();
  for (const e of perimeterEdges) {
    const [a, b] = e.vertices;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }

  // Ordered cycle of perimeter edges as [v0,v1] pairs.
  const start = perimeterEdges[0].vertices[0];
  const cycle: [number, number][] = [];
  let prev = -1;
  let cur = start;
  do {
    const next = (adj.get(cur) ?? []).find((n) => n !== prev);
    if (next === undefined) break;
    cycle.push([cur, next]);
    prev = cur;
    cur = next;
  } while (cur !== start && cycle.length < perimeterEdges.length + 1);

  const center = boardCenter(vertices);
  // 9 ports across 30 perimeter edges: steps summing to 30 (3,3,4 repeated).
  const steps = [3, 3, 4, 3, 3, 4, 3, 3, 4];
  const ports: PortTopo[] = [];
  let idx = 0;
  for (let i = 0; i < steps.length; i++) {
    const [a, b] = cycle[idx % cycle.length];
    ports.push({ id: i, vertices: [a, b], pixel: portMarker(vertices[a].pixel, vertices[b].pixel, center) });
    idx += steps[i];
  }
  return ports;
}

function boardCenter(vertices: VertexTopo[]): Pixel {
  const n = vertices.length;
  const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.pixel.x, y: acc.y + v.pixel.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

/** Midpoint of the two port vertices, pushed outward away from board center. */
function portMarker(a: Pixel, b: Pixel, center: Pixel): Pixel {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const push = 28;
  return { x: round2(mid.x + (dx / len) * push), y: round2(mid.y + (dy / len) * push) };
}

function round2(n: number): number {
  // `+ 0` normalizes -0 to 0 so frozen (JSON round-tripped) and fresh outputs
  // compare deeply equal.
  return Math.round(n * 100) / 100 + 0;
}
