/**
 * Original CC0 terrain art for the board hexes. Pure inline SVG, drawn to fit a
 * pointy-top hex (center-to-corner 60px, matching HEX_SIZE in the board
 * generator). Each terrain paints simple flat motifs over the resource base
 * color so the board reads at a glance without leaning on any third-party
 * assets. Motifs are positioned relative to a tile center (cx, cy); the caller
 * clips them to the hex.
 */
import { TileResource } from '@catan/shared';

interface At {
  cx: number;
  cy: number;
}

export function TerrainArt({ resource, cx, cy }: { resource: TileResource } & At) {
  switch (resource) {
    case 'wood':
      return <Forest cx={cx} cy={cy} />;
    case 'ore':
      return <Mountains cx={cx} cy={cy} />;
    case 'wheat':
      return <Fields cx={cx} cy={cy} />;
    case 'sheep':
      return <Pasture cx={cx} cy={cy} />;
    case 'brick':
      return <Hills cx={cx} cy={cy} />;
    case 'desert':
      return <Desert cx={cx} cy={cy} />;
  }
}

/* --- wood: a stand of pine trees ----------------------------------------- */

function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <rect x={x - 1.6 * s} y={y - 3 * s} width={3.2 * s} height={6 * s} fill="#5e3b22" />
      <polygon points={`${x},${y - 23 * s} ${x - 9 * s},${y} ${x + 9 * s},${y}`} fill="#2f8a45" />
      <polygon points={`${x},${y - 29 * s} ${x - 7 * s},${y - 9 * s} ${x + 7 * s},${y - 9 * s}`} fill="#49ad5e" />
    </g>
  );
}

function Forest({ cx, cy }: At) {
  return (
    <g>
      <Pine x={cx - 20} y={cy + 25} s={1} />
      <Pine x={cx + 2} y={cy + 29} s={0.9} />
      <Pine x={cx + 22} y={cy + 17} s={0.85} />
      <Pine x={cx - 8} y={cy + 4} s={1.1} />
      <Pine x={cx + 15} y={cy - 5} s={0.9} />
    </g>
  );
}

/* --- ore: snow-capped mountain peaks ------------------------------------- */

function Peak({ x, base, h, w, fill }: { x: number; base: number; h: number; w: number; fill: string }) {
  const half = w / 2;
  const cap = 0.36;
  return (
    <g>
      <polygon points={`${x},${base - h} ${x - half},${base} ${x + half},${base}`} fill={fill} />
      <polygon
        points={`${x},${base - h} ${x - half * cap},${base - h + h * cap} ${x + half * cap},${base - h + h * cap}`}
        fill="#eef2f6"
      />
    </g>
  );
}

function Mountains({ cx, cy }: At) {
  return (
    <g>
      <Peak x={cx - 28} base={cy + 30} h={30} w={34} fill="#4c545f" />
      <Peak x={cx - 8} base={cy + 30} h={52} w={62} fill="#565f6b" />
      <Peak x={cx + 22} base={cy + 30} h={40} w={48} fill="#6b7480" />
    </g>
  );
}

/* --- wheat: plowed furrows with wheat bundles ---------------------------- */

function WheatBundle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      {[-1, 0, 1].map((i) => (
        <line
          key={i}
          x1={x}
          y1={y}
          x2={x + i * 5 * s}
          y2={y - 20 * s}
          stroke="#b8851d"
          strokeWidth={1.8 * s}
          strokeLinecap="round"
        />
      ))}
      {[-1, 0, 1].map((i) => (
        <ellipse key={i} cx={x + i * 5 * s} cy={y - 21 * s} rx={2.6 * s} ry={4.2 * s} fill="#efc94c" />
      ))}
    </g>
  );
}

