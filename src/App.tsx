import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { IconButton } from './components/Icon';
import { PrintSheet } from './components/PrintSheet';
import { Sidebar } from './components/Sidebar';
import { Suggestions } from './components/Suggestions';
import { Toolbar } from './components/Toolbar';
import { exportJson, exportPng } from './export';
import { outerH, outerW, shownPieces } from './geometry';
import { currentLayout, initState, reducer } from './store';
import { DEFAULT_PREFS, loadPrefs, parseLayoutFile, savePrefs, saveState } from './storage';
import type { Prefs } from './storage';
import { generateSuggestions } from './suggest';
import type { Suggestion } from './suggest';
import type { Dock, Unit } from './types';

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
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const store = readStorage();
    return store ? loadPrefs(store) : DEFAULT_PREFS;
  });
  const { unit, showSuggestions, dock } = prefs;
  const setUnit = (u: Unit) => setPrefs((p) => ({ ...p, unit: u }));
  const setShowSuggestions = (v: boolean) => setPrefs((p) => ({ ...p, showSuggestions: v }));
  const setDock = (d: Dock) => setPrefs((p) => ({ ...p, dock: d }));
  const [showDims, setShowDims] = useState(true);
  /** Only the wall on screen: toolbar, side panel and suggestions are put away until toggled back. */
  const [wallOnly, setWallOnly] = useState(false);
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
    if (store) savePrefs(store, prefs);
  }, [prefs]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.title = `${layout.name} · Gallery Wall Planner`;
  }, [layout.name]);

  // Suggestions depend on piece sizes, not where the pieces currently sit.
  // Hidden pieces are left out: suggestions arrange only what is on the wall, and applying one leaves them be.
  const arranged = shownPieces(layout.pieces);
  const sizeKey = JSON.stringify([
    arranged.map((p) => [p.id, outerW(p), outerH(p)]),
    layout.wall,
    layout.furniture.enabled ? layout.furniture : null,
    layout.gap,
    salt,
    showSuggestions,
  ]);
  const suggestions = useMemo(
    () =>
      !showSuggestions
        ? []
        : generateSuggestions(
            arranged.map((p) => ({ id: p.id, w: outerW(p), h: outerH(p) })),
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
      if (target && (target.closest('dialog') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape' && wallOnly) {
        setWallOnly(false);
        return;
      }
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
  }, [state.selectedId, unit, wallOnly]);

  return (
    <div className={wallOnly ? 'app wall-only' : 'app'}>
      <Toolbar
        state={state}
        layout={layout}
        unit={unit}
        showDims={showDims}
        dispatch={dispatch}
        onUnit={setUnit}
        onShowDims={setShowDims}
        showSuggestions={showSuggestions}
        onShowSuggestions={setShowSuggestions}
        onWallOnly={() => setWallOnly(true)}
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
        <div className={`stage dock-${showSuggestions && !wallOnly ? dock : 'none'}`}>
          {wallOnly && (
            <div className="wall-bar" role="toolbar" aria-label="Wall controls">
              <IconButton icon="collapse" label="Show the controls again (Esc)" onClick={() => setWallOnly(false)} />
              <IconButton icon="undo" label="Undo" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} />
              <IconButton icon="redo" label="Redo" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} />
            </div>
          )}
          <Canvas layout={layout} unit={unit} selectedId={state.selectedId} showDims={showDims} dispatch={dispatch} />
          {showSuggestions && !wallOnly && (
            <Suggestions
              layout={layout}
              unit={unit}
              suggestions={suggestions}
              dock={dock}
              onDock={setDock}
              onClose={() => setShowSuggestions(false)}
              onApply={applySuggestion}
              onShuffle={() => setSalt((n) => n + 1)}
            />
          )}
        </div>
      </main>
      <PrintSheet layout={layout} unit={unit} />
    </div>
  );
}
