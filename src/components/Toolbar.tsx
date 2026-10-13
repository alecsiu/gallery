import { useRef } from 'react';
import type { Dispatch } from 'react';
import { createLayout, uid } from '../model';
import type { Action, State } from '../store';
import type { Layout, Unit } from '../types';

interface Props {
  state: State;
  layout: Layout;
  unit: Unit;
  showDims: boolean;
  dispatch: Dispatch<Action>;
  onUnit: (u: Unit) => void;
  onShowDims: (v: boolean) => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onExportPng: () => void;
  onPrint: () => void;
}

export function Toolbar({ state, layout, unit, showDims, dispatch, onUnit, onShowDims, onExportJson, onImportFile, onExportPng, onPrint }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uniqueName = (base: string) => {
    const names = new Set(state.layouts.map((l) => l.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  };

  return (
    <header className="toolbar">
      <h1>Gallery Wall Planner</h1>

      <div className="group">
        <label htmlFor="layout-select" className="sr-only">
          Saved layouts
        </label>
        <select id="layout-select" value={state.currentId} onChange={(e) => dispatch({ type: 'switch', id: e.target.value })}>
          {state.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label htmlFor="layout-name" className="sr-only">
          Layout name
        </label>
        <input
          id="layout-name"
          className="name-input"
          type="text"
          value={layout.name}
          maxLength={60}
          onChange={(e) => dispatch({ type: 'edit', change: (l) => ({ ...l, name: e.target.value }), key: 'rename', t: Date.now() })}
        />
        <button type="button" onClick={() => dispatch({ type: 'create', layout: createLayout(uniqueName('Untitled wall')) })}>
          New
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'create',
              layout: {
                ...layout,
                id: uid(),
                name: uniqueName(`${layout.name} copy`),
                pieces: layout.pieces.map((p) => ({ ...p, id: uid() })),
                updatedAt: Date.now(),
              },
            })
          }
        >
          Duplicate
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (window.confirm(`Delete "${layout.name}"? This cannot be undone.`)) dispatch({ type: 'delete', id: layout.id });
          }}
        >
          Delete
        </button>
      </div>

      <div className="group">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>

      <div className="group">
        <div className="segmented" role="group" aria-label="Units">
          {(['in', 'cm'] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} className={unit === u ? 'on' : undefined} onClick={() => onUnit(u)}>
              {u}
            </button>
          ))}
        </div>
        <label className="check inline">
          <input type="checkbox" checked={showDims} onChange={(e) => onShowDims(e.target.checked)} />
          Dimensions
        </label>
      </div>

      <div className="group">
        <button type="button" onClick={onExportJson} title="Download this layout as a JSON file">
          Save to file
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} title="Load a layout from a JSON file">
          Load from file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImportFile(file);
          }}
        />
        <button type="button" onClick={onExportPng}>
          PNG
        </button>
        <button type="button" onClick={onPrint}>
          Print
        </button>
      </div>
    </header>
  );
}
