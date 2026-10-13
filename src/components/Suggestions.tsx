import type { Layout, Unit } from '../types';
import type { Suggestion } from '../suggest';
import { WallSvg, worldMargin } from './WallSvg';

interface Props {
  layout: Layout;
  unit: Unit;
  suggestions: Suggestion[];
  onApply: (s: Suggestion) => void;
  onShuffle: () => void;
}

const THUMB_W = 150;

export function Suggestions({ layout, unit, suggestions, onApply, onShuffle }: Props) {
  const m = worldMargin(layout.wall);
  const scale = THUMB_W / (layout.wall.w + 2 * m);
  return (
    <section className="suggestions" aria-label="Suggested layouts">
      <div className="section-head">
        <h2>Suggested layouts</h2>
        <button type="button" onClick={onShuffle} disabled={layout.pieces.length < 3}>
          Shuffle
        </button>
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
