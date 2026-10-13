import { defaultFurniture, uid } from './model';
import type { Furniture, Layout, Piece, Unit } from './types';

const LAYOUTS_KEY = 'gallery-wall.layouts.v1';
const PREFS_KEY = 'gallery-wall.prefs.v1';
export const FILE_APP = 'gallery-wall-planner';
export const FILE_VERSION = 1;

const MAX_LENGTH = 2000; // inches
const MAX_PIECES = 200;
const MAX_IMAGE_CHARS = 1_500_000;

export class FormatError extends Error {}

function num(v: unknown, field: string, min = 0, max = MAX_LENGTH): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormatError(`"${field}" must be a number`);
  if (v < min || v > max) throw new FormatError(`"${field}" is out of range`);
  return v;
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.slice(0, 120) : fallback);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizePiece(raw: unknown, i: number, seen: Set<string>): Piece {
  if (!isObject(raw)) throw new FormatError(`Piece ${i + 1} is not an object`);
  const id = typeof raw.id === 'string' && raw.id && !seen.has(raw.id) ? raw.id : uid();
  seen.add(id);
  const f = (k: string) => num(raw[k], `pieces[${i}].${k}`);
  const piece: Piece = {
    id,
    name: str(raw.name, `Art ${i + 1}`),
    artW: Math.max(f('artW'), 0.01),
    artH: Math.max(f('artH'), 0.01),
    matX: f('matX'),
    matY: f('matY'),
    frame: f('frame'),
    x: num(raw.x, `pieces[${i}].x`, -MAX_LENGTH),
    y: num(raw.y, `pieces[${i}].y`, -MAX_LENGTH),
  };
  if (typeof raw.image === 'string' && raw.image.startsWith('data:image/') && raw.image.length <= MAX_IMAGE_CHARS) {
    piece.image = raw.image;
  }
  return piece;
}

/** Validates untrusted data (a file or local storage) and returns a well-formed layout. Throws FormatError otherwise. */
export function sanitizeLayout(raw: unknown): Layout {
  if (!isObject(raw)) throw new FormatError('Layout must be an object');
  if (!isObject(raw.wall)) throw new FormatError('Missing "wall"');
  const wall = { w: Math.max(num(raw.wall.w, 'wall.w'), 1), h: Math.max(num(raw.wall.h, 'wall.h'), 1) };
  if (!Array.isArray(raw.pieces)) throw new FormatError('Missing "pieces"');
  if (raw.pieces.length > MAX_PIECES) throw new FormatError(`Too many pieces (max ${MAX_PIECES})`);
  const seen = new Set<string>();
  const pieces = raw.pieces.map((p, i) => sanitizePiece(p, i, seen));

  let furniture: Furniture = defaultFurniture(wall);
  if (isObject(raw.furniture)) {
    const f = raw.furniture;
    furniture = {
      enabled: f.enabled === true,
      name: str(f.name, 'Sofa'),
      w: Math.max(num(f.w, 'furniture.w'), 1),
      h: Math.max(num(f.h, 'furniture.h'), 1),
      x: num(f.x, 'furniture.x', -MAX_LENGTH),
      y: num(f.y, 'furniture.y', -MAX_LENGTH),
    };
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: str(raw.name, 'Imported wall'),
    wall,
    furniture,
    gap: raw.gap === undefined ? 2 : num(raw.gap, 'gap', 0, 100),
    pieces,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ app: FILE_APP, version: FILE_VERSION, layout }, null, 2);
}

/** Parses a layout file produced by `serializeLayout`. The layout gets a fresh id so imports never overwrite. */
export function parseLayoutFile(text: string): Layout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FormatError('That file is not valid JSON');
  }
  if (!isObject(data) || data.app !== FILE_APP) throw new FormatError('That file is not a gallery wall layout');
  if (typeof data.version !== 'number' || data.version > FILE_VERSION) {
    throw new FormatError('That layout was saved by a newer version of the app');
  }
  return { ...sanitizeLayout(data.layout), id: uid() };
}

export interface StoredState {
  layouts: Layout[];
  currentId: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadState(storage: Pick<Storage, 'getItem'>): StoredState | null {
  try {
    const text = storage.getItem(LAYOUTS_KEY);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    if (!isObject(data) || !Array.isArray(data.layouts)) return null;
    const layouts: Layout[] = [];
    for (const raw of data.layouts) {
      try {
        layouts.push(sanitizeLayout(raw));
      } catch {
        // Skip a corrupt layout rather than losing all of them.
      }
    }
    if (!layouts.length) return null;
    const currentId = layouts.some((l) => l.id === data.currentId) ? (data.currentId as string) : layouts[0].id;
    return { layouts, currentId };
  } catch {
    return null;
  }
}

/** Returns an error message when the browser refuses the write (private mode, quota exceeded). */
export function saveState(storage: Store, state: StoredState): string | null {
  try {
    storage.setItem(LAYOUTS_KEY, JSON.stringify({ version: FILE_VERSION, ...state }));
    return null;
  } catch {
    return 'Could not save to this browser (storage may be full or disabled). Export a JSON file to keep your work.';
  }
}

export function loadUnit(storage: Pick<Storage, 'getItem'>): Unit {
  try {
    const data = JSON.parse(storage.getItem(PREFS_KEY) ?? '{}');
    return data.unit === 'cm' ? 'cm' : 'in';
  } catch {
    return 'in';
  }
}

export function saveUnit(storage: Store, unit: Unit): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify({ unit }));
  } catch {
    // Preference only; ignore.
  }
}
