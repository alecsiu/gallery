import { outerW } from './geometry';
import type { Furniture, Layout, Piece } from './types';

export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export function defaultFurniture(wall: { w: number; h: number }): Furniture {
  const w = Math.min(84, wall.w * 0.6);
  const h = 32;
  return { enabled: false, name: 'Sofa', w, h, x: (wall.w - w) / 2, y: wall.h - h };
}

export function createLayout(name = 'Untitled wall'): Layout {
  const wall = { w: 120, h: 96 };
  return { id: uid(), name, wall, furniture: defaultFurniture(wall), gap: 2, pieces: [], updatedAt: Date.now() };
}

export function createPiece(index: number, wall: { w: number; h: number }): Piece {
  const stagger = (index % 6) * 3;
  return {
    id: uid(),
    name: `Art ${index + 1}`,
    artW: 8,
    artH: 10,
    matX: 2,
    matY: 2,
    frame: 1,
    x: Math.max(0, wall.w / 2 - 7 + stagger),
    y: Math.max(0, wall.h / 2 - 9 + stagger),
  };
}

/** The first layout a visitor sees: a few differently sized pieces so the suggestions have something to work with. */
export function createSampleLayout(): Layout {
  const layout = createLayout('My gallery wall');
  const sizes: [string, number, number, number, number, number][] = [
    ['Landscape', 24, 16, 2.5, 2.5, 1.25],
    ['Portrait', 11, 14, 2, 2, 1],
    ['Small square', 8, 8, 1.5, 1.5, 0.75],
    ['Tall print', 12, 18, 2, 2, 1],
    ['Mini', 5, 7, 1, 1, 0.75],
  ];
  let x = 5;
  layout.pieces = sizes.map(([name, artW, artH, matX, matY, frame]) => {
    const piece: Piece = { id: uid(), name, artW, artH, matX, matY, frame, x, y: 20 };
    x += outerW(piece) + 4;
    return piece;
  });
  return layout;
}
