/**
 * Finds a framed piece in a photo, assuming it hangs on (or leans against) a fairly plain background that fills the
 * photo's edges. No dependencies and no DOM: runs on a small copy of the photo in a few milliseconds.
 */
import { isConvexQuad, orderQuad } from './warp';
import type { Pixels, Point, Quad } from './warp';

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function polygonArea(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/** Otsu's method: the threshold that best splits a 0–255 histogram into two groups. */
function otsu(hist: Uint32Array, total: number): { threshold: number; low: number; high: number } {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let best = { threshold: 0, low: 0, high: 0 };
  let bestVar = -1;
  let count = 0;
  let sum = 0;
  for (let t = 0; t < 255; t++) {
    count += hist[t];
    sum += t * hist[t];
    if (!count || count === total) continue;
    const low = sum / count;
    const high = (sumAll - sum) / (total - count);
    const between = count * (total - count) * (high - low) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = { threshold: t, low, high };
    }
  }
  return best;
}

/** Convex hull (Andrew's monotone chain), collinear points dropped. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const build = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build(pts.reverse())];
}

function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / den;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

/**
 * Reduces a convex polygon to the four-sided shape that hugs it: repeatedly drops the edge whose removal (extending
 * its two neighbours until they meet) adds the least area. The long sides survive, so rounded or ragged corners
 * come out as clean intersections.
 */
export function hullToQuad(hull: readonly Point[]): Point[] | null {
  const poly = [...hull];
  while (poly.length > 4) {
    const n = poly.length;
    let bestI = -1;
    let bestCost = Infinity;
    let bestX: Point | null = null;
    for (let i = 0; i < n; i++) {
      const prev = poly[(i + n - 1) % n];
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const next = poly[(i + 2) % n];
      const x = lineIntersection(prev, a, next, b);
      if (!x) continue;
      // The neighbours must meet beyond this edge, not behind it.
      if ((x.x - a.x) * (a.x - prev.x) + (x.y - a.y) * (a.y - prev.y) <= 0) continue;
      if ((x.x - b.x) * (b.x - next.x) + (x.y - b.y) * (b.y - next.y) <= 0) continue;
      const cost = Math.abs(cross(a, x, b)) / 2;
      if (cost < bestCost) {
        bestCost = cost;
        bestI = i;
        bestX = x;
      }
    }
    if (bestI < 0 || !bestX) return null;
    poly[bestI] = bestX;
    poly.splice((bestI + 1) % n, 1);
  }
  return poly.length === 4 ? poly : null;
}

/**
 * Returns the piece's corners as fractions of the image (top-left, top-right, bottom-right, bottom-left), or null
 * when nothing stands out clearly enough to trust.
 */
export function detectQuad(img: Pixels): Quad | null {
  const { data, width: w, height: h } = img;
  if (w < 16 || h < 16) return null;
  const n = w * h;

  // 1. The background is whatever colour the photo's border is.
  const band = Math.max(2, Math.round(0.04 * Math.min(w, h)));
  const isBorder = (x: number, y: number) => x < band || y < band || x >= w - band || y >= h - band;
  const br: number[] = [];
  const bg: number[] = [];
  const bb: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBorder(x, y)) continue;
      const i = (y * w + x) * 4;
      br.push(data[i]);
      bg.push(data[i + 1]);
      bb.push(data[i + 2]);
    }
  }
  const mr = median(br);
  const mg = median(bg);
  const mb = median(bb);

  // 2. How unlike the background each pixel is, split into "wall" and "not wall".
  const dist = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const d = Math.min(255, Math.round((Math.abs(data[i] - mr) + Math.abs(data[i + 1] - mg) + Math.abs(data[i + 2] - mb)) / 2));
    dist[p] = d;
    hist[d]++;
  }
  const split = otsu(hist, n);
  if (split.high - split.low < 24) return null; // nothing stands out
  const fg = (p: number) => dist[p] > split.threshold;

  let borderFg = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isBorder(x, y) && fg(y * w + x)) borderFg++;
  if (borderFg > 0.25 * br.length) return null; // the border isn't a plain background

  // 3. Largest connected blob of "not wall".
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let bestLabel = 0;
  let bestCount = 0;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] || !fg(start)) continue;
    next++;
    let top = 0;
    let count = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const p = stack[--top];
      count++;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q] || !fg(q)) continue;
          label[q] = next;
          stack[top++] = q;
        }
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestLabel = next;
    }
  }
  if (!bestLabel) return null;

  // 4. Its outline: only each row's extremes can be on the hull. A frame with a wall-coloured mat is a ring, and
  //    its hull is still the frame's outer edge.
  const extremes: Point[] = [];
  for (let y = 0; y < h; y++) {
    let min = -1;
    let max = -1;
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestLabel) continue;
      if (min < 0) min = x;
      max = x;
    }
    if (min < 0) continue;
    extremes.push({ x: min, y }, { x: min, y: y + 1 }, { x: max + 1, y }, { x: max + 1, y: y + 1 });
  }
  const hull = convexHull(extremes);
  if (hull.length < 4) return null;
  const hullArea = polygonArea(hull);
  if (hullArea < 0.03 * n || hullArea > 0.9 * n) return null;

  // 5. Four sides, and a check that the blob really was four-sided.
  const quad = hullToQuad(hull);
  if (!quad) return null;
  if (polygonArea(quad) > 1.15 * hullArea) return null;
  const slack = 0.03;
  const norm = quad.map((p) => ({ x: p.x / w, y: p.y / h }));
  if (norm.some((p) => p.x < -slack || p.y < -slack || p.x > 1 + slack || p.y > 1 + slack)) return null;
  const ordered = orderQuad(norm.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })));
  return isConvexQuad(ordered) ? ordered : null;
}
