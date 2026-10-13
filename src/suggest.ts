import { EPS, neighborGaps, overlapLen } from './geometry';
import type { Wall } from './geometry';
import type { Furniture, Rect } from './types';

export type TemplateId = 'row' | 'symmetric' | 'grid' | 'rows' | 'staircase' | 'salon';

export interface Sized {
  id: string;
  w: number;
  h: number;
}

export interface Suggestion {
  key: string;
  template: TemplateId;
  label: string;
  /** Top-left position of every piece's outer frame. */
  positions: Record<string, { x: number; y: number }>;
  /** 0-100, higher is better. */
  score: number;
}

/** Where a layout may go and where it wants to sit. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  anchor: { kind: 'center'; cy: number } | { kind: 'bottom'; y: number };
  idealW: number;
}

/** Museum convention: the middle of the art hangs 57" above the floor. */
const EYE_LEVEL = 57;
/** Space between the top of furniture and the bottom of the art. */
const FURNITURE_CLEARANCE = 8;
const SEEDS_PER_TEMPLATE = 10;

export function makeRegion(wall: Wall, furniture: Furniture): Region {
  const margin = Math.min(4, wall.w / 10, wall.h / 10);
  const x0 = margin;
  const x1 = wall.w - margin;
  const y0 = margin;
  let y1 = wall.h - margin;
  if (furniture.enabled) {
    y1 = Math.max(y0, Math.min(y1, furniture.y - FURNITURE_CLEARANCE));
    return {
      x0,
      x1,
      y0,
      y1,
      cx: furniture.x + furniture.w / 2,
      anchor: { kind: 'bottom', y: y1 },
      idealW: furniture.w * 0.75,
    };
  }
  return {
    x0,
    x1,
    y0,
    y1,
    cx: wall.w / 2,
    anchor: { kind: 'center', cy: wall.h - EYE_LEVEL },
    idealW: (x1 - x0) * 0.7,
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Rel = Map<string, { x: number; y: number }>;

function rowGen(items: Sized[], gap: number): Rel {
  const rel: Rel = new Map();
  let x = 0;
  for (const it of items) {
    rel.set(it.id, { x, y: -it.h / 2 });
    x += it.w + gap;
  }
  return rel;
}

/** Largest piece in the middle, then alternating right and left in descending size. */
function symmetricOrder(items: Sized[]): Sized[] {
  const sorted = [...items].sort((a, b) => b.w * b.h - a.w * a.h);
  const out: Sized[] = [];
  sorted.forEach((it, i) => {
    if (i === 0) out.push(it);
    else if (i % 2 === 1) out.push(it);
    else out.unshift(it);
  });
  return out;
}

function gridGen(items: Sized[], cols: number, gap: number): Rel {
  const rows = Math.ceil(items.length / cols);
  const colW = new Array<number>(cols).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  items.forEach((it, i) => {
    colW[i % cols] = Math.max(colW[i % cols], it.w);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], it.h);
  });
  const colX: number[] = [];
  let x = 0;
  for (const w of colW) {
    colX.push(x);
    x += w + gap;
  }
  const rowY: number[] = [];
  let y = 0;
  for (const h of rowH) {
    rowY.push(y);
    y += h + gap;
  }
  const rel: Rel = new Map();
  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    rel.set(it.id, { x: colX[c] + (colW[c] - it.w) / 2, y: rowY[r] + (rowH[r] - it.h) / 2 });
  });
  return rel;
}

