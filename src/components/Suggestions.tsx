import type { Dock, Layout, Unit } from '../types';
import type { Suggestion } from '../suggest';
import { WallSvg, worldMargin } from './WallSvg';

interface Props {
  layout: Layout;
  unit: Unit;
  suggestions: Suggestion[];
  dock: Dock;
  onDock: (dock: Dock) => void;
  onClose: () => void;
  onApply: (s: Suggestion) => void;
  onShuffle: () => void;
}

const THUMB_W: Record<Dock, number> = { bottom: 150, right: 196 };

const DOCKS: { dock: Dock; label: string; bar: { x: number; y: number; width: number; height: number } }[] = [
  { dock: 'bottom', label: 'Anchor to the bottom', bar: { x: 3, y: 10, width: 12, height: 4 } },
  { dock: 'right', label: 'Anchor to the right', bar: { x: 11, y: 4, width: 4, height: 10 } },
];

export function Suggestions({ layout, unit, suggestions, dock, onDock, onClose, onApply, onShuffle }: Props) {
  const m = worldMargin(layout.wall);
  const scale = THUMB_W[dock] / (layout.wall.w + 2 * m);
  return (
    <section className="suggestions" aria-label="Suggested layouts">
      <div className="section-head">
        <h2>Suggested layouts</h2>
        <div className="btn-row">
          <button type="button" onClick={onShuffle} disabled={layout.pieces.length < 3}>
            Shuffle
          </button>
          <div className="segmented" role="group" aria-label="Panel position">
            {DOCKS.map((d) => (
              <button
                key={d.dock}
                type="button"
                className={dock === d.dock ? 'icon on' : 'icon'}
                aria-pressed={dock === d.dock}
                aria-label={d.label}
                title={d.label}
                onClick={() => onDock(d.dock)}
              >
                <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
                  <rect x="1.5" y="2.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <rect {...d.bar} rx="1" fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          <button type="button" className="icon" aria-label="Hide suggested layouts" title="Hide suggested layouts" onClick={onClose}>
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
              <path d="M4.5 4.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {layout.pieces.length === 0 ? (
        <p className="note">Add some pieces to get layout suggestions.</p>
      ) : suggestions.length === 0 ? (
        <p className="note">These pieces don't fit in the wall with room to spare. Make the wall larger or the gap smaller.</p>
      ) : (
        <ul className="thumbs">
          {suggestions.map((s) => {
            const preview: Layout = {
              ...layout,
              pieces: layout.pieces.map((p) => ({ ...p, ...s.positions[p.id] })),
            };
            return (
              <li key={s.key}>
                <button type="button" onClick={() => onApply(s)} title="Apply this arrangement (undoable)">
                  <WallSvg layout={preview} unit={unit} scale={scale} showDims={false} compact />
                  <span className="thumb-label">{s.label}</span>
                  <span className="thumb-score" title="Layout score: even gaps, balance, width and alignment">
                    {s.score}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
