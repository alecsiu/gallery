import type { Piece, Rect } from './types';

export const EPS = 1e-6;

type FrameParts = Pick<Piece, 'artW' | 'artH' | 'matX' | 'matY' | 'frame'>;

/** Opening of the frame (art plus mat). */
export const innerW = (p: FrameParts) => p.artW + 2 * p.matX;
export const innerH = (p: FrameParts) => p.artH + 2 * p.matY;
/** Outside dimensions of the frame. */
export const outerW = (p: FrameParts) => innerW(p) + 2 * p.frame;
export const outerH = (p: FrameParts) => innerH(p) + 2 * p.frame;

export const pieceRect = (p: Piece): Rect => ({ x: p.x, y: p.y, w: outerW(p), h: outerH(p) });
export const rectRight = (r: Rect) => r.x + r.w;
export const rectBottom = (r: Rect) => r.y + r.h;

/** Length of the overlap of [a0,a1] and [b0,b1]; negative when apart. */
export const overlapLen = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

export interface Wall {
  w: number;
  h: number;
}

export interface GapLine {
  id: string;
  /** 'h' measures a horizontal distance (line is horizontal); 'v' a vertical one. */
  axis: 'h' | 'v';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Signed distance in inches; negative means overlap / outside the wall. */
  value: number;
  kind: 'piece' | 'wall';
}

interface Identified {
  id: string;
  rect: Rect;
}

/** For every piece, the gap to its nearest neighbor to the right and below. */
export function neighborGaps(items: Identified[]): GapLine[] {
  const lines: GapLine[] = [];
  for (const a of items) {
    const ar = a.rect;
    let nearestRight: { b: Identified; gap: number } | null = null;
    let nearestDown: { b: Identified; gap: number } | null = null;
    for (const b of items) {
      if (a === b) continue;
      const br = b.rect;
      if (overlapLen(ar.y, rectBottom(ar), br.y, rectBottom(br)) > EPS && br.x + br.w / 2 > ar.x + ar.w / 2) {
        const gap = br.x - rectRight(ar);
        if (!nearestRight || gap < nearestRight.gap) nearestRight = { b, gap };
      }
      if (overlapLen(ar.x, rectRight(ar), br.x, rectRight(br)) > EPS && br.y + br.h / 2 > ar.y + ar.h / 2) {
        const gap = br.y - rectBottom(ar);
        if (!nearestDown || gap < nearestDown.gap) nearestDown = { b, gap };
      }
    }
    if (nearestRight) {
      const br = nearestRight.b.rect;
      const y = (Math.max(ar.y, br.y) + Math.min(rectBottom(ar), rectBottom(br))) / 2;
      lines.push({
        id: `${a.id}>${nearestRight.b.id}:h`,
        axis: 'h',
        x1: rectRight(ar),
        y1: y,
        x2: br.x,
        y2: y,
        value: nearestRight.gap,
        kind: 'piece',
      });
    }
    if (nearestDown) {
      const br = nearestDown.b.rect;
      const x = (Math.max(ar.x, br.x) + Math.min(rectRight(ar), rectRight(br))) / 2;
      lines.push({
        id: `${a.id}>${nearestDown.b.id}:v`,
        axis: 'v',
        x1: x,
        y1: rectBottom(ar),
        x2: x,
        y2: br.y,
        value: nearestDown.gap,
        kind: 'piece',
      });
    }
  }
  return lines;
}

/** Distances from a rectangle to the four wall edges. */
export function wallGaps(id: string, r: Rect, wall: Wall): GapLine[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    { id: `${id}:wl`, axis: 'h', x1: 0, y1: cy, x2: r.x, y2: cy, value: r.x, kind: 'wall' },
    { id: `${id}:wr`, axis: 'h', x1: rectRight(r), y1: cy, x2: wall.w, y2: cy, value: wall.w - rectRight(r), kind: 'wall' },
    { id: `${id}:wt`, axis: 'v', x1: cx, y1: 0, x2: cx, y2: r.y, value: r.y, kind: 'wall' },
    { id: `${id}:wb`, axis: 'v', x1: cx, y1: rectBottom(r), x2: cx, y2: wall.h, value: wall.h - rectBottom(r), kind: 'wall' },
  ];
}

/** Pieces that overlap another piece or stick out of the wall. */
export function invalidPieceIds(pieces: Piece[], wall: Wall): Set<string> {
  const bad = new Set<string>();
  const rects = pieces.map((p) => ({ id: p.id, rect: pieceRect(p) }));
  for (const a of rects) {
    const r = a.rect;
    if (r.x < -EPS || r.y < -EPS || rectRight(r) > wall.w + EPS || rectBottom(r) > wall.h + EPS) bad.add(a.id);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].rect;
      const b = rects[j].rect;
      if (
        overlapLen(a.x, rectRight(a), b.x, rectRight(b)) > EPS &&
        overlapLen(a.y, rectBottom(a), b.y, rectBottom(b)) > EPS
      ) {
        bad.add(rects[i].id);
        bad.add(rects[j].id);
      }
    }
  }
  return bad;
}

export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

interface Candidate {
  d: number;
  guide?: Guide;
}

function snapAxis(m: Rect, axis: 'x' | 'y', others: Rect[], aligns: Rect[], wall: Wall, gap: number, thr: number) {
  const lo = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const sz = (r: Rect) => (axis === 'x' ? r.w : r.h);
  const plo = (r: Rect) => (axis === 'x' ? r.y : r.x);
  const psz = (r: Rect) => (axis === 'x' ? r.h : r.w);
  const hi = (r: Rect) => lo(r) + sz(r);
  const mid = (r: Rect) => lo(r) + sz(r) / 2;

  const cands: Candidate[] = [];
  const wallRect: Rect = { x: 0, y: 0, w: wall.w, h: wall.h };
  for (const t of [wallRect, ...aligns, ...others]) {
    for (const f of [lo, mid, hi]) {
      cands.push({
        d: f(t) - f(m),
        guide: {
          axis,
          pos: f(t),
          from: Math.min(plo(t), plo(m)),
          to: Math.max(plo(t) + psz(t), plo(m) + psz(m)),
        },
      });
    }
  }
  for (const t of others) {
    if (overlapLen(plo(m), plo(m) + psz(m), plo(t), plo(t) + psz(t)) > 0) {
      cands.push({ d: hi(t) + gap - lo(m) });
      cands.push({ d: lo(t) - gap - hi(m) });
    }
  }
  let best: Candidate | null = null;
  for (const c of cands) if (Math.abs(c.d) <= thr && (!best || Math.abs(c.d) < Math.abs(best.d))) best = c;
  if (!best) return { d: 0, guides: [] as Guide[] };
  const d = best.d;
  const guides = cands.filter((c) => c.guide && Math.abs(c.d - d) < 1e-4).map((c) => c.guide as Guide);
  return { d, guides };
}

/**
 * Snaps a moving rectangle to alignment lines (edges and centers of the wall, other pieces and
 * guide rectangles) and to a preferred gap from neighboring pieces.
 */
export function snapRect(
  moving: Rect,
  others: Rect[],
  aligns: Rect[],
  wall: Wall,
  gap: number,
  threshold: number,
): { x: number; y: number; guides: Guide[] } {
  const sx = snapAxis(moving, 'x', others, aligns, wall, gap, threshold);
  const afterX = { ...moving, x: moving.x + sx.d };
  const sy = snapAxis(afterX, 'y', others, aligns, wall, gap, threshold);
  return { x: afterX.x, y: moving.y + sy.d, guides: [...sx.guides, ...sy.guides] };
}
