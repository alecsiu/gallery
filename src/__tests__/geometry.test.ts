import { describe, expect, it } from 'vitest';
import { invalidPieceIds, neighborGaps, outerH, outerW, innerW, snapRect, wallGaps } from '../geometry';
import type { Piece } from '../types';

const piece = (id: string, x: number, y: number, artW = 8, artH = 10): Piece => ({
  id, name: id, artW, artH, matX: 2, matY: 1, frame: 1, x, y,
});

describe('frame dimensions', () => {
  it('derives inner and outer sizes from art, mat and moulding', () => {
    const p = piece('a', 0, 0);
    expect(innerW(p)).toBe(12);
    expect(outerW(p)).toBe(14);
    expect(outerH(p)).toBe(10 + 2 + 2);
  });
});

describe('neighborGaps', () => {
  it('measures the nearest neighbor to the right and below', () => {
    const rect = (id: string, x: number, y: number, w: number, h: number) => ({ id, rect: { x, y, w, h } });
    const lines = neighborGaps([rect('a', 0, 0, 10, 10), rect('b', 14, 0, 10, 10), rect('c', 0, 13, 10, 10), rect('far', 40, 0, 5, 5)]);
    const byId = Object.fromEntries(lines.map((l) => [l.id, l.value]));
    expect(byId['a>b:h']).toBe(4);
    expect(byId['a>c:v']).toBe(3);
    expect(byId['b>far:h']).toBe(16);
    expect(lines.some((l) => l.id.startsWith('c>') && l.axis === 'h')).toBe(false);
  });
  it('reports overlaps as negative gaps', () => {
    const lines = neighborGaps([{ id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 } }, { id: 'b', rect: { x: 8, y: 0, w: 10, h: 10 } }]);
    expect(lines[0].value).toBe(-2);
  });
  it('measures distances to the wall edges', () => {
    const lines = wallGaps('a', { x: 10, y: 20, w: 30, h: 40 }, { w: 100, h: 90 });
    expect(lines.map((l) => l.value)).toEqual([10, 60, 20, 30]);
  });
});

describe('invalidPieceIds', () => {
  it('flags overlaps and out-of-wall pieces but not touching ones', () => {
    const wall = { w: 100, h: 100 };
    const bad = invalidPieceIds([piece('a', 0, 0), piece('b', 14, 0), piece('c', 10, 5), piece('d', 95, 0)], wall);
    expect([...bad].sort()).toEqual(['a', 'c', 'd', 'b'].sort());
    expect(invalidPieceIds([piece('a', 0, 0), piece('b', 14, 0)], wall).size).toBe(0);
  });
});

describe('snapRect', () => {
  const wall = { w: 200, h: 100 };
  it('snaps to a preferred gap beside a neighbor', () => {
    const other = { x: 0, y: 0, w: 20, h: 20 };
    const r = snapRect({ x: 22.5, y: 1, w: 10, h: 10 }, [other], [], wall, 2, 1);
    expect(r.x).toBe(22);
  });
  it('snaps edges and reports a guide', () => {
    const other = { x: 50, y: 10, w: 20, h: 20 };
    const r = snapRect({ x: 80, y: 10.4, w: 10, h: 10 }, [other], [], wall, 2, 1);
    expect(r.y).toBe(10);
    expect(r.guides.some((g) => g.axis === 'y' && g.pos === 10)).toBe(true);
  });
  it('snaps to the wall center', () => {
    const r = snapRect({ x: 94.5, y: 40, w: 10, h: 10 }, [], [], wall, 2, 1);
    expect(r.x).toBe(95);
  });
  it('does not snap outside the threshold', () => {
    const r = snapRect({ x: 60, y: 40, w: 10, h: 10 }, [], [], wall, 2, 1);
    expect(r).toMatchObject({ x: 60, y: 40 });
  });
});
