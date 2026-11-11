import { describe, expect, it } from 'vitest';
import { detectQuad, hullToQuad } from '../detect';
import type { Pixels, Point } from '../warp';

const W = 200;
const H = 150;

const inside = (poly: Point[], x: number, y: number) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c !== 0) {
      if (sign && Math.sign(c) !== sign) return false;
      sign = Math.sign(c);
    }
  }
  return true;
};

/** A wall with uneven lighting and a little noise; `paint` colours anything that isn't wall. */
function scene(paint: (x: number, y: number) => [number, number, number] | null): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 9) - 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const shade = 205 + Math.round((x / W) * 22) + noise();
      const c = paint(x + 0.5, y + 0.5) ?? [shade, shade - 4, shade - 12];
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}

const frame: Point[] = [
  { x: 55, y: 22 },
  { x: 152, y: 32 },
  { x: 147, y: 125 },
  { x: 47, y: 112 },
];

function expectClose(found: Point[] | null, expected: Point[], tolerancePx = 2.5) {
  expect(found).not.toBeNull();
  found!.forEach((p, i) => {
    expect(Math.abs(p.x * W - expected[i].x)).toBeLessThan(tolerancePx);
    expect(Math.abs(p.y * H - expected[i].y)).toBeLessThan(tolerancePx);
  });
}

describe('detectQuad', () => {
  it('finds a tilted dark frame on an unevenly lit wall', () => {
    expectClose(detectQuad(scene((x, y) => (inside(frame, x, y) ? [50, 38, 30] : null))), frame);
  });
  it('uses the outer edge of a frame whose mat matches the wall', () => {
    const mat = frame.map((p) => ({ x: 100 + (p.x - 100) * 0.8, y: 72 + (p.y - 72) * 0.8 }));
    const art = frame.map((p) => ({ x: 100 + (p.x - 100) * 0.4, y: 72 + (p.y - 72) * 0.4 }));
    const img = scene((x, y) => {
      if (inside(art, x, y)) return [40, 110, 150];
      if (inside(mat, x, y)) return [214, 210, 202];
      return inside(frame, x, y) ? [50, 38, 30] : null;
    });
    expectClose(detectQuad(img), frame);
  });
  it('gives up on a blank wall, a round object, or a subject that fills the photo', () => {
    expect(detectQuad(scene(() => null))).toBeNull();
    expect(detectQuad(scene((x, y) => (Math.hypot(x - 100, y - 75) < 45 ? [50, 38, 30] : null)))).toBeNull();
    expect(detectQuad(scene((x) => (x > 20 ? [50, 38, 30] : null)))).toBeNull();
  });
});

describe('hullToQuad', () => {
  it('restores the corners of a rectangle with clipped corners', () => {
    const clipped = [
      { x: 2, y: 0 }, { x: 38, y: 0 }, { x: 40, y: 2 }, { x: 40, y: 28 },
      { x: 38, y: 30 }, { x: 2, y: 30 }, { x: 0, y: 28 }, { x: 0, y: 2 },
    ];
    const quad = hullToQuad(clipped)!;
    const key = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
    expect(quad.map(key).sort()).toEqual(['0,0', '0,30', '40,0', '40,30']);
  });
});
