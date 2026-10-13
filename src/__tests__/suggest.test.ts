import { describe, expect, it } from 'vitest';
import { invalidPieceIds } from '../geometry';
import { defaultFurniture } from '../model';
import { generateSuggestions, makeRegion } from '../suggest';
import type { Piece } from '../types';

const sizes = [
  { id: 'a', w: 31.5, h: 23 },
  { id: 'b', w: 17, h: 20 },
  { id: 'c', w: 12.5, h: 12.5 },
  { id: 'd', w: 18, h: 24 },
  { id: 'e', w: 8.5, h: 10.5 },
];
const wall = { w: 120, h: 96 };

function asPieces(positions: Record<string, { x: number; y: number }>): Piece[] {
  return sizes.map((s) => ({
    id: s.id, name: s.id, artW: s.w, artH: s.h, matX: 0, matY: 0, frame: 0, ...positions[s.id],
  }));
}

describe('generateSuggestions', () => {
  const furniture = defaultFurniture(wall);

  it('returns scored, non-overlapping layouts inside the wall', () => {
    const out = generateSuggestions(sizes, wall, furniture, 2);
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(6);
    for (const s of out) {
      expect(invalidPieceIds(asPieces(s.positions), wall).size).toBe(0);
      expect(s.score).toBeGreaterThan(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
    const scores = out.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('is deterministic and varies with the shuffle salt', () => {
    const a = generateSuggestions(sizes, wall, furniture, 2, 0);
    expect(generateSuggestions(sizes, wall, furniture, 2, 0)).toEqual(a);
    const b = generateSuggestions(sizes, wall, furniture, 2, 1);
    expect(b.map((s) => s.positions)).not.toEqual(a.map((s) => s.positions));
  });

  it('keeps art above the furniture and centered over it', () => {
    const f = { ...furniture, enabled: true, x: 30, y: 64, w: 60, h: 32 };
    const region = makeRegion(wall, f);
    for (const s of generateSuggestions(sizes, wall, f, 2)) {
      const ps = asPieces(s.positions);
      expect(Math.max(...ps.map((p) => p.y + p.artH))).toBeLessThanOrEqual(region.y1 + 1e-6);
    }
  });

  it('returns nothing when the pieces cannot fit', () => {
    expect(generateSuggestions(sizes, { w: 40, h: 40 }, furniture, 2)).toEqual([]);
    expect(generateSuggestions([], wall, furniture, 2)).toEqual([]);
  });

  it('handles a single piece', () => {
    const out = generateSuggestions([sizes[0]], wall, furniture, 2);
    expect(out).toHaveLength(1);
  });
});