/** Balanced rows, each centered on the others. */
function rowsGen(items: Sized[], k: number, gap: number): Rel {
  const bins: Sized[][] = Array.from({ length: k }, () => []);
  const widths = new Array<number>(k).fill(0);
  const bySize = items.map((it, i) => ({ it, i })).sort((a, b) => b.it.w - a.it.w);
  for (const { it } of bySize) {
    let target = 0;
    for (let b = 1; b < k; b++) if (widths[b] < widths[target]) target = b;
    bins[target].push(it);
    widths[target] += it.w + gap;
  }
  const order = new Map(items.map((it, i) => [it.id, i]));
  const rel: Rel = new Map();
  let y = 0;
  for (const bin of bins) {
    if (!bin.length) continue;
    bin.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const rowW = bin.reduce((s, it) => s + it.w, 0) + gap * (bin.length - 1);
    const rowH = Math.max(...bin.map((it) => it.h));
    let x = -rowW / 2;
    for (const it of bin) {
      rel.set(it.id, { x, y: y + (rowH - it.h) / 2 });
      x += it.w + gap;
    }
    y += rowH + gap;
  }
  return rel;
}

function staircaseGen(items: Sized[], gap: number, direction: 1 | -1): Rel {
  const avgH = items.reduce((s, it) => s + it.h, 0) / items.length;
  const riser = avgH * 0.4;
  const rel: Rel = new Map();
  let x = 0;
  items.forEach((it, i) => {
    const cy = (i - (items.length - 1) / 2) * riser * direction;
    rel.set(it.id, { x, y: cy - it.h / 2 });
    x += it.w + gap;
  });
  return rel;
}

/** Greedy compact cluster: biggest piece first, each next piece attached where the cluster stays tight. */
function salonGen(items: Sized[], gap: number, rng: () => number, targetAspect: number): Rel {
  const ordered = items
    .map((it) => ({ it, k: it.w * it.h * (0.85 + 0.3 * rng()) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.it);
  type Placed = Sized & { x: number; y: number };
  const placed: Placed[] = [{ ...ordered[0], x: 0, y: 0 }];
  const collides = (p: Sized, x: number, y: number) =>
    placed.some(
      (r) =>
        x < r.x + r.w + gap - EPS && x + p.w + gap - EPS > r.x && y < r.y + r.h + gap - EPS && y + p.h + gap - EPS > r.y,
    );
  for (const p of ordered.slice(1)) {
    const cands: { x: number; y: number }[] = [];
    for (const q of placed) {
      const ys = [q.y, q.y + q.h - p.h, q.y + q.h / 2 - p.h / 2];
      const xs = [q.x, q.x + q.w - p.w, q.x + q.w / 2 - p.w / 2];
      for (const y of ys) {
        cands.push({ x: q.x + q.w + gap, y });
        cands.push({ x: q.x - gap - p.w, y });
      }
      for (const x of xs) {
        cands.push({ x, y: q.y + q.h + gap });
        cands.push({ x, y: q.y - gap - p.h });
      }
    }
    const minX = Math.min(...placed.map((r) => r.x));
    const maxX = Math.max(...placed.map((r) => r.x + r.w));
    cands.push({ x: maxX + gap, y: 0 });
    cands.push({ x: minX - gap - p.w, y: 0 });
    let best: { x: number; y: number; cost: number } | null = null;
    for (const c of cands) {
      if (collides(p, c.x, c.y)) continue;
      const x0 = Math.min(minX, c.x);
      const x1 = Math.max(maxX, c.x + p.w);
      const y0 = Math.min(...placed.map((r) => r.y), c.y);
      const y1 = Math.max(...placed.map((r) => r.y + r.h), c.y + p.h);
      const area = (x1 - x0) * (y1 - y0);
      const aspectErr = Math.abs(Math.log((x1 - x0) / (y1 - y0)) - Math.log(targetAspect));
      const cost = area * (1 + 0.6 * aspectErr) * (1 + 0.08 * rng());
      if (!best || cost < best.cost) best = { ...c, cost };
    }
    placed.push({ ...p, x: best!.x, y: best!.y });
  }
  return new Map(placed.map((p) => [p.id, { x: p.x, y: p.y }]));
}

const snap16 = (v: number) => Math.round(v * 16) / 16;

/** Moves a relative arrangement into the region; returns null when it does not fit. */
function finalize(items: Sized[], rel: Rel, region: Region): Suggestion['positions'] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const p = rel.get(it.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + it.w);
    maxY = Math.max(maxY, p.y + it.h);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw > region.x1 - region.x0 + EPS || bh > region.y1 - region.y0 + EPS) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const ox = clamp(region.cx - (minX + bw / 2), region.x0 - minX, region.x1 - maxX);
  const oyWanted = region.anchor.kind === 'bottom' ? region.anchor.y - maxY : region.anchor.cy - (minY + bh / 2);
  const oy = clamp(oyWanted, region.y0 - minY, region.y1 - maxY);
  const out: Suggestion['positions'] = {};
  for (const it of items) {
    const p = rel.get(it.id)!;
    out[it.id] = { x: snap16(p.x + ox), y: snap16(p.y + oy) };
  }
  return out;
}

