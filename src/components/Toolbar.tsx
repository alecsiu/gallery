import { useRef } from 'react';
import type { Dispatch } from 'react';
import { createLayout, uid } from '../model';
import type { Action, State } from '../store';
import type { Layout, Unit } from '../types';
import { IconButton } from './Icon';
import { Menu, MenuHeading, MenuItem } from './Menu';

interface Props {
  state: State;
  layout: Layout;
  unit: Unit;
  showDims: boolean;
  dispatch: Dispatch<Action>;
  onUnit: (u: Unit) => void;
  onShowDims: (v: boolean) => void;
  showSuggestions: boolean;
  onShowSuggestions: (v: boolean) => void;
  onWallOnly: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onExportPng: () => void;
  onPrint: () => void;
}

/**
 * The everyday controls as glyph buttons (switch layout, undo, what to show, full-screen wall); everything used
 * once in a while (managing layouts, files, units) sits in the menu at the end.
 */
export function Toolbar({ state, layout, unit, showDims, dispatch, onUnit, onShowDims, showSuggestions, onShowSuggestions, onWallOnly, onExportJson, onImportFile, onExportPng, onPrint }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uniqueName = (base: string) => {
    const names = new Set(state.layouts.map((l) => l.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  };

  const rename = () => {
    const name = window.prompt('Layout name', layout.name)?.trim().slice(0, 60);
    if (name && name !== layout.name) dispatch({ type: 'edit', change: (l) => ({ ...l, name }), t: Date.now() });
  };

  const duplicate = () =>
    dispatch({
      type: 'create',
      layout: {
        ...layout,
        id: uid(),
        name: uniqueName(`${layout.name} copy`),
        pieces: layout.pieces.map((p) => ({ ...p, id: uid() })),
        updatedAt: Date.now(),
      },
    });

  return (
    <header className="toolbar">
      <h1>
        <svg className="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="2" y="3" width="11" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="16" y="3" width="6" height="6" rx="1" fill="currentColor" />
          <rect x="16" y="12" width="6" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="title">Gallery Wall Planner</span>
      </h1>

      <label htmlFor="layout-select" className="sr-only">
        Saved layouts
      </label>
      <select id="layout-select" className="layout-select" value={state.currentId} onChange={(e) => dispatch({ type: 'switch', id: e.target.value })}>
        {state.layouts.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <div className="group end">
        <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} />
        <IconButton icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} />
      </div>
      <div className="group">
        <IconButton icon="layouts" label={showSuggestions ? 'Hide suggested layouts' : 'Show suggested layouts'} pressed={showSuggestions} onClick={() => onShowSuggestions(!showSuggestions)} />
      </div>
      <div className="group">
        <IconButton icon="expand" label="Show only the wall" onClick={onWallOnly} />
        <Menu label="More">
          <MenuHeading>Layout</MenuHeading>
          <MenuItem icon="plus" onSelect={() => dispatch({ type: 'create', layout: createLayout(uniqueName('Untitled wall')) })}>
            New layout
          </MenuItem>
          <MenuItem icon="copy" onSelect={duplicate}>
            Duplicate layout
          </MenuItem>
          <MenuItem icon="rename" onSelect={rename}>
            Rename…
          </MenuItem>
          <MenuItem
            icon="trash"
            danger
            onSelect={() => {
              if (window.confirm(`Delete "${layout.name}"? This cannot be undone.`)) dispatch({ type: 'delete', id: layout.id });
            }}
          >
            Delete layout…
          </MenuItem>
          <MenuHeading>File</MenuHeading>
          <MenuItem icon="download" onSelect={onExportJson}>
            Save to file
          </MenuItem>
          <MenuItem icon="upload" onSelect={() => fileRef.current?.click()}>
            Load from file…
          </MenuItem>
          <MenuItem icon="image" onSelect={onExportPng}>
            Export as PNG
          </MenuItem>
          <MenuItem icon="print" onSelect={onPrint}>
            Print…
          </MenuItem>
          <MenuHeading>Show</MenuHeading>
          <MenuItem checked={showDims} onSelect={() => onShowDims(!showDims)}>
            Dimensions
          </MenuItem>
          <MenuItem checked={showSuggestions} onSelect={() => onShowSuggestions(!showSuggestions)}>
            Suggested layouts
          </MenuItem>
          <MenuHeading>Units</MenuHeading>
          <MenuItem checked={unit === 'in'} onSelect={() => onUnit('in')}>
            Inches
          </MenuItem>
          <MenuItem checked={unit === 'cm'} onSelect={() => onUnit('cm')}>
            Centimetres
          </MenuItem>
        </Menu>
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
      </div>
    </header>
  );
}
