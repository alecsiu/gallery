/**
 * Finds a framed piece in a photo by its edges, using OpenCV. Unlike the colour-based detector in `detect.ts`, this
 * doesn't need a plain background: it looks for four straight sides that are each backed by an edge in the photo,
 * so uneven lighting, shadows, a floor line or other objects in shot don't throw it.
 *
 * OpenCV is passed in, so this file stays free of how the library is loaded (script tag in the browser, a plain
 * import in tests).
 */
import type cvModule from '@techstark/opencv-js';
import { convexHull, hullToQuad } from './detect';
import { isConvexQuad, orderQuad } from './warp';
import type { Pixels, Point, Quad } from './warp';

export type CV = typeof cvModule;

/** An infinite line through `p` along the unit direction `d`, with how much edge backs it. */
interface Line {
  p: Point;
  d: Point;
  weight: number;
}

interface EdgeMap {
  /** 1 where an edge runs within a couple of pixels. */
  near: Uint8Array;
  /** Share of the image that is "near an edge": what a random line would score. */
  density: number;
}

interface Candidate {
  quad: Point[];
  score: number;
  area: number;
}

const MAX_LINES = 12;
const DEG = Math.PI / 180;

function polygonArea(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function intersect(a: Line, b: Line): Point | null {
  const den = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den;
  return { x: a.p.x + t * a.d.x, y: a.p.y + t * a.d.y };
}

/** Groups Hough segments that lie on the same line and keeps the best-backed few. */
function mergeSegments(segments: { a: Point; b: Point }[], tolerance: number): Line[] {
  const sorted = segments
    .map((s) => ({ ...s, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) }))
    .filter((s) => s.len > 0)
    .sort((s, t) => t.len - s.len);
  const lines: Line[] = [];
  for (const s of sorted) {
    const d = { x: (s.b.x - s.a.x) / s.len, y: (s.b.y - s.a.y) / s.len };
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    const same = lines.find((l) => {
      const parallel = Math.abs(l.d.x * d.y - l.d.y * d.x) < Math.sin(4 * DEG);
      const off = Math.abs((mid.x - l.p.x) * l.d.y - (mid.y - l.p.y) * l.d.x);
      return parallel && off < tolerance;
    });
    // Segments arrive longest first, so the first one on a line sets its direction.
    if (same) same.weight += s.len;
    else lines.push({ p: s.a, d, weight: s.len });
  }
  return lines.sort((a, b) => b.weight - a.weight).slice(0, MAX_LINES);
}

/**
 * How well a four-sided outline is backed by edges: for each side, the share of it that runs along an edge,
 * corrected for how much of the photo is edge anyway. Returns 0 for shapes that can't be a piece.
 */
function scoreQuad(quad: readonly Point[], map: EdgeMap, w: number, h: number): number {
  const minSide = Math.min(w, h);
  const slack = 0.02 * minSide;
  for (const p of quad) {
    if (p.x < -slack || p.y < -slack || p.x > w - 1 + slack || p.y > h - 1 + slack) return 0;
  }
  if (!isConvexQuad(quad as Quad)) return 0;
  const area = polygonArea(quad);
  if (area < 0.04 * w * h || area > 0.92 * w * h) return 0;

  const lengths: number[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4];
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.12 * minSide) return 0;
    lengths.push(len);
    // Corners of a rectangle seen at an angle stay within reach of square.
    const cos = ((prev.x - a.x) * (b.x - a.x) + (prev.y - a.y) * (b.y - a.y)) / (Math.hypot(prev.x - a.x, prev.y - a.y) * len);
    if (Math.abs(cos) > Math.cos(55 * DEG)) return 0;
  }
  if (Math.min(lengths[0], lengths[2]) < 0.5 * Math.max(lengths[0], lengths[2])) return 0;
  if (Math.min(lengths[1], lengths[3]) < 0.5 * Math.max(lengths[1], lengths[3])) return 0;

  let total = 0;
  let worst = 1;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const steps = Math.max(8, Math.round(lengths[i] / 2));
    let hit = 0;
    let seen = 0;
    let gap = 0;
    let longestGap = 0;
    // Skip the very ends: corners are often rounded, mitred or hidden.
    for (let s = Math.ceil(0.06 * steps); s <= steps - Math.ceil(0.06 * steps); s++) {
      const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
      seen++;
      if (x >= 0 && y >= 0 && x < w && y < h && map.near[y * w + x]) {
        hit++;
        gap = 0;
      } else longestGap = Math.max(longestGap, ++gap);
    }
    // A long unbacked stretch means the side overshoots the piece (its edge carried on to a floor line, say),
    // which scattered misses along a faint edge don't.
    if (longestGap > 0.2 * seen) return 0;
    const support = Math.max(0, (hit / seen - map.density) / (1 - map.density)) - longestGap / seen;
    total += support;
    worst = Math.min(worst, support);
  }
  const mean = total / 4;
  // One side may be faint (a bottom edge in shadow, say), but not missing.
  if (mean < 0.7 || worst < 0.45) return 0;
  return mean * (0.6 + 0.4 * worst);
}

