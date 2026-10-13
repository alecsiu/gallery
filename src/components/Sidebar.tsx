import type { ChangeEvent, Dispatch } from 'react';
import { innerH, innerW, outerH, outerW } from '../geometry';
import { fileToThumbnail } from '../image';
import { createPiece, uid } from '../model';
import type { Action } from '../store';
import type { Layout, Piece, Unit } from '../types';
import { formatLabel } from '../units';
import { resizeWall } from './Canvas';
import { NumField } from './NumField';

interface Props {
  layout: Layout;
  unit: Unit;
  selectedId: string | null;
  dispatch: Dispatch<Action>;
  notify: (text: string) => void;
}

export function Sidebar({ layout, unit, selectedId, dispatch, notify }: Props) {
  const { wall, furniture, pieces } = layout;
  const selected = pieces.find((p) => p.id === selectedId) ?? null;

  const edit = (change: (l: Layout) => Layout, key?: string) => dispatch({ type: 'edit', change, key, t: Date.now() });
  const patchPiece = (id: string, patch: Partial<Piece>, key?: string) =>
    edit((l) => ({ ...l, pieces: l.pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), key);

  const addPiece = () => {
    const piece = createPiece(pieces.length, wall);
    edit((l) => ({ ...l, pieces: [...l.pieces, piece] }));
    dispatch({ type: 'select', id: piece.id });
  };

  const duplicate = (p: Piece) => {
    const copy: Piece = { ...p, id: uid(), name: `${p.name} copy`, x: p.x + 2, y: p.y + 2 };
    edit((l) => ({ ...l, pieces: [...l.pieces, copy] }));
    dispatch({ type: 'select', id: copy.id });
  };

  const remove = (id: string) => {
    edit((l) => ({ ...l, pieces: l.pieces.filter((p) => p.id !== id) }));
    dispatch({ type: 'select', id: null });
  };

  const onImage = async (e: ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      patchPiece(id, { image: await fileToThumbnail(file) });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that image');
    }
  };

  return (
    <aside className="sidebar">
      <section>
        <h2>Wall</h2>
        <div className="grid2">
          <NumField label="Width" value={wall.w} unit={unit} min={12} max={1200} onCommit={(w) => edit((l) => resizeWall(l, w, l.wall.h), 'wall-w')} />
          <NumField label="Height" value={wall.h} unit={unit} min={12} max={1200} onCommit={(h) => edit((l) => resizeWall(l, l.wall.w, h), 'wall-h')} />
        </div>
        <NumField
          label="Preferred gap"
          value={layout.gap}
          unit={unit}
          max={100}
          title="Spacing used by snapping and by suggested layouts"
          onCommit={(gap) => edit((l) => ({ ...l, gap }), 'gap')}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={furniture.enabled}
            onChange={(e) => edit((l) => ({ ...l, furniture: { ...l.furniture, enabled: e.target.checked } }))}
          />
          Furniture guide (art centers over it)
        </label>
        {furniture.enabled && (
          <div className="stack">
            <div className="field">
              <label htmlFor="furn-name">Name</label>
              <input
                id="furn-name"
                type="text"
                value={furniture.name}
                maxLength={40}
                onChange={(e) => edit((l) => ({ ...l, furniture: { ...l.furniture, name: e.target.value } }), 'furn-name')}
              />
            </div>
            <div className="grid2">
              <NumField label="Width" value={furniture.w} unit={unit} min={1} max={wall.w} onCommit={(w) => edit((l) => ({ ...l, furniture: { ...l.furniture, w, x: Math.min(l.furniture.x, l.wall.w - w) } }), 'furn-w')} />
              <NumField label="Height" value={furniture.h} unit={unit} min={1} max={wall.h} onCommit={(h) => edit((l) => ({ ...l, furniture: { ...l.furniture, h, y: Math.min(l.furniture.y + l.furniture.h - h, l.wall.h - h) } }), 'furn-h')} />
            </div>
            <p className="note">Drag the furniture on the canvas to position it.</p>
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Pieces ({pieces.length})</h2>
          <button type="button" className="primary" onClick={addPiece}>
            + Add piece
          </button>
        </div>
        {pieces.length === 0 && <p className="note">Add the art you want to hang. Set its size, mat and frame, then drag it into place.</p>}
        <ul className="pieces">
          {pieces.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === selectedId ? 'piece-btn active' : 'piece-btn'}
                onClick={() => dispatch({ type: 'select', id: p.id })}
              >
                <span className="swatch" style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} />
                <span className="piece-name">{p.name}</span>
                <span className="piece-dims">
                  {formatLabel(outerW(p), unit)} × {formatLabel(outerH(p), unit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section key={selected.id}>
          <div className="section-head">
            <h2>Selected piece</h2>
            <div className="btn-row">
              <button type="button" onClick={() => duplicate(selected)}>
                Duplicate
              </button>
              <button type="button" className="danger" onClick={() => remove(selected.id)}>
                Delete
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="piece-name">Name</label>
            <input
              id="piece-name"
              type="text"
              value={selected.name}
              maxLength={60}
              onChange={(e) => patchPiece(selected.id, { name: e.target.value }, `name:${selected.id}`)}
            />
          </div>

          <h3>Art</h3>
          <div className="grid2">
            <NumField label="Width" value={selected.artW} unit={unit} min={0.1} onCommit={(artW) => patchPiece(selected.id, { artW }, `artW:${selected.id}`)} />
            <NumField label="Height" value={selected.artH} unit={unit} min={0.1} onCommit={(artH) => patchPiece(selected.id, { artH }, `artH:${selected.id}`)} />
          </div>

          <h3>Mat</h3>
          <div className="grid2">
            <NumField label="Left / right" value={selected.matX} unit={unit} onCommit={(matX) => patchPiece(selected.id, { matX }, `matX:${selected.id}`)} />
            <NumField label="Top / bottom" value={selected.matY} unit={unit} onCommit={(matY) => patchPiece(selected.id, { matY }, `matY:${selected.id}`)} />
          </div>

          <h3>Frame</h3>
          <NumField label="Moulding width" value={selected.frame} unit={unit} onCommit={(frame) => patchPiece(selected.id, { frame }, `frame:${selected.id}`)} />
          <div className="grid2">
            <NumField label="Inner width" value={innerW(selected)} unit={unit} readOnly title="Art plus mat: the frame opening" onCommit={() => {}} />
            <NumField label="Inner height" value={innerH(selected)} unit={unit} readOnly title="Art plus mat: the frame opening" onCommit={() => {}} />
            <NumField label="Outer width" value={outerW(selected)} unit={unit} readOnly title="Overall width including the frame" onCommit={() => {}} />
            <NumField label="Outer height" value={outerH(selected)} unit={unit} readOnly title="Overall height including the frame" onCommit={() => {}} />
          </div>
          <p className="note">Inner and outer sizes are calculated from the art, mat and moulding.</p>

          <h3>Position</h3>
          <div className="grid2">
            <NumField label="From left" value={selected.x} unit={unit} min={-2000} onCommit={(x) => patchPiece(selected.id, { x }, `x:${selected.id}`)} />
            <NumField label="From top" value={selected.y} unit={unit} min={-2000} onCommit={(y) => patchPiece(selected.id, { y }, `y:${selected.id}`)} />
          </div>
          <p className="note">Center hangs {formatLabel(wall.h - (selected.y + outerH(selected) / 2), unit)} above the floor.</p>

          <h3>Picture</h3>
          <div className="btn-row">
            <label className="button">
              {selected.image ? 'Replace image' : 'Add image'}
              <input type="file" accept="image/*" hidden onChange={(e) => onImage(e, selected.id)} />
            </label>
            {selected.image && (
              <button type="button" onClick={() => patchPiece(selected.id, { image: undefined })}>
                Remove image
              </button>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
