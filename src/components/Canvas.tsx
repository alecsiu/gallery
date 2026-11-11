import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  | { kind: 'wall'; handle: HandleKind; start: { x: number; y: number }; orig: { w: number; h: number }; moved: boolean }
  /** Dragging empty space scrolls the view. Client pixels, not wall inches. */
  | { kind: 'pan'; startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean }
  /** Two fingers: zoom about their midpoint, which also carries the view along. */
  | { kind: 'pinch'; dist: number; zoom: number; world: { x: number; y: number } };

const MIN_WALL = 12;
const MAX_WALL = 1200;
const SNAP_PX = 8;
const DRAG_START_PX = 3;
/** Fingers wobble: a touch has to travel further before a tap becomes a drag. */
const TOUCH_DRAG_START_PX = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function Canvas({ layout, unit, selectedId, showDims, dispatch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgBox = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

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

  /** Wall position under a screen point, read from the DOM so it is right even mid-zoom. */
  const worldAt = (clientX: number, clientY: number) => {
    const box = svgBox.current!.getBoundingClientRect();
    const scale = box.width / worldW;
    return { x: (clientX - box.left) / scale - m, y: (clientY - box.top) / scale - m };
  };
  const worldPoint = (e: ReactPointerEvent) => worldAt(e.clientX, e.clientY);

  // Zooming keeps one wall point pinned under a screen point (the cursor, the fingers, or the view's center).
  const anchor = useRef<{ world: { x: number; y: number }; clientX: number; clientY: number } | null>(null);
  const applyAnchor = () => {
    const a = anchor.current;
    const el = wrapRef.current;
    const box = svgBox.current?.getBoundingClientRect();
    anchor.current = null;
    if (!a || !el || !box) return;
    const scale = box.width / worldW;
    el.scrollLeft += box.left + (a.world.x + m) * scale - a.clientX;
    el.scrollTop += box.top + (a.world.y + m) * scale - a.clientY;
  };
  useLayoutEffect(applyAnchor);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomTo = (next: number, clientX: number, clientY: number, world = worldAt(clientX, clientY)) => {
    anchor.current = { world, clientX, clientY };
    const z = clampZoom(next);
    if (z === zoomRef.current) applyAnchor();
    else setZoom(z);
  };
  const zoomAboutCenter = (next: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    zoomTo(next, r.left + r.width / 2, r.top + r.height / 2);
  };

  // Ctrl/Cmd + wheel, which is also what a trackpad pinch sends, zooms about the cursor. A plain wheel scrolls.
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomToRef.current(zoomRef.current * Math.exp(-delta * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Every pointer currently down on the canvas, for pinch detection. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const onDownCapture = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size !== 2) return;
    // A second finger turns whatever was happening into a pinch; the piece under it must not start a drag.
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    const p = pinchState();
    drag.current = { kind: 'pinch', dist: Math.max(p.dist, 1), zoom: zoomRef.current, world: worldAt(p.x, p.y) };
    setGuides([]);
    setDragId(null);
  };

  const begin = (e: ReactPointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onBackground = (e: ReactPointerEvent) => {
    const el = wrapRef.current!;
    begin(e, { kind: 'pan', startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false });
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
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    const startPx = e.pointerType === 'touch' ? TOUCH_DRAG_START_PX : DRAG_START_PX;

    if (d.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const p = pinchState();
      zoomTo((d.zoom * p.dist) / d.dist, p.x, p.y, d.world);
      return;
    }
    if (d.kind === 'pan') {
      const px = e.clientX - d.startX;
      const py = e.clientY - d.startY;
      if (!d.moved && Math.hypot(px, py) < startPx) return;
      d.moved = true;
      setPanning(true);
      wrapRef.current!.scrollLeft = d.scrollLeft - px;
      wrapRef.current!.scrollTop = d.scrollTop - py;
      return;
    }

    const p = worldPoint(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * s < startPx) return;
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

  const end = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    // Lifting one finger of a pinch must not turn the other into a drag.
    if (d?.kind === 'pinch' && pointers.current.size > 0) return;
    // A tap on empty space (not a pan) clears the selection.
    if (d?.kind === 'pan' && !d.moved && e.type === 'pointerup') dispatch({ type: 'select', id: null });
    setPanning(false);
    drag.current = null;
    setGuides([]);
    setDragId(null);
  };

  return (
    <div className="canvas">
      <div
        className={panning ? 'canvas-scroll panning' : 'canvas-scroll'}
        ref={wrapRef}
        onPointerDownCapture={onDownCapture}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
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
              onBackground,
              onPiece,
              onFurniture,
              onHandle,
            }}
          />
        </div>
      </div>
      <div className="zoom">
        <label htmlFor="zoom">Zoom</label>
        <input id="zoom" type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(e) => zoomAboutCenter(parseFloat(e.target.value))} />
        <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(1)} title="Fit wall in view">
          Fit
        </button>
      </div>
      <p className="hint">Tap a frame to select it, drag to move (Alt disables snapping, arrow keys nudge). Drag empty space to pan; pinch or Ctrl + scroll to zoom. Drag the wall's edge handles to resize it.</p>
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

