import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { PrintSheet } from './components/PrintSheet';
import { Sidebar } from './components/Sidebar';
import { Suggestions } from './components/Suggestions';
import { Toolbar } from './components/Toolbar';
import { exportJson, exportPng } from './export';
import { outerH, outerW } from './geometry';
import { currentLayout, initState, reducer } from './store';
import { loadUnit, parseLayoutFile, saveState, saveUnit } from './storage';
import { generateSuggestions } from './suggest';
import type { Suggestion } from './suggest';
import type { Unit } from './types';

const SAVE_DELAY_MS = 250;

function readStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initState(readStorage()));
  const [unit, setUnit] = useState<Unit>(() => {
    const store = readStorage();
    return store ? loadUnit(store) : 'in';
  });
  const [showDims, setShowDims] = useState(true);
  const [salt, setSalt] = useState(0);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const layout = currentLayout(state);

  // Persist to local storage (debounced; flushed when the page is hidden so a reload never loses the last edit).
  const latest = useRef(state);
  latest.current = state;
  const flush = useCallback(() => {
    const store = readStorage();
    if (!store) return;
    setSaveError(saveState(store, { layouts: latest.current.layouts, currentId: latest.current.currentId }));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.layouts, state.currentId, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [flush]);
  useEffect(() => {
    const store = readStorage();
    if (store) saveUnit(store, unit);
  }, [unit]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.title = `${layout.name} · Gallery Wall Planner`;
  }, [layout.name]);

  // Suggestions depend on piece sizes, not where the pieces currently sit.
  const sizeKey = JSON.stringify([
    layout.pieces.map((p) => [p.id, outerW(p), outerH(p)]),
    layout.wall,
    layout.furniture.enabled ? layout.furniture : null,
    layout.gap,
    salt,
  ]);
  const suggestions = useMemo(
    () =>
      generateSuggestions(
        layout.pieces.map((p) => ({ id: p.id, w: outerW(p), h: outerH(p) })),
        layout.wall,
        layout.furniture,
        layout.gap,
        salt,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizeKey],
  );

  const applySuggestion = (s: Suggestion) =>
    dispatch({
      type: 'edit',
      t: Date.now(),
      change: (l) => ({ ...l, pieces: l.pieces.map((p) => (s.positions[p.id] ? { ...p, ...s.positions[p.id] } : p)) }),
    });

  const notify = useCallback((text: string, kind: 'error' | 'info' = 'error') => setNotice({ kind, text }), []);

  const importFile = async (file: File) => {
    try {
      const imported = parseLayoutFile(await file.text());
      const names = new Set(state.layouts.map((l) => l.name));
      let name = imported.name;
      for (let i = 2; names.has(name); i++) name = `${imported.name} ${i}`;
      dispatch({ type: 'create', layout: { ...imported, name } });
      notify(`Loaded "${name}"`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that file');
    }
  };

  // Keyboard shortcuts: undo/redo, nudge, delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      const id = state.selectedId;
      if (!id) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'edit', t: Date.now(), change: (l) => ({ ...l, pieces: l.pieces.filter((p) => p.id !== id) }) });
        dispatch({ type: 'select', id: null });
        return;
      }
      const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      const small = unit === 'in' ? 0.125 : 0.1 / 2.54;
      const big = unit === 'in' ? 1 : 1 / 2.54;
      const step = e.shiftKey ? big : small;
      dispatch({
        type: 'edit',
        t: Date.now(),
        key: `nudge:${id}`,
        change: (l) => ({ ...l, pieces: l.pieces.map((p) => (p.id === id ? { ...p, x: p.x + dir[0] * step, y: p.y + dir[1] * step } : p)) }),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedId, unit]);

  return (
    <div className="app">
      <Toolbar
        state={state}
        layout={layout}
        unit={unit}
        showDims={showDims}
        dispatch={dispatch}
        onUnit={setUnit}
        onShowDims={setShowDims}
        onExportJson={() => exportJson(layout)}
        onImportFile={importFile}
        onExportPng={() => exportPng(layout, unit).catch((err) => notify(err instanceof Error ? err.message : 'Export failed'))}
        onPrint={() => window.print()}
      />
      {(notice || saveError) && (
        <div className={`banner ${notice?.kind === 'info' && !saveError ? 'info' : 'error'}`} role="status">
          {saveError ?? notice?.text}
        </div>
      )}
      <main className="main">
        <Sidebar layout={layout} unit={unit} selectedId={state.selectedId} dispatch={dispatch} notify={notify} />
        <div className="stage">
          <Canvas layout={layout} unit={unit} selectedId={state.selectedId} showDims={showDims} dispatch={dispatch} />
          <Suggestions layout={layout} unit={unit} suggestions={suggestions} onApply={applySuggestion} onShuffle={() => setSalt((n) => n + 1)} />
        </div>
      </main>
      <PrintSheet layout={layout} unit={unit} />
    </div>
  );
}
