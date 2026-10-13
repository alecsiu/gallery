import { useEffect, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react';
import { pieceRect } from '../geometry';
import type { Guide } from '../geometry';
import { snapRect } from '../geometry';
import type { Action } from '../store';
import type { Layout, Piece, Rect, Unit } from '../types';
import { WallSvg, worldMargin } from './WallSvg';
import type { HandleKind } from './WallSvg';

interface Props {
  layout: Layout;
  unit: Unit;
  selectedId: string | null;
  showDims: boolean;
  dispatch: Dispatch<Action>;
}

type Drag =
  | { kind: 'piece'; id: string; start: { x: number; y: number }; orig: Rect; moved: boolean }
  | { kind: 'furniture'; start: { x: number; y: number }; orig: Rect; moved: boolean }
  | { kind: 'wall'; handle: HandleKind; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean };

const MIN_WALL = 12;
const MAX_WALL = 1200;
const SNAP_PX = 8;
const DRAG_START_PX = 3;

export function Canvas({ layout, unit, selectedId, showDims, dispatch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgBox = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { wall, furniture, pieces } = layout;
  const m = worldMargin(wall);
  const worldW = wall.w + 2 * m;
  const worldH = wall.h + 2 * m;
  const fit = Math.max(0.05, Math.min((size.w - 24) / worldW, (size.h - 24) / worldH));
  const s = fit * zoom;

  const worldPoint = (e: ReactPointerEvent) => {
    const box = svgBox.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / s - m, y: (e.clientY - box.top) / s - m };
  };

  const begin = (e: ReactPointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onPiece = (e: ReactPointerEvent, p: Piece) => {
    dispatch({ type: 'select', id: p.id });
    begin(e, { kind: 'piece', id: p.id, start: worldPoint(e), orig: pieceRect(p), moved: false });
  };

  const onFurniture = (e: ReactPointerEvent) => {
    dispatch({ type: 'select', id: null });
    begin(e, {
      kind: 'furniture',
      start: worldPoint(e),
      orig: { x: furniture.x, y: furniture.y, w: furniture.w, h: furniture.h },
      moved: false,
    });
  };

  const onHandle = (e: ReactPointerEvent, handle: HandleKind) =>
    begin(e, { kind: 'wall', handle, start: worldPoint(e), orig: { ...wall }, moved: false });

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = worldPoint(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * s < DRAG_START_PX) return;
      d.moved = true;
      dispatch({ type: 'gesture', t: Date.now() });
    }
    const threshold = SNAP_PX / s;

    if (d.kind === 'wall') {
      const step = unit === 'in' ? 0.5 : 1 / 2.54;
      const round = (v: number) => Math.round(v / step) * step;
      const w = d.handle === 'b' ? d.orig.w : Math.min(MAX_WALL, Math.max(MIN_WALL, round(d.orig.w + dx)));
      const h = d.handle === 'r' ? d.orig.h : Math.min(MAX_WALL, Math.max(MIN_WALL, round(d.orig.h + dy)));
      dispatch({ type: 'live', change: (l) => resizeWall(l, w, h) });
      return;
    }

    // Free placement lands on 1/16" so positions read cleanly; snapping overrides this.
    const to16 = (v: number) => Math.round(v * 16) / 16;
    const moving: Rect = { ...d.orig, x: to16(d.orig.x + dx), y: to16(d.orig.y + dy) };
    let x = moving.x;
    let y = moving.y;
    if (!e.altKey) {
      const others = d.kind === 'piece' ? pieces.filter((q) => q.id !== d.id).map(pieceRect) : [];
      const aligns: Rect[] = [];
      if (d.kind === 'piece' && furniture.enabled) aligns.push({ x: furniture.x, y: furniture.y, w: furniture.w, h: furniture.h });
      if (d.kind === 'furniture') aligns.push(...pieces.map(pieceRect));
      const snapped = snapRect(moving, others, aligns, wall, layout.gap, threshold);
      x = snapped.x;
      y = snapped.y;
      setGuides(snapped.guides);
    } else {
      setGuides([]);
    }
    x = Math.min(Math.max(x, -m), wall.w + m - moving.w);
    y = Math.min(Math.max(y, -m), wall.h + m - moving.h);

    if (d.kind === 'piece') {
      setDragId(d.id);
      dispatch({ type: 'live', change: (l) => ({ ...l, pieces: l.pieces.map((q) => (q.id === d.id ? { ...q, x, y } : q)) }) });
    } else {
      dispatch({ type: 'live', change: (l) => ({ ...l, furniture: { ...l.furniture, x, y } }) });
    }
  };

  const end = () => {
    drag.current = null;
    setGuides([]);
    setDragId(null);
  };

  return (
    <div className="canvas">
      <div className="canvas-scroll" ref={wrapRef} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}>
        <div ref={svgBox} className="canvas-box" style={{ width: worldW * s, height: worldH * s }}>
          <WallSvg
            layout={layout}
            unit={unit}
            scale={s}
            showDims={showDims}
            selectedId={selectedId}
            activeId={dragId}
            guides={guides}
            interactive
            handlers={{
              onBackground: () => dispatch({ type: 'select', id: null }),
              onPiece,
              onFurniture,
              onHandle,
            }}
          />
        </div>
      </div>
      <div className="zoom">
        <label htmlFor="zoom">Zoom</label>
        <input id="zoom" type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
        <button type="button" onClick={() => setZoom(1)} title="Fit wall in view">
          Fit
        </button>
      </div>
      <p className="hint">Drag frames to move. Hold Alt to disable snapping. Arrow keys nudge the selected frame. Drag the wall's edge handles to resize it.</p>
    </div>
  );
}

/** Resizes the wall, keeping the furniture on the floor and inside the wall. */
export function resizeWall(l: Layout, w: number, h: number): Layout {
  const f = l.furniture;
  const onFloor = Math.abs(f.y + f.h - l.wall.h) < 1e-6;
  const fw = Math.min(f.w, w);
  const fh = Math.min(f.h, h);
  const y = onFloor ? h - fh : Math.min(f.y, h - fh);
  const x = Math.min(Math.max(f.x, 0), w - fw);
  return { ...l, wall: { w, h }, furniture: { ...f, w: fw, h: fh, x, y: Math.max(0, y) } };
}