/** 0-100 quality estimate: even gaps, balance, sensible width, and tidy alignment. */
export function scoreLayout(rects: { id: string; rect: Rect }[], region: Region, gap: number): number {
  const n = rects.length;
  if (n === 0) return 0;
  const minX = Math.min(...rects.map((r) => r.rect.x));
  const maxX = Math.max(...rects.map((r) => r.rect.x + r.rect.w));
  const minY = Math.min(...rects.map((r) => r.rect.y));
  const maxY = Math.max(...rects.map((r) => r.rect.y + r.rect.h));
  const bw = maxX - minX;
  const bh = maxY - minY;

  const gaps = neighborGaps(rects);
  const gapScore = gaps.length
    ? 1 - gaps.reduce((s, g) => s + Math.min(Math.abs(g.value - gap) / (gap * 3 + 2), 1), 0) / gaps.length
    : 1;

  let area = 0;
  let gx = 0;
  let gy = 0;
  for (const { rect: r } of rects) {
    const a = r.w * r.h;
    area += a;
    gx += a * (r.x + r.w / 2);
    gy += a * (r.y + r.h / 2);
  }
  gx /= area;
  gy /= area;
  const balance =
    (1 - Math.min(Math.abs(gx - (minX + bw / 2)) / (0.25 * bw + 1), 1) + (1 - Math.min(Math.abs(gy - (minY + bh / 2)) / (0.25 * bh + 1), 1))) /
    2;

  const fill = 1 - Math.min(Math.abs(bw - region.idealW) / region.idealW, 1);

  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  let alignedPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = rects[i].rect;
      const b = rects[j].rect;
      const ax = [a.x, a.x + a.w / 2, a.x + a.w];
      const bx = [b.x, b.x + b.w / 2, b.x + b.w];
      const ay = [a.y, a.y + a.h / 2, a.y + a.h];
      const by = [b.y, b.y + b.h / 2, b.y + b.h];
      if (ax.some((v, k) => near(v, bx[k])) || ay.some((v, k) => near(v, by[k]))) alignedPairs++;
    }
  }
  const align = Math.min(alignedPairs / n, 1);

  return Math.round(100 * (0.35 * gapScore + 0.2 * balance + 0.25 * fill + 0.2 * align));
}

function hasOverlap(items: Sized[], pos: Suggestion['positions']) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const pa = pos[a.id];
      const pb = pos[b.id];
      if (overlapLen(pa.x, pa.x + a.w, pb.x, pb.x + b.w) > EPS && overlapLen(pa.y, pa.y + a.h, pb.y, pb.y + b.h) > EPS)
        return true;
    }
  }
  return false;
}

interface Variant {
  rel: Rel;
  label: string;
}

/**
 * Builds candidate arrangements from classic gallery-wall patterns, drops the ones that do not fit
 * the wall, scores the rest, and returns the best few (at most two per pattern).
 * `salt` changes the random variations so a "shuffle" yields fresh options.
 */
