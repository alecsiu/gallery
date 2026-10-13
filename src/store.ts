import { createLayout, createSampleLayout } from './model';
import { loadState } from './storage';
import type { Layout } from './types';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export interface State {
  layouts: Layout[];
  currentId: string;
  past: Layout[];
  future: Layout[];
  selectedId: string | null;
  lastKey?: string;
  lastTime: number;
}

export type Action =
  /** A recorded edit. Consecutive edits with the same `key` within a second share one undo step. */
  | { type: 'edit'; change: (l: Layout) => Layout; key?: string; t: number }
  /** Starts a drag: records one undo step; follow with `live` updates. */
  | { type: 'gesture'; t: number }
  | { type: 'live'; change: (l: Layout) => Layout }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; id: string | null }
  | { type: 'switch'; id: string }
  | { type: 'create'; layout: Layout }
  | { type: 'delete'; id: string };

export function initState(storage?: Pick<Storage, 'getItem'>): State {
  const stored = storage ? loadState(storage) : null;
  const layouts = stored?.layouts ?? [createSampleLayout()];
  return {
    layouts,
    currentId: stored?.currentId ?? layouts[0].id,
    past: [],
    future: [],
    selectedId: null,
    lastTime: 0,
  };
}

export const currentLayout = (s: State): Layout => s.layouts.find((l) => l.id === s.currentId) ?? s.layouts[0];

function replaceCurrent(s: State, layout: Layout): Layout[] {
  return s.layouts.map((l) => (l.id === s.currentId ? layout : l));
}

function withHistory(s: State, t: number, key: string | undefined): Pick<State, 'past' | 'future' | 'lastKey' | 'lastTime'> {
  if (key && key === s.lastKey && t - s.lastTime < COALESCE_MS) {
    return { past: s.past, future: s.future, lastKey: key, lastTime: t };
  }
  return { past: [...s.past, currentLayout(s)].slice(-HISTORY_LIMIT), future: [], lastKey: key, lastTime: t };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'edit': {
      const next = { ...a.change(currentLayout(s)), updatedAt: a.t };
      return { ...s, ...withHistory(s, a.t, a.key), layouts: replaceCurrent(s, next) };
    }
    case 'gesture':
      return { ...s, ...withHistory(s, a.t, undefined) };
    case 'live': {
      const next = { ...a.change(currentLayout(s)), updatedAt: s.lastTime };
      return { ...s, layouts: replaceCurrent(s, next) };
    }
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        ...s,
        past: s.past.slice(0, -1),
        future: [currentLayout(s), ...s.future],
        layouts: replaceCurrent(s, prev),
        lastKey: undefined,
      };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...s,
        past: [...s.past, currentLayout(s)],
        future: s.future.slice(1),
        layouts: replaceCurrent(s, next),
        lastKey: undefined,
      };
    }
    case 'select':
      return { ...s, selectedId: a.id };
    case 'switch':
      if (!s.layouts.some((l) => l.id === a.id)) return s;
      return { ...s, currentId: a.id, past: [], future: [], selectedId: null, lastKey: undefined };
    case 'create':
      return {
        ...s,
        layouts: [...s.layouts, a.layout],
        currentId: a.layout.id,
        past: [],
        future: [],
        selectedId: null,
        lastKey: undefined,
      };
    case 'delete': {
      let layouts = s.layouts.filter((l) => l.id !== a.id);
      if (!layouts.length) layouts = [createLayout()];
      const currentId = layouts.some((l) => l.id === s.currentId) ? s.currentId : layouts[0].id;
      const switched = currentId !== s.currentId;
      return {
        ...s,
        layouts,
        currentId,
        past: switched ? [] : s.past,
        future: switched ? [] : s.future,
        selectedId: switched ? null : s.selectedId,
        lastKey: undefined,
      };
    }
  }
}
