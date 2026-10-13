import type { PointerEvent as ReactPointerEvent } from 'react';
import { invalidPieceIds, innerH, innerW, neighborGaps, outerH, outerW, pieceRect, wallGaps } from '../geometry';
import type { GapLine, Guide } from '../geometry';
import { formatLabel } from '../units';
import type { Layout, Piece, Unit } from '../types';

export type HandleKind = 'r' | 'b' | 'rb';

export interface WallSvgHandlers {
  onBackground?: (e: ReactPointerEvent) => void;
  onPiece?: (e: ReactPointerEvent, piece: Piece) => void;
  onFurniture?: (e: ReactPointerEvent) => void;
  onHandle?: (e: ReactPointerEvent, kind: HandleKind) => void;
}

interface Props {
  layout: Layout;
  unit: Unit;
  /** Pixels per inch. */
  scale: number;
  showDims: boolean;
  selectedId?: string | null;
  /** The piece whose distances to the wall edges are shown (selected or being dragged). */
  activeId?: string | null;
  guides?: Guide[];
  /** Thumbnail mode: no labels, no dimension lines. */
  compact?: boolean;
  interactive?: boolean;
  handlers?: WallSvgHandlers;
}

export const COLORS = {
  surround: '#e7e3da',
  wall: '#faf8f3',
  wallStroke: '#8a8478',
  grid: '#ebe6da',
  frame: '#3d362e',
  mat: '#ffffff',
  art: '#d9d3c5',
  artStroke: '#a79f8d',
  selected: '#2f6fed',
  invalid: '#d92d4b',
  dim: '#0b7285',
  dimWall: '#7b7568',
  guide: '#e0289c',
  furniture: '#b9c4d6',
  furnitureStroke: '#6d7f9c',
  text: '#26231f',
};

/** Free space around the wall so pieces can be parked outside it. */
export const worldMargin = (wall: { w: number; h: number }) => Math.max(12, 0.12 * Math.max(wall.w, wall.h));

function DimLine({ line, unit, s }: { line: GapLine; unit: Unit; s: number }) {
  const negative = line.value < -1e-6;
  const color = negative ? COLORS.invalid : line.kind === 'wall' ? COLORS.dimWall : COLORS.dim;
  const tick = 4 / s;
  const fs = 11 / s;
  const mx = (line.x1 + line.x2) / 2;
  const my = (line.y1 + line.y2) / 2;
  const label = formatLabel(line.value, unit);
  return (
    <g pointerEvents="none" stroke={color} strokeWidth={1 / s} fill="none" strokeDasharray={line.kind === 'wall' ? `${4 / s} ${3 / s}` : undefined}>
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      {line.axis === 'h' ? (
        <>
          <line x1={line.x1} y1={line.y1 - tick} x2={line.x1} y2={line.y1 + tick} strokeDasharray="none" />
          <line x1={line.x2} y1={line.y2 - tick} x2={line.x2} y2={line.y2 + tick} strokeDasharray="none" />
        </>
      ) : (
        <>
          <line x1={line.x1 - tick} y1={line.y1} x2={line.x1 + tick} y2={line.y1} strokeDasharray="none" />
          <line x1={line.x2 - tick} y1={line.y2} x2={line.x2 + tick} y2={line.y2} strokeDasharray="none" />
        </>
      )}
      <text
        x={line.axis === 'h' ? mx : mx + 5 / s}
        y={line.axis === 'h' ? my - 4 / s : my + fs * 0.35}
        textAnchor={line.axis === 'h' ? 'middle' : 'start'}
        fontSize={fs}
        fill={color}
        stroke="#fff"
        strokeWidth={3 / s}
        strokeLinejoin="round"
        paintOrder="stroke"
        strokeDasharray="none"
      >
        {label}
      </text>
    </g>
  );
}