function Fields({ cx, cy }: At) {
  return (
    <g>
      {[-32, -18, -4, 10, 24].map((dy, i) => (
        <line
          key={i}
          x1={cx - 44}
          y1={cy + dy}
          x2={cx + 44}
          y2={cy + dy}
          stroke="#caa028"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
      <WheatBundle x={cx - 22} y={cy + 30} s={1.05} />
      <WheatBundle x={cx + 8} y={cy + 27} s={1.2} />
      <WheatBundle x={cx + 28} y={cy + 4} s={0.95} />
      <WheatBundle x={cx - 5} y={cy + 6} s={1} />
    </g>
  );
}

/* --- sheep: pasture with grazing sheep ----------------------------------- */

function Sheep({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <rect x={x - 5 * s} y={y + 3 * s} width={2 * s} height={5 * s} fill="#3c3c3c" />
      <rect x={x + 2 * s} y={y + 3 * s} width={2 * s} height={5 * s} fill="#3c3c3c" />
      <ellipse cx={x} cy={y} rx={9 * s} ry={6.5 * s} fill="#f4f4f1" />
      <ellipse cx={x - 1 * s} cy={y - 3 * s} rx={7 * s} ry={5 * s} fill="#fbfbf9" />
      <circle cx={x + 8.5 * s} cy={y - 1.5 * s} r={3.6 * s} fill="#3c3c3c" />
    </g>
  );
}

function Tuft({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y} l-3 -6 M${x} ${y} l0 -7 M${x + 3} ${y} l3 -6`}
      stroke="#5f9c3a"
      strokeWidth={1.4}
      fill="none"
      strokeLinecap="round"
    />
  );
}

function Pasture({ cx, cy }: At) {
  return (
    <g>
      <Tuft x={cx - 30} y={cy + 22} />
      <Tuft x={cx + 28} y={cy + 16} />
      <Tuft x={cx + 4} y={cy + 30} />
      <Tuft x={cx - 22} y={cy - 8} />
      <Sheep x={cx - 12} y={cy + 16} s={1} />
      <Sheep x={cx + 16} y={cy + 2} s={0.9} />
      <Sheep x={cx - 2} y={cy - 14} s={0.8} />
    </g>
  );
}

/* --- brick: a coursed brick wall ----------------------------------------- */

function Hills({ cx, cy }: At) {
  const bw = 22;
  const bh = 9;
  const stepx = bw + 4;
  const stepy = bh + 4;
  const bricks: JSX.Element[] = [];
  let key = 0;
  for (let r = 0; r < 6; r++) {
    const y = cy - 34 + r * stepy;
    const off = r % 2 ? stepx / 2 : 0;
    for (let c = -3; c <= 3; c++) {
      const x = cx + c * stepx + off - bw / 2;
      bricks.push(<rect key={key++} x={x} y={y} width={bw} height={bh} rx={2} fill="#9c4426" />);
    }
  }
  return <g>{bricks}</g>;
}

/* --- desert: dunes, a cactus, and pebbles -------------------------------- */

function Cactus({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g fill="#5b8f3f">
      <rect x={x - 3 * s} y={y - 22 * s} width={6 * s} height={26 * s} rx={3 * s} />
      <rect x={x - 11 * s} y={y - 14 * s} width={5 * s} height={11 * s} rx={2.5 * s} />
      <rect x={x - 11 * s} y={y - 9 * s} width={9 * s} height={5 * s} rx={2.5 * s} />
      <rect x={x + 6 * s} y={y - 19 * s} width={5 * s} height={13 * s} rx={2.5 * s} />
      <rect x={x + 2 * s} y={y - 14 * s} width={9 * s} height={5 * s} rx={2.5 * s} />
    </g>
  );
}

function Desert({ cx, cy }: At) {
  return (
    <g>
      <path
        d={`M${cx - 46} ${cy + 4} q 18 -12 36 0 q 18 12 36 0`}
        stroke="#cdb079"
        strokeWidth={2.4}
        fill="none"
      />
      <path
        d={`M${cx - 44} ${cy + 22} q 16 -10 32 0 q 16 10 32 0`}
        stroke="#cdb079"
        strokeWidth={2.2}
        fill="none"
      />
      <Cactus x={cx - 6} y={cy + 8} s={1} />
      <circle cx={cx + 20} cy={cy + 20} r={2.4} fill="#bfa06b" />
      <circle cx={cx + 26} cy={cy + 18} r={1.8} fill="#bfa06b" />
      <circle cx={cx - 26} cy={cy - 4} r={2} fill="#bfa06b" />
    </g>
  );
}
