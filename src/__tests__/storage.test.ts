import { describe, expect, it } from 'vitest';
import { createSampleLayout } from '../model';
import { currentLayout, initState, reducer } from '../store';
import { withSizing } from '../geometry';
import { DEFAULT_PREFS, loadPrefs, loadState, parseLayoutFile, savePrefs, saveState, serializeLayout } from '../storage';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('JSON files', () => {
  it('round-trips a layout with a fresh id', () => {
    const layout = createSampleLayout();
    const back = parseLayoutFile(serializeLayout(layout));
    expect(back.id).not.toBe(layout.id);
    expect({ ...back, id: layout.id }).toEqual(layout);
  });
  it('keeps a piece hidden, and ignores anything but a true flag', () => {
    const layout = createSampleLayout();
    layout.pieces[1] = { ...layout.pieces[1], hidden: true };
    expect(parseLayoutFile(serializeLayout(layout)).pieces.map((p) => p.hidden)).toEqual([undefined, true, undefined, undefined, undefined]);
    const doc = JSON.parse(serializeLayout(layout));
    doc.layout.pieces[1].hidden = 'yes';
    expect(parseLayoutFile(JSON.stringify(doc)).pieces[1].hidden).toBeUndefined();
  });
  it('round-trips outer-sized pieces and validates their size', () => {
    const layout = createSampleLayout();
    layout.pieces[0] = { ...withSizing(layout.pieces[0], 'outer'), outerW: 40 };
    const back = parseLayoutFile(serializeLayout(layout));
    expect(back.pieces[0]).toEqual(layout.pieces[0]);
    const doc = JSON.parse(serializeLayout(layout));
    delete doc.layout.pieces[0].outerH;
    expect(() => parseLayoutFile(JSON.stringify(doc))).toThrow(/outerH/);
  });
  it('rejects bad files with a readable message', () => {
    expect(() => parseLayoutFile('nope')).toThrow(/valid JSON/);
    expect(() => parseLayoutFile('{"hello":1}')).toThrow(/not a gallery wall/);
    const good = JSON.parse(serializeLayout(createSampleLayout()));
    good.layout.pieces[0].artW = 'wide';
    expect(() => parseLayoutFile(JSON.stringify(good))).toThrow(/artW/);
    good.layout.pieces[0].artW = -3;
    expect(() => parseLayoutFile(JSON.stringify(good))).toThrow(/out of range/);
    good.version = 99;
    expect(() => parseLayoutFile(JSON.stringify(good))).toThrow(/newer version/);
  });
  it('drops non-image data URLs and duplicate ids', () => {
    const doc = JSON.parse(serializeLayout(createSampleLayout()));
    doc.layout.pieces[0].image = 'javascript:alert(1)';
    doc.layout.pieces[1].id = doc.layout.pieces[0].id;
    const back = parseLayoutFile(JSON.stringify(doc));
    expect(back.pieces[0].image).toBeUndefined();
    expect(new Set(back.pieces.map((p) => p.id)).size).toBe(back.pieces.length);
  });
});

describe('local storage', () => {
  it('survives a reload', () => {
    const store = memoryStore();
    let s = initState(store);
    s = reducer(s, { type: 'edit', t: 1, change: (l) => ({ ...l, name: 'Hallway' }) });
    expect(saveState(store, { layouts: s.layouts, currentId: s.currentId })).toBeNull();
    const reloaded = initState(store);
    expect(currentLayout(reloaded).name).toBe('Hallway');
    expect(currentLayout(reloaded).pieces).toEqual(currentLayout(s).pieces);
  });
  it('ignores corrupt data and reports write failures', () => {
    const store = memoryStore();
    store.setItem('gallery-wall.layouts.v1', '{broken');
    expect(loadState(store)).toBeNull();
    expect(saveState({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, { layouts: [], currentId: '' })).toMatch(/Could not save/);
  });
});

describe('undo/redo', () => {
  it('records one step per gesture and coalesces keyed edits', () => {
    let s = initState();
    const x0 = currentLayout(s).pieces[0].x;
    const id = currentLayout(s).pieces[0].id;
    const move = (x: number) => (l: ReturnType<typeof currentLayout>) => ({ ...l, pieces: l.pieces.map((p) => (p.id === id ? { ...p, x } : p)) });
    s = reducer(s, { type: 'gesture', t: 1 });
    s = reducer(s, { type: 'live', change: move(50) });
    s = reducer(s, { type: 'live', change: move(60) });
    expect(s.past).toHaveLength(1);
    s = reducer(s, { type: 'edit', t: 100, key: 'k', change: move(1) });
    s = reducer(s, { type: 'edit', t: 200, key: 'k', change: move(2) });
    expect(s.past).toHaveLength(2);
    s = reducer(s, { type: 'undo' });
    expect(currentLayout(s).pieces[0].x).toBe(60);
    s = reducer(s, { type: 'undo' });
    expect(currentLayout(s).pieces[0].x).toBe(x0);
    s = reducer(s, { type: 'redo' });
    expect(currentLayout(s).pieces[0].x).toBe(60);
  });
  it('keeps at least one layout when deleting', () => {
    let s = initState();
    s = reducer(s, { type: 'delete', id: s.currentId });
    expect(s.layouts).toHaveLength(1);
    expect(currentLayout(s).pieces).toHaveLength(0);
  });
});

describe('preferences', () => {
  it('defaults, then remembers the unit and the layouts panel state', () => {
    const store = memoryStore();
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
    savePrefs(store, { unit: 'cm', showSuggestions: false, dock: 'right' });
    expect(loadPrefs(store)).toEqual({ unit: 'cm', showSuggestions: false, dock: 'right' });
  });
  it('reads preferences saved before the panel options existed', () => {
    const store = memoryStore();
    store.setItem('gallery-wall.prefs.v1', '{"unit":"cm"}');
    expect(loadPrefs(store)).toEqual({ unit: 'cm', showSuggestions: true, dock: 'bottom' });
  });
});
