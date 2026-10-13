import { useEffect, useId, useRef, useState } from 'react';
import { formatInput, fromDisplay, parseLength } from '../units';
import type { Unit } from '../types';

interface Props {
  label: string;
  /** Value in inches. */
  value: number;
  unit: Unit;
  onCommit: (inches: number) => void;
  min?: number;
  max?: number;
  readOnly?: boolean;
  title?: string;
}

/** Text input for a length: accepts fractions (11 3/4), unit suffixes (cm, mm, "), and arrow-key stepping. */
export function NumField({ label, value, unit, onCommit, min = 0, max = 100000, readOnly = false, title }: Props) {
  const id = useId();
  const [text, setText] = useState(() => formatInput(value, unit));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatInput(value, unit));
  }, [value, unit]);

  const apply = (inches: number | null) => {
    if (inches === null || inches < min - 1e-9 || inches > max + 1e-9) {
      setInvalid(inches !== null || text.trim() !== '');
      return false;
    }
    setInvalid(false);
    if (Math.abs(inches - value) > 1e-9) onCommit(inches);
    return true;
  };

  const step = (direction: 1 | -1, big: boolean) => {
    const base = parseLength(text, unit) ?? value;
    const size = unit === 'in' ? (big ? 1 : 0.125) : fromDisplay(big ? 1 : 0.1, 'cm');
    const next = Math.min(Math.max(base + direction * size, min), max);
    onCommit(next);
    setText(formatInput(next, unit));
    setInvalid(false);
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="unit">{unit === 'in' ? 'in' : 'cm'}</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={readOnly}
        title={title}
        aria-invalid={invalid || undefined}
        className={invalid ? 'invalid' : undefined}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (readOnly) return;
          if (!apply(parseLength(text, unit))) {
            setText(formatInput(value, unit));
            setInvalid(false);
          } else {
            setText(formatInput(parseLength(text, unit) ?? value, unit));
          }
        }}
        onKeyDown={(e) => {
          if (readOnly) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(formatInput(value, unit));
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            step(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
    </div>
  );
}