/** Draws the wall, furniture, frames and dimension lines. Pure, so it also serves PNG export and thumbnails. */
export function WallSvg({
  layout,
  unit,
  scale: s,
  showDims,
  selectedId = null,
  activeId = null,
  guides = [],
  compact = false,
  interactive = false,
  handlers = {},
}: Props) {
  const { wall, furniture, pieces } = layout;
  const m = worldMargin(wall);
  const bad = invalidPieceIds(pieces, wall);
  const cursor = (c: string) => (interactive ? c : undefined);

  const gridStep = unit === 'in' ? 12 : 10 / 2.54;
  const gridLines: JSX.Element[] = [];
  if (!compact) {
    for (let x = gridStep; x < wall.w - 1e-6; x += gridStep) {
      gridLines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={wall.h} />);
    }
    for (let y = gridStep; y < wall.h - 1e-6; y += gridStep) {
      gridLines.push(<line key={`gy${y}`} x1={0} y1={y} x2={wall.w} y2={y} />);
    }
  }

  const rects = pieces.map((p) => ({ id: p.id, rect: pieceRect(p) }));
  const lines: GapLine[] = [];
  if (showDims && !compact) {
    lines.push(...neighborGaps(rects));
    const active = rects.find((r) => r.id === (activeId ?? selectedId));
    if (active) lines.push(...wallGaps(active.id, active.rect, wall));
  }

  const handleSize = 10 / s;
  const hit = 22 / s;
  const handleRects: { kind: HandleKind; x: number; y: number; cur: string }[] = [
    { kind: 'r', x: wall.w, y: wall.h / 2, cur: 'ew-resize' },
    { kind: 'b', x: wall.w / 2, y: wall.h, cur: 'ns-resize' },
    { kind: 'rb', x: wall.w, y: wall.h, cur: 'nwse-resize' },
  ];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={(wall.w + 2 * m) * s}
      height={(wall.h + 2 * m) * s}
      viewBox={`${-m} ${-m} ${wall.w + 2 * m} ${wall.h + 2 * m}`}
      fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={interactive ? handlers.onBackground : undefined}
    >
      <rect x={-m} y={-m} width={wall.w + 2 * m} height={wall.h + 2 * m} fill={COLORS.surround} />
      <rect x={0} y={0} width={wall.w} height={wall.h} fill={COLORS.wall} stroke={COLORS.wallStroke} strokeWidth={(compact ? 1.5 : 1.5) / s} />
      <g stroke={COLORS.grid} strokeWidth={1 / s}>{gridLines}</g>

      {furniture.enabled && (
        <g
          onPointerDown={interactive ? handlers.onFurniture : undefined}
          style={{ cursor: cursor('move') }}
        >
          <rect
            x={furniture.x}
            y={furniture.y}
            width={furniture.w}
            height={furniture.h}
            fill={COLORS.furniture}
            fillOpacity={0.55}
            stroke={COLORS.furnitureStroke}
            strokeWidth={1.5 / s}
            strokeDasharray={`${6 / s} ${4 / s}`}
          />
          {!compact && (
            <text
              x={furniture.x + furniture.w / 2}
              y={furniture.y + furniture.h / 2 + 4 / s}
              textAnchor="middle"
              fontSize={12 / s}
              fill={COLORS.furnitureStroke}
              pointerEvents="none"
            >
              {furniture.name}
            </text>
          )}
        </g>
      )}

      {pieces.map((p) => {
        const ow = outerW(p);
        const oh = outerH(p);
        const iw = innerW(p);
        const ih = innerH(p);
        const isBad = bad.has(p.id);
        const isSel = p.id === selectedId;
        const stroke = isBad ? COLORS.invalid : isSel ? COLORS.selected : '#1a1714';
        const artX = p.x + p.frame + p.matX;
        const artY = p.y + p.frame + p.matY;
        const showLabel = !compact && ow * s > 56 && oh * s > 30;
        const maxChars = Math.max(3, Math.floor((ow * s) / 6.5));
        const name = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name;
        return (
          <g
            key={p.id}
            onPointerDown={interactive ? (e) => handlers.onPiece?.(e, p) : undefined}
            style={{ cursor: cursor('grab') }}
          >
            <rect x={p.x} y={p.y} width={ow} height={oh} fill={COLORS.frame} />
            <rect x={p.x + p.frame} y={p.y + p.frame} width={iw} height={ih} fill={COLORS.mat} />
            <rect x={artX} y={artY} width={p.artW} height={p.artH} fill={COLORS.art} stroke={COLORS.artStroke} strokeWidth={0.75 / s} />
            {p.image && (
              <image
                href={p.image}
                x={artX}
                y={artY}
                width={p.artW}
                height={p.artH}
                preserveAspectRatio="xMidYMid slice"
                pointerEvents="none"
              />
            )}
            <rect
              x={p.x}
              y={p.y}
              width={ow}
              height={oh}
              fill="none"
              stroke={stroke}
              strokeWidth={(isSel || isBad ? 3 : 1) / s}
              pointerEvents="none"
            />
            {isBad && <rect x={p.x} y={p.y} width={ow} height={oh} fill={COLORS.invalid} fillOpacity={0.18} pointerEvents="none" />}
            {showLabel && (
              <g pointerEvents="none" textAnchor="middle" fill={COLORS.text} stroke="#fff" strokeWidth={3 / s} paintOrder="stroke" strokeLinejoin="round">
                <text x={p.x + ow / 2} y={p.y + oh / 2 - (oh * s > 46 ? 1 / s : -4 / s)} fontSize={12 / s} fontWeight={600}>
                  {name}
                </text>
                {oh * s > 46 && (
                  <text x={p.x + ow / 2} y={p.y + oh / 2 + 12 / s} fontSize={10 / s}>
                    {formatLabel(ow, unit)} × {formatLabel(oh, unit)}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}

      {lines.map((l) => (
        <DimLine key={l.id} line={l} unit={unit} s={s} />
      ))}

      {guides.map((g, i) => (
        <line
          key={i}
          x1={g.axis === 'x' ? g.pos : g.from}
          y1={g.axis === 'x' ? g.from : g.pos}
          x2={g.axis === 'x' ? g.pos : g.to}
          y2={g.axis === 'x' ? g.to : g.pos}
          stroke={COLORS.guide}
          strokeWidth={1 / s}
          strokeDasharray={`${5 / s} ${3 / s}`}
          pointerEvents="none"
        />
      ))}

      {interactive &&
        handleRects.map((h) => (
          <g key={h.kind} onPointerDown={(e) => handlers.onHandle?.(e, h.kind)} style={{ cursor: h.cur }}>
            <rect x={h.x - hit / 2} y={h.y - hit / 2} width={hit} height={hit} fill="transparent" />
            <rect
              x={h.x - handleSize / 2}
              y={h.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="#fff"
              stroke={COLORS.wallStroke}
              strokeWidth={1.5 / s}
              pointerEvents="none"
            />
          </g>
        ))}
    </svg>
  );
}