export function generateSuggestions(
  items: Sized[],
  wall: Wall,
  furniture: Furniture,
  gap: number,
  salt = 0,
  count = 6,
): Suggestion[] {
  const n = items.length;
  if (n === 0) return [];
  const region = makeRegion(wall, furniture);
  const regionH = Math.max(region.y1 - region.y0, 1);
  const targetAspect = Math.min(Math.max(region.idealW / regionH, 0.8), 2.5);

  const generators: Record<TemplateId, (list: Sized[], rng: () => number, s: number) => Variant | null> = {
    row: (list) => (n < 2 ? { rel: rowGen(list, gap), label: 'Single piece' } : { rel: rowGen(list, gap), label: 'Centered row' }),
    symmetric: (list) => (n < 3 ? null : { rel: rowGen(symmetricOrder(list), gap), label: 'Symmetric row' }),
    grid: (list, _rng, s) => {
      if (n < 4) return null;
      const options = Array.from({ length: n - 2 }, (_, i) => i + 2).map((cols) => {
        const rows = Math.ceil(n / cols);
        const rel = gridGen(list, cols, gap);
        let w = 0;
        let h = 0;
        for (const it of list) {
          const p = rel.get(it.id)!;
          w = Math.max(w, p.x + it.w);
          h = Math.max(h, p.y + it.h);
        }
        return { cols, rows, rel, err: Math.abs(Math.log(w / h) - Math.log(targetAspect)) };
      });
      options.sort((a, b) => a.err - b.err);
      const pick = options[s % Math.min(3, options.length)];
      return { rel: pick.rel, label: `Grid ${pick.cols}×${pick.rows}` };
    },
    rows: (list, _rng, s) => {
      if (n < 3) return null;
      const k = 2 + (s % Math.max(1, Math.min(3, n - 1)));
      if (k >= n) return null;
      return { rel: rowsGen(list, k, gap), label: `${k} centered rows` };
    },
    staircase: (list, _rng, s) => (n < 3 ? null : { rel: staircaseGen(list, gap, s % 2 === 0 ? 1 : -1), label: s % 2 === 0 ? 'Staircase up' : 'Staircase down' }),
    salon: (list, rng) => (n < 3 || n > 40 ? null : { rel: salonGen(list, gap, rng, targetAspect), label: 'Salon cluster' }),
  };

  const templates = Object.keys(generators) as TemplateId[];
  const seen = new Set<string>();
  const all: Suggestion[] = [];
  templates.forEach((template, ti) => {
    for (let s = 0; s < SEEDS_PER_TEMPLATE; s++) {
      const rng = mulberry32((salt * 7919 + s + 1) * 2654435761 + ti * 97);
      const list = s === 0 && salt === 0 ? items : shuffled(items, rng);
      const variant = generators[template](list, rng, s);
      if (!variant) continue;
      const positions = finalize(items, variant.rel, region);
      if (!positions || hasOverlap(items, positions)) continue;
      let minX = Infinity;
      let minY = Infinity;
      for (const it of items) {
        minX = Math.min(minX, positions[it.id].x);
        minY = Math.min(minY, positions[it.id].y);
      }
      const key = items.map((it) => `${(positions[it.id].x - minX).toFixed(2)},${(positions[it.id].y - minY).toFixed(2)}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const rects = items.map((it) => ({ id: it.id, rect: { x: positions[it.id].x, y: positions[it.id].y, w: it.w, h: it.h } }));
      all.push({ key: `${template}:${salt}:${s}`, template, label: variant.label, positions, score: scoreLayout(rects, region, gap) });
    }
  });

  all.sort((a, b) => b.score - a.score);
  const picked: Suggestion[] = [];
  const perTemplate = new Map<TemplateId, number>();
  for (const sug of all) {
    const used = perTemplate.get(sug.template) ?? 0;
    if (used >= 2 || picked.length >= count) continue;
    picked.push(sug);
    perTemplate.set(sug.template, used + 1);
  }
  return picked;
}
