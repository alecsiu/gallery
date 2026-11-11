/// <reference types="node" />
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectQuad } from '../detect';
import { detectQuadCv } from '../detectCv';
import type { CV } from '../detectCv';
import type { Pixels, Point } from '../warp';

type Rgb = [number, number, number];

/** Small deterministic noise source, so the scenes are the same on every run. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function inside(quad: readonly Point[], x: number, y: number): boolean {
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

/** Shrinks a quad towards its centre: the mat inside the frame, the art inside the mat. */
function inset(quad: readonly Point[], by: number): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  return quad.map((p) => ({ x: cx + (p.x - cx) * (1 - by), y: cy + (p.y - cy) * (1 - by) }));
}

interface Scene {
  w: number;
  h: number;
  /** Background colour at a pixel. */
  wall: (x: number, y: number) => Rgb;
  /** Shapes painted in order, clockwise corners. */
  shapes: { quad: Point[]; colour: Rgb }[];
  noise: number;
}

function render(scene: Scene): Pixels {
  const { w, h } = scene;
  const data = new Uint8ClampedArray(w * h * 4);
  const rand = rng(7);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = scene.wall(x, y);
      for (const s of scene.shapes) if (inside(s.quad, x + 0.5, y + 0.5)) c = s.colour;
      const n = (rand() - 0.5) * 2 * scene.noise;
      const i = (y * w + x) * 4;
      data[i] = c[0] + n;
      data[i + 1] = c[1] + n;
      data[i + 2] = c[2] + n;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** A frame, its mat and the art, as nested shapes. */
function framed(quad: Point[], frame: Rgb, mat: Rgb = [244, 241, 232], art: Rgb = [70, 110, 150]) {
  return [
    { quad, colour: frame },
    { quad: inset(quad, 0.12), colour: mat },
    { quad: inset(quad, 0.4), colour: art },
  ];
}

function expectClose(found: readonly Point[] | null, quad: readonly Point[], w: number, h: number, tolerance = 0.025) {
  expect(found).not.toBeNull();
  quad.forEach((p, i) => {
    expect(Math.abs(found![i].x - p.x / w)).toBeLessThan(tolerance);
    expect(Math.abs(found![i].y - p.y / h)).toBeLessThan(tolerance);
  });
}

const W = 480;
const H = 360;
const straight: Point[] = [
  { x: 150, y: 70 },
  { x: 340, y: 70 },
  { x: 340, y: 270 },
  { x: 150, y: 270 },
];
const angled: Point[] = [
  { x: 140, y: 80 },
  { x: 330, y: 60 },
  { x: 345, y: 285 },
  { x: 150, y: 255 },
];
/** A wall lit from one side, with a darker floor and a skirting board across the bottom. */
const room = (x: number, y: number): Rgb => {
  if (y > 325) return [96, 78, 60];
  if (y > 310) return [236, 234, 228];
  const v = 215 - 90 * (x / W) - 25 * (y / H);
  return [v, v - 4, v - 12];
};

describe('detectQuadCv', () => {
  let cv: CV;
  beforeAll(async () => {
    // Loaded with require: the package's export is a promise, which an ES import would try to unwrap.
    cv = (await createRequire(import.meta.url)('@techstark/opencv-js')) as CV;
  });

  it('finds the frame, not the mat or art inside it, on a plain wall', () => {
    const img = render({ w: W, h: H, wall: () => [226, 222, 214], shapes: framed(straight, [40, 36, 32]), noise: 4 });
    expectClose(detectQuadCv(cv, img), straight, W, H);
  });

  it('finds a piece on an unevenly lit wall with a floor in shot, where the colour detector gives up', () => {
    const img = render({ w: W, h: H, wall: room, shapes: framed(angled, [52, 40, 30]), noise: 6 });
    expect(detectQuad(img)).toBeNull();
    expectClose(detectQuadCv(cv, img), angled, W, H);
  });

  it('is not thrown by a soft shadow beside the piece or another object in shot', () => {
    const shadow = angled.map((p) => ({ x: p.x + 9, y: p.y + 9 }));
    const lamp: Point[] = [
      { x: 30, y: 180 },
      { x: 75, y: 180 },
      { x: 75, y: 310 },
      { x: 30, y: 310 },
    ];
    const img = render({
      w: W,
      h: H,
      wall: (x, y) => {
        const c = room(x, y);
        return inside(shadow, x, y) && y <= 310 ? [c[0] - 22, c[1] - 22, c[2] - 22] : c;
      },
      shapes: [{ quad: lamp, colour: [150, 60, 40] }, ...framed(angled, [52, 40, 30])],
      noise: 6,
    });
    expectClose(detectQuadCv(cv, img), angled, W, H, 0.035);
  });

  it('leaves out a hard shadow cast below the piece', () => {
    const wall = (x: number, y: number): Rgb => (x >= 152 && x <= 342 && y >= 270 && y < 294 ? [168, 164, 156] : [226, 222, 214]);
    const img = render({ w: W, h: H, wall, shapes: framed(straight, [112, 88, 52]), noise: 4 });
    expectClose(detectQuadCv(cv, img), straight, W, H);
  });

  it('finds a pale frame on a pale wall', () => {
    const img = render({ w: W, h: H, wall: room, shapes: framed(straight, [250, 248, 240], [250, 248, 240], [60, 90, 70]), noise: 4 });
    const found = detectQuadCv(cv, img);
    expect(found).not.toBeNull();
  });

  it('returns null for a bare wall', () => {
    const img = render({ w: W, h: H, wall: room, shapes: [], noise: 6 });
    expect(detectQuadCv(cv, img)).toBeNull();
  });
});
