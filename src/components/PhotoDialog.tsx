import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { loadImage, straightenPhoto } from '../image';
import type { Unit } from '../types';
import { isConvexQuad, orderQuad, quadSize } from '../warp';
import type { Point } from '../warp';
import { NumField } from './NumField';

export interface PhotoPiece {
  name: string;
  outerW: number;
  outerH: number;
  image: string;
}

interface Props {
  file: File;
  unit: Unit;
  defaultName: string;
  onAdd: (piece: PhotoPiece) => void;
  onClose: () => void;
}

const INSET = 0.12;
const START: Point[] = [
  { x: INSET, y: INSET },
  { x: 1 - INSET, y: INSET },
  { x: 1 - INSET, y: 1 - INSET },
  { x: INSET, y: 1 - INSET },
];
const DEFAULT_LONG_SIDE = 20; // inches, until the user types a real measurement
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round16 = (v: number) => Math.max(0.1, Math.round(v * 16) / 16);

/** Outline a piece in a photo by its four corners, give one measurement, and get a to-scale piece with its picture. */
export function PhotoDialog({ file, unit, defaultName, onAdd, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>(START);
  const [name, setName] = useState(defaultName);
  /** The side the user last typed; with `linked`, the other side follows the outline's proportions. */
  const [anchor, setAnchor] = useState<{ side: 'w' | 'h'; value: number } | null>(null);
  const [free, setFree] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    loadImage(file).then(
      (loaded) => {
        url = loaded.url;
        if (cancelled) URL.revokeObjectURL(url);
        else setPhoto(loaded);
      },
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not read that image'),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  // Proportions of the outlined piece, measured in photo pixels.
  const outline = useMemo(() => {
    if (!photo) return null;
    const quad = orderQuad(corners.map((c) => ({ x: c.x * photo.img.naturalWidth, y: c.y * photo.img.naturalHeight })));
    const size = quadSize(quad);
    return { valid: isConvexQuad(quad) && Math.min(size.w, size.h) >= 8, aspect: size.w / Math.max(size.h, 1e-6) };
  }, [photo, corners]);
  const aspect = outline?.valid ? outline.aspect : 1;

  let w: number;
  let h: number;
  if (free) ({ w, h } = free);
  else if (anchor) {
    w = anchor.side === 'w' ? anchor.value : round16(anchor.value * aspect);
    h = anchor.side === 'h' ? anchor.value : round16(anchor.value / aspect);
  } else {
    w = aspect >= 1 ? DEFAULT_LONG_SIDE : round16(DEFAULT_LONG_SIDE * aspect);
    h = aspect >= 1 ? round16(DEFAULT_LONG_SIDE / aspect) : DEFAULT_LONG_SIDE;
  }

  const commitSide = (side: 'w' | 'h', value: number) => {
    if (free) setFree({ ...free, [side]: value });
    else setAnchor({ side, value });
  };

  const moveCorner = (i: number, p: Point) => setCorners((cs) => cs.map((c, k) => (k === i ? { x: clamp01(p.x), y: clamp01(p.y) } : c)));

  const dragging = useRef<number | null>(null);
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = i;
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (dragging.current === null || !box) return;
    moveCorner(dragging.current, { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
  };
  const onHandleKey = (e: KeyboardEvent, i: number) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.004;
    moveCorner(i, { x: corners[i].x + dir[0] * step, y: corners[i].y + dir[1] * step });
  };

  const add = () => {
    if (!photo) return;
    try {
      onAdd({ name: name.trim() || defaultName, outerW: w, outerH: h, image: straightenPhoto(photo.img, corners) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo');
    }
  };

  const ring = corners.map((c) => `${c.x} ${c.y}`).join(' L');

  return (
    <dialog ref={dialogRef} className="photo-dialog" aria-labelledby="photo-title" onClose={onClose}>
      <h2 id="photo-title">Add a piece from a photo</h2>
      <p className="note">
        Drag the four corners to the outer edges of the piece, then enter its real width or height. A straight-on photo gives the best
        proportions.
      </p>

      <div className="photo-area">
        {photo ? (
          <div className="photo-frame" ref={frameRef}>
            <img src={photo.url} alt="Your photo" draggable={false} />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <path d={`M0 0H1V1H0Z M${ring}Z`} fillRule="evenodd" className="photo-shade" />
              <path d={`M${ring}Z`} className={outline?.valid ? 'photo-outline' : 'photo-outline bad'} />
            </svg>
            {corners.map((c, i) => (
              <button
                key={i}
                type="button"
                className="photo-handle"
                aria-label={`Corner ${i + 1} (arrow keys to adjust)`}
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={() => (dragging.current = null)}
                onPointerCancel={() => (dragging.current = null)}
                onKeyDown={(e) => onHandleKey(e, i)}
              />
            ))}
          </div>
        ) : (
          !error && <p className="note">Loading photo…</p>
        )}
      </div>

      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}
      {photo && outline && !outline.valid && <p className="photo-error">The corners need to outline a four-sided shape.</p>}

      <div className="photo-fields">
        <div className="field">
          <label htmlFor="photo-name">Name</label>
          <input id="photo-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <NumField label="Outer width" value={w} unit={unit} min={0.1} max={2000} onCommit={(v) => commitSide('w', v)} />
        <NumField label="Outer height" value={h} unit={unit} min={0.1} max={2000} onCommit={(v) => commitSide('h', v)} />
      </div>
      <label className="check">
        <input type="checkbox" role="switch" checked={!free} onChange={(e) => setFree(e.target.checked ? null : { w, h })} />
        Keep the photo's proportions (type one side, the other follows)
      </label>

      <div className="photo-actions">
        <button type="button" onClick={() => dialogRef.current?.close()}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!photo || !outline?.valid} onClick={add}>
          Add piece
        </button>
      </div>
    </dialog>
  );
}
