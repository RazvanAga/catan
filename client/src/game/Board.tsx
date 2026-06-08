/**
 * The SVG board. Renders the frozen topology (`BOARD`) filled with the live
 * content + pieces from the server snapshot (`view.board`): hex tiles colored by
 * resource, number tokens, ports, the robber, and placed roads/settlements/
 * cities in player colors. Highlighted vertices/edges are clickable for the
 * active player's current placement.
 */

import { useMemo } from 'react';
import { BOARD, GameView, PlayerColor } from '@catan/shared';
import { COLOR_HEX, RESOURCE_HEX } from '../colors';

interface BoardProps {
  view: GameView;
  highlightVertices?: Set<number>;
  highlightEdges?: Set<number>;
  highlightTiles?: Set<number>;
  onVertexClick?: (vertex: number) => void;
  onEdgeClick?: (edge: number) => void;
  onTileClick?: (tile: number) => void;
}

function colorOf(view: GameView, playerId: string): string {
  const p = view.players.find((pl) => pl.id === playerId);
  return p ? COLOR_HEX[p.color as PlayerColor] : '#888';
}

export function Board({
  view,
  highlightVertices,
  highlightEdges,
  highlightTiles,
  onVertexClick,
  onEdgeClick,
  onTileClick,
}: BoardProps) {
  const board = view.board;

  const viewBox = useMemo(() => {
    const pts = [
      ...BOARD.vertices.map((v) => v.pixel),
      ...BOARD.ports.map((p) => p.pixel),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 30;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return `${minX} ${minY} ${w} ${h}`;
  }, []);

  if (!board) return null;

  return (
    <svg className="board" viewBox={viewBox} role="img" aria-label="Catan board">
      {/* Tiles */}
      {BOARD.tiles.map((tile) => {
        const resource = board.setup.tileResources[tile.id];
        const token = board.setup.tileTokens[tile.id];
        const points = tile.vertices.map((vid) => `${BOARD.vertices[vid].pixel.x},${BOARD.vertices[vid].pixel.y}`).join(' ');
        const isRed = token === 6 || token === 8;
        return (
          <g key={`t${tile.id}`}>
            <clipPath id={`hexclip-${tile.id}`}>
              <polygon points={points} />
            </clipPath>
            <polygon points={points} fill={RESOURCE_HEX[resource]} />
            <image
              href={`/tiles/${resource}.png`}
              x={tile.center.x - 75}
              y={tile.center.y - 75}
              width={150}
              height={150}
              clipPath={`url(#hexclip-${tile.id})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <polygon points={points} fill="none" stroke="#0d141d" strokeWidth={2} />
            {token != null && (
              <g>
                <circle cx={tile.center.x} cy={tile.center.y} r={16} fill="#f4ecd6" stroke="#0d141d" />
                <text
                  x={tile.center.x}
                  y={tile.center.y + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill={isRed ? '#c0392b' : '#23303f'}
                >
                  {token}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Ports */}
      {BOARD.ports.map((port) => {
        const type = board.setup.portTypes[port.id];
        const isResource = type !== '3:1';
        return (
          <g key={`p${port.id}`}>
            {port.vertices.map((vid) => (
              <line
                key={vid}
                x1={port.pixel.x}
                y1={port.pixel.y}
                x2={BOARD.vertices[vid].pixel.x}
                y2={BOARD.vertices[vid].pixel.y}
                stroke="#5a4a2f"
                strokeWidth={2}
              />
            ))}
            <circle cx={port.pixel.x} cy={port.pixel.y} r={14} fill="#2a3a52" stroke="#9fb4d0" />
            {isResource ? (
              <>
                <image
                  href={`/icons/${type}.png`}
                  x={port.pixel.x - 8}
                  y={port.pixel.y - 12}
                  width={16}
                  height={16}
                />
                <text x={port.pixel.x} y={port.pixel.y + 11} textAnchor="middle" fontSize={7} fontWeight={700} fill="#dfe8f4">
                  2:1
                </text>
              </>
            ) : (
              <text x={port.pixel.x} y={port.pixel.y + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#dfe8f4">
                3:1
              </text>
            )}
          </g>
        );
      })}

      {/* Roads */}
      {Object.entries(board.roads).map(([edgeId, road]) => {
        const e = BOARD.edges[Number(edgeId)];
        const [a, b] = e.vertices;
        return (
          <line
            key={`r${edgeId}`}
            x1={BOARD.vertices[a].pixel.x}
            y1={BOARD.vertices[a].pixel.y}
            x2={BOARD.vertices[b].pixel.x}
            y2={BOARD.vertices[b].pixel.y}
            stroke={colorOf(view, road.owner)}
            strokeWidth={7}
            strokeLinecap="round"
          />
        );
      })}

      {/* Edge highlights (clickable) */}
      {[...(highlightEdges ?? [])].map((edgeId) => {
        const e = BOARD.edges[edgeId];
        const [a, b] = e.vertices;
        return (
          <line
            key={`he${edgeId}`}
            x1={BOARD.vertices[a].pixel.x}
            y1={BOARD.vertices[a].pixel.y}
            x2={BOARD.vertices[b].pixel.x}
            y2={BOARD.vertices[b].pixel.y}
            stroke="#ffffff"
            strokeOpacity={0.5}
            strokeWidth={9}
            strokeLinecap="round"
            className="clickable"
            onClick={() => onEdgeClick?.(edgeId)}
          />
        );
      })}

      {/* Robber — black disc with a white swords icon (lucide Swords) */}
      <g
        transform={`translate(${BOARD.tiles[board.robberTile].center.x}, ${
          BOARD.tiles[board.robberTile].center.y - 22
        })`}
      >
        <circle r={15} fill="#1a1a1a" stroke="#fff" strokeWidth={1.5} />
        <g
          transform="translate(-10.8, -10.8) scale(0.9)"
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
          <line x1="13" x2="19" y1="19" y2="13" />
          <line x1="16" x2="20" y1="16" y2="20" />
          <line x1="19" x2="21" y1="21" y2="19" />
          <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
          <line x1="5" x2="9" y1="14" y2="18" />
          <line x1="7" x2="4" y1="17" y2="20" />
          <line x1="3" x2="5" y1="19" y2="21" />
        </g>
      </g>

      {/* Tile highlights (clickable — robber placement) */}
      {[...(highlightTiles ?? [])].map((tileId) => {
        const tile = BOARD.tiles[tileId];
        const points = tile.vertices
          .map((vid) => `${BOARD.vertices[vid].pixel.x},${BOARD.vertices[vid].pixel.y}`)
          .join(' ');
        return (
          <polygon
            key={`ht${tileId}`}
            points={points}
            fill="#ffffff"
            fillOpacity={0.35}
            stroke="#fff"
            strokeWidth={3}
            className="clickable"
            onClick={() => onTileClick?.(tileId)}
          />
        );
      })}

      {/* Buildings */}
      {Object.entries(board.buildings).map(([vid, b]) => {
        const p = BOARD.vertices[Number(vid)].pixel;
        const fill = colorOf(view, b.owner);
        return b.city ? (
          <rect key={`b${vid}`} x={p.x - 9} y={p.y - 9} width={18} height={18} rx={3} fill={fill} stroke="#0d141d" strokeWidth={2} />
        ) : (
          <circle key={`b${vid}`} cx={p.x} cy={p.y} r={8} fill={fill} stroke="#0d141d" strokeWidth={2} />
        );
      })}

      {/* Vertex highlights (clickable) */}
      {[...(highlightVertices ?? [])].map((vid) => {
        const p = BOARD.vertices[vid].pixel;
        return (
          <circle
            key={`hv${vid}`}
            cx={p.x}
            cy={p.y}
            r={10}
            fill="#ffffff"
            fillOpacity={0.55}
            stroke="#fff"
            className="clickable"
            onClick={() => onVertexClick?.(vid)}
          />
        );
      })}
    </svg>
  );
}
