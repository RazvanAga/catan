/**
 * Verification of the frozen board topology — the highest-risk artifact, since
 * everything downstream reads from it. We assert the known-correct base-game
 * shape: 19 tiles, 54 vertices, 72 edges, 9 ports, the standard interior/
 * perimeter distribution, and the internal consistency of every adjacency list.
 */

import { describe, expect, it } from 'vitest';
import { BOARD, createBoardSetup, generateBoardTopology } from '../src/index.js';
import { seededRng } from './helpers.js';

describe('frozen board topology', () => {
  it('has the base-game element counts', () => {
    expect(BOARD.tiles).toHaveLength(19);
    expect(BOARD.vertices).toHaveLength(54);
    expect(BOARD.edges).toHaveLength(72);
    expect(BOARD.ports).toHaveLength(9);
  });

  it('matches the freshly generated topology (frozen data is in sync)', () => {
    expect(BOARD).toEqual(generateBoardTopology());
  });

  it('has 24 interior + 30 perimeter vertices (18 corner + 12 edge)', () => {
    const byTileCount = (n: number) => BOARD.vertices.filter((v) => v.tiles.length === n).length;
    expect(byTileCount(3)).toBe(24); // interior
    expect(byTileCount(2)).toBe(12); // perimeter, between two tiles
    expect(byTileCount(1)).toBe(18); // perimeter corners
  });

  it('has 30 perimeter edges and 42 interior edges', () => {
    expect(BOARD.edges.filter((e) => e.tiles.length === 1)).toHaveLength(30);
    expect(BOARD.edges.filter((e) => e.tiles.length === 2)).toHaveLength(42);
  });

  it('every tile has 6 distinct vertices and 6 distinct edges', () => {
    for (const tile of BOARD.tiles) {
      expect(new Set(tile.vertices).size).toBe(6);
      expect(new Set(tile.edges).size).toBe(6);
    }
  });

  it('tile edge i joins tile vertices i and i+1', () => {
    for (const tile of BOARD.tiles) {
      for (let i = 0; i < 6; i++) {
        const a = tile.vertices[i];
        const b = tile.vertices[(i + 1) % 6];
        const edge = BOARD.edges[tile.edges[i]];
        expect([...edge.vertices].sort()).toEqual([a, b].sort());
      }
    }
  });

  it('adjacency is symmetric: edges and vertex neighbors agree', () => {
    for (const e of BOARD.edges) {
      const [a, b] = e.vertices;
      expect(BOARD.vertices[a].vertices).toContain(b);
      expect(BOARD.vertices[b].vertices).toContain(a);
      expect(BOARD.vertices[a].edges).toContain(e.id);
      expect(BOARD.vertices[b].edges).toContain(e.id);
    }
  });

  it('each vertex lists exactly as many neighbors as incident edges (2 or 3)', () => {
    for (const v of BOARD.vertices) {
      expect(v.vertices.length).toBe(v.edges.length);
      expect([2, 3]).toContain(v.edges.length);
    }
  });

  it('tile/vertex membership is mutual', () => {
    for (const tile of BOARD.tiles) {
      for (const vid of tile.vertices) {
        expect(BOARD.vertices[vid].tiles).toContain(tile.id);
      }
    }
  });

  it('places 9 ports on 18 distinct perimeter vertices', () => {
    const portVerts = BOARD.ports.flatMap((p) => p.vertices);
    expect(new Set(portVerts).size).toBe(18);
    for (const v of portVerts) {
      expect(BOARD.vertices[v].tiles.length).toBeLessThan(3); // perimeter only
    }
    for (const port of BOARD.ports) {
      // a port's two vertices are joined by an edge (a real board edge)
      const joined = BOARD.edges.some(
        (e) => e.vertices.includes(port.vertices[0]) && e.vertices.includes(port.vertices[1]),
      );
      expect(joined).toBe(true);
    }
  });
});

describe('random board content', () => {
  it('produces the base-game resource and token bags', () => {
    const setup = createBoardSetup(seededRng(7));
    const tally = setup.tileResources.reduce<Record<string, number>>((m, r) => {
      m[r] = (m[r] ?? 0) + 1;
      return m;
    }, {});
    expect(tally).toEqual({ wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 });

    // The desert carries no token and is where the robber starts.
    expect(setup.tileTokens[setup.robberTile]).toBeNull();
    expect(setup.tileResources[setup.robberTile]).toBe('desert');
    const tokens = setup.tileTokens.filter((t): t is number => t !== null).sort((a, b) => a - b);
    expect(tokens).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    expect(tokens).not.toContain(7);
  });

  it('never places two red tokens (6/8) on adjacent tiles', () => {
    const adjacent = BOARD.edges.filter((e) => e.tiles.length === 2);
    const red = new Set([6, 8]);
    for (let seed = 0; seed < 200; seed++) {
      const { tileTokens } = createBoardSetup(seededRng(seed));
      for (const e of adjacent) {
        const [a, b] = e.tiles;
        const bothRed = red.has(tileTokens[a] ?? 0) && red.has(tileTokens[b] ?? 0);
        expect(bothRed).toBe(false);
      }
    }
  });

  it('assigns 4 generic + 5 specific ports', () => {
    const setup = createBoardSetup(seededRng(7));
    expect(setup.portTypes).toHaveLength(9);
    expect(setup.portTypes.filter((p) => p === '3:1')).toHaveLength(4);
    expect([...setup.portTypes].filter((p) => p !== '3:1').sort()).toEqual([
      'brick',
      'ore',
      'sheep',
      'wheat',
      'wood',
    ]);
  });
});
