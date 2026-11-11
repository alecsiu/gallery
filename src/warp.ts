/** Straightens a photographed rectangle: the maths behind "add a piece from a photo". No DOM, so it is unit-testable. */

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Puts four corners in top-left, top-right, bottom-right, bottom-left order, however they were dragged. */
export function orderQuad(points: readonly Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  // Clockwise on screen (y grows downward).
  const ring = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (ring[i].x + ring[i].y < ring[start].x + ring[start].y) start = i;
  return [ring[start], ring[(start + 1) % 4], ring[(start + 2) % 4], ring[(start + 3) % 4]];
}

/** True when the (ordered) corners form a proper convex outline with some area. */
export function isConvexQuad(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    if (cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]) <= 1e-9) return false;
  }
  return true;
}

/**
 * Approximate width and height of the outlined rectangle, in the quad's own units: the mean of opposite sides.
 * Accurate for a roughly straight-on photo; a steep angle foreshortens one side.
 */
export function quadSize(q: Quad): { w: number; h: number } {
  return { w: (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h: (dist(q[0], q[3]) + dist(q[1], q[2])) / 2 };
}

/** Maps the unit square onto the quad: (0,0)→q0, (1,0)→q1, (1,1)→q2, (0,1)→q3. */
export function unitSquareToQuad(q: Quad): (u: number, v: number) => Point {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };
}

/** Resamples the area inside `quad` (in source pixels) into an upright outW × outH image, removing perspective. */
export function warpQuad(src: Pixels, quad: Quad, outW: number, outH: number): Pixels {
  const map = unitSquareToQuad(quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width, height } = src;
  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const p = map((i + 0.5) / outW, (j + 0.5) / outH);
      // Bilinear sample, clamped at the photo's edges.
      const fx = Math.min(Math.max(p.x - 0.5, 0), width - 1);
      const fy = Math.min(Math.max(p.y - 0.5, 0), height - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const o = (j * outW + i) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[(y0 * width + x0) * 4 + c] * (1 - tx) + data[(y0 * width + x1) * 4 + c] * tx;
        const bottom = data[(y1 * width + x0) * 4 + c] * (1 - tx) + data[(y1 * width + x1) * 4 + c] * tx;
        out[o + c] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  return { data: out, width: outW, height: outH };
}
