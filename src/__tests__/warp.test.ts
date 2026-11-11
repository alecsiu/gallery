import { describe, expect, it } from 'vitest';
import { isConvexQuad, orderQuad, quadSize, unitSquareToQuad, warpQuad } from '../warp';
import type { Pixels, Quad } from '../warp';

const tilted: Quad = [
  { x: 20, y: 10 },
  { x: 90, y: 25 },
  { x: 80, y: 85 },
  { x: 10, y: 70 },
];

describe('orderQuad', () => {
  it('sorts corners into TL, TR, BR, BL whatever order they arrive in', () => {
    expect(orderQuad([tilted[2], tilted[0], tilted[3], tilted[1]])).toEqual(tilted);
  });
});

describe('isConvexQuad', () => {
  it('accepts a normal outline and rejects a dented or collapsed one', () => {
    expect(isConvexQuad(tilted)).toBe(true);
    expect(isConvexQuad([tilted[0], tilted[1], { x: 40, y: 30 }, tilted[3]])).toBe(false);
    expect(isConvexQuad([tilted[0], tilted[0], tilted[0], tilted[0]])).toBe(false);
  });
});

describe('quadSize', () => {
  it('measures an upright rectangle exactly', () => {
    expect(quadSize([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }])).toEqual({ w: 30, h: 20 });
  });
});

describe('unitSquareToQuad', () => {
  it('sends the square corners to the quad corners, with perspective', () => {
    const map = unitSquareToQuad(tilted);
    const corners = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)];
    corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(tilted[i].x);
      expect(c.y).toBeCloseTo(tilted[i].y);
    });
  });
});

describe('warpQuad', () => {
  /** A 40×40 image: red left half, blue right half. */
  const src: Pixels = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4) };
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) src.data.set(x < 20 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 40 + x) * 4);
  }
  const px = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

  it('crops an upright region', () => {
    const out = warpQuad(src, [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], 10, 10);
    expect(px(out, 1, 5)).toEqual([255, 0, 0, 255]);
    expect(px(out, 8, 5)).toEqual([0, 0, 255, 255]);
  });
  it('follows the corner order, so a quarter-turned outline rotates the result', () => {
    // "Top-left" is the photo's top-right: the output's top edge runs down the photo's blue side.
    const out = warpQuad(src, [{ x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }], 8, 8);
    expect(px(out, 4, 0)).toEqual([0, 0, 255, 255]);
    expect(px(out, 4, 7)).toEqual([255, 0, 0, 255]);
  });
});