/** How far side `i` of `inner` sits inside side `i` of `outer` (corners in the same order), in pixels. */
function sideInset(inner: readonly Point[], outer: readonly Point[], i: number): number {
  const a = outer[i];
  const b = outer[(i + 1) % 4];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // For corners running clockwise on screen, the inside is to the right of each side.
  const off = (p: Point) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
  return (off(inner[i]) + off(inner[(i + 1) % 4])) / 2;
}

/**
 * Whether the strip between side `i` of `inner` and of `outer` is a shadow on the wall: darker than the wall just
 * beyond it, but the same colour. `lab` is the photo as 8-bit L, a, b triples.
 */
function isShadowStrip(inner: readonly Point[], outer: readonly Point[], i: number, lab: Uint8Array, w: number, h: number): boolean {
  const j = (i + 1) % 4;
  const o1 = outer[i];
  const o2 = outer[j];
  const len = Math.hypot(o2.x - o1.x, o2.y - o1.y) || 1;
  // Unit normal pointing out of the shape.
  const nx = (o2.y - o1.y) / len;
  const ny = -(o2.x - o1.x) / len;
  const strip = [0, 0, 0];
  const wall = [0, 0, 0];
  let count = 0;
  for (let s = 3; s <= 17; s++) {
    const t = s / 20;
    const ox = o1.x + (o2.x - o1.x) * t;
    const oy = o1.y + (o2.y - o1.y) * t;
    const ix = inner[i].x + (inner[j].x - inner[i].x) * t;
    const iy = inner[i].y + (inner[j].y - inner[i].y) * t;
    const sx = Math.round((ox + ix) / 2);
    const sy = Math.round((oy + iy) / 2);
    const wx = Math.round(ox + 5 * nx);
    const wy = Math.round(oy + 5 * ny);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || wx < 0 || wy < 0 || wx >= w || wy >= h) continue;
    for (let c = 0; c < 3; c++) {
      strip[c] += lab[(sy * w + sx) * 3 + c];
      wall[c] += lab[(wy * w + wx) * 3 + c];
    }
    count++;
  }
  if (count < 8) return false;
  const darker = (wall[0] - strip[0]) / count;
  const tint = Math.max(Math.abs(wall[1] - strip[1]), Math.abs(wall[2] - strip[2])) / count;
  return darker > 4 && tint < 6;
}

/**
 * Returns the piece's corners as fractions of the image (top-left, top-right, bottom-right, bottom-left), or null
 * when no outline is backed well enough by edges to trust.
 */
export function detectQuadCv(cv: CV, img: Pixels): Quad | null {
  const { width: w, height: h } = img;
  if (w < 32 || h < 32) return null;
  const minSide = Math.min(w, h);
  const mats: { delete: () => void }[] = [];
  const keep = <T extends { delete: () => void }>(m: T): T => {
    mats.push(m);
    return m;
  };

  try {
    const src = keep(cv.matFromImageData(img as unknown as ImageData));
    const rgb = keep(new cv.Mat());
    const lab = keep(new cv.Mat());
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const canny = (input: InstanceType<CV['Mat']>, lo: number, hi: number) => {
      const out = keep(new cv.Mat());
      cv.Canny(input, out, lo, hi);
      return out;
    };

    // Two views of the photo's edges. The first also looks at colour, for a frame as bright as the wall behind it;
    // the second is more sensitive, for faint edges, after smoothing away texture.
    const smooth = keep(new cv.Mat());
    cv.GaussianBlur(lab, smooth, new cv.Size(5, 5), 0);
    const labPixels = new Uint8Array(smooth.data);
    const channels = keep(new cv.MatVector());
    cv.split(smooth, channels);
    const [light, greenRed, blueYellow] = [0, 1, 2].map((c) => keep(channels.get(c)));
    const strict = canny(light, 50, 150);
    for (const colour of [greenRed, blueYellow]) cv.bitwise_or(strict, canny(colour, 40, 120), strict);

    const soft = keep(new cv.Mat());
    cv.medianBlur(gray, soft, 7);
    const sensitive = canny(soft, 20, 60);

    const kernel = keep(cv.Mat.ones(5, 5, cv.CV_8U));
    const candidates: Candidate[] = [];

    for (const edges of [strict, sensitive]) {
      const dilated = keep(new cv.Mat());
      cv.dilate(edges, dilated, kernel);
      const near = new Uint8Array(w * h);
      const data = dilated.data;
      let on = 0;
      for (let i = 0; i < near.length; i++) {
        if (data[i]) {
          near[i] = 1;
          on++;
        }
      }
      const map: EdgeMap = { near, density: on / near.length };
      if (map.density > 0.6) continue; // edges everywhere: nothing to tell apart

      const consider = (points: readonly Point[]) => {
        const quad = orderQuad(points);
        const score = scoreQuad(quad, map, w, h);
        if (score > 0) candidates.push({ quad, score, area: polygonArea(quad) });
      };

      // 1. Closed outlines: an edge loop whose hull is four-sided.
      const contours = keep(new cv.MatVector());
      const hierarchy = keep(new cv.Mat());
      cv.findContours(keep(dilated.clone()), contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const xy = contour.data32S;
        if (xy.length >= 8) {
          const points: Point[] = [];
          for (let k = 0; k < xy.length; k += 2) points.push({ x: xy[k], y: xy[k + 1] });
          const hull = convexHull(points);
          const hullArea = polygonArea(hull);
          if (hull.length >= 4 && hullArea >= 0.04 * w * h) {
            const quad = hullToQuad(hull);
            if (quad && polygonArea(quad) <= 1.2 * hullArea) consider(quad);
          }
        }
        contour.delete();
      }

      // 2. Straight lines: every pairing of two across with two up-and-down. This still works when the outline is
      //    broken, or runs into a shadow or another object.
      const found = keep(new cv.Mat());
      cv.HoughLinesP(edges, found, 1, DEG, 30, 0.1 * minSide, 0.02 * minSide + 2);
      const across: { a: Point; b: Point }[] = [];
      const upright: { a: Point; b: Point }[] = [];
      const seg = found.data32S;
      for (let i = 0; i + 3 < seg.length; i += 4) {
        const a = { x: seg[i], y: seg[i + 1] };
        const b = { x: seg[i + 2], y: seg[i + 3] };
        const tilt = Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) / DEG;
        if (tilt < 35) across.push({ a, b });
        else if (tilt > 55) upright.push({ a, b });
      }
      const rows = mergeSegments(across, 0.008 * minSide + 2);
      const cols = mergeSegments(upright, 0.008 * minSide + 2);
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          for (let k = 0; k < cols.length; k++) {
            for (let l = k + 1; l < cols.length; l++) {
              const corners = [intersect(rows[i], cols[k]), intersect(rows[i], cols[l]), intersect(rows[j], cols[l]), intersect(rows[j], cols[k])];
              if (corners.every((c): c is Point => c !== null)) consider(corners);
            }
          }
        }
      }
    }

    if (!candidates.length) return null;
    // A framed piece is rectangles within rectangles (frame, mat, art). Of the outlines that are about as well
    // backed as the best one, the piece is the outermost.
    const best = Math.max(...candidates.map((c) => c.score));
    const strong = candidates.filter((c) => c.score >= 0.85 * best).sort((a, b) => b.area - a.area);
    let pick = strong[0];

    // A hard shadow beside the piece has a crisp edge too, and makes a slightly bigger outline that matches the
    // real one except along the shadow. What gives the real one away is its moulding: a second outline just
    // inside it, the same distance in on every side. Step in to an outline that has one when ours doesn't and
    // the difference between the two is only shadow.
    const same = 0.015 * minSide + 1;
    const thin = 0.1 * minSide;
    const insetsOf = (inner: Candidate, outer: Candidate) => [0, 1, 2, 3].map((i) => sideInset(inner.quad, outer.quad, i));
    const hasMoulding = (outer: Candidate) =>
      strong.some((inner) => {
        const d = insetsOf(inner, outer);
        const least = Math.min(...d);
        const most = Math.max(...d);
        // "The same" within what a few pixels of moulding can be measured to, or a tilt can skew it.
        return least > 2 && most < thin && most - least <= Math.max(4, 0.5 * least);
      });
    if (!hasMoulding(pick)) {
      const outer = pick;
      const real = strong.find((inner) => {
        if (inner.area >= outer.area) return false;
        const d = insetsOf(inner, outer);
        if (d.some((v) => v < -same || v > thin)) return false;
        const moved = [0, 1, 2, 3].filter((i) => d[i] > same);
        // A shadow falls along one side, or two that meet.
        if (!moved.length || moved.length > 2 || (moved.length === 2 && (moved[1] - moved[0]) % 2 === 0)) return false;
        return moved.every((i) => isShadowStrip(inner.quad, outer.quad, i, labPixels, w, h)) && hasMoulding(inner);
      });
      if (real) pick = real;
    }
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const norm = orderQuad(pick.quad.map((p) => ({ x: clamp01((p.x + 0.5) / w), y: clamp01((p.y + 0.5) / h) })));
    return isConvexQuad(norm) ? norm : null;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        // already freed
      }
    }
  }
}
