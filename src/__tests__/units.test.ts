import { describe, expect, it } from 'vitest';
import { formatInput, formatLabel, parseLength } from '../units';

describe('parseLength', () => {
  it('parses decimals and fractions as inches', () => {
    expect(parseLength('11.5', 'in')).toBe(11.5);
    expect(parseLength('11 3/4', 'in')).toBe(11.75);
    expect(parseLength('3/4', 'in')).toBe(0.75);
    expect(parseLength('11-1/2', 'in')).toBe(11.5);
  });
  it('uses the active unit for bare numbers', () => {
    expect(parseLength('2.54', 'cm')).toBeCloseTo(1, 9);
    expect(parseLength('10', 'cm')).toBeCloseTo(10 / 2.54, 9);
  });
  it('honours explicit suffixes', () => {
    expect(parseLength('5 cm', 'in')).toBeCloseTo(5 / 2.54, 9);
    expect(parseLength('50mm', 'in')).toBeCloseTo(50 / 25.4, 9);
    expect(parseLength('8"', 'cm')).toBe(8);
    expect(parseLength(`8' 4"`, 'in')).toBe(100);
    expect(parseLength(`2'`, 'cm')).toBe(24);
  });
  it('rejects junk', () => {
    expect(parseLength('', 'in')).toBeNull();
    expect(parseLength('abc', 'in')).toBeNull();
    expect(parseLength('1/0', 'in')).toBeNull();
    expect(parseLength('1..2', 'in')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats inputs losslessly', () => {
    expect(formatInput(11.75, 'in')).toBe('11 3/4');
    expect(formatInput(2.3, 'in')).toBe('2.3');
    expect(formatInput(8, 'in')).toBe('8');
    expect(formatInput(10 / 2.54, 'cm')).toBe('10');
  });
  it('round-trips input text', () => {
    for (const v of [0.0625, 7.3125, 12.34, 96]) expect(parseLength(formatInput(v, 'in'), 'in')).toBeCloseTo(v, 3);
  });
  it('formats labels to the nearest eighth', () => {
    expect(formatLabel(11.74, 'in')).toBe('11 3/4"');
    expect(formatLabel(2, 'in')).toBe('2"');
    expect(formatLabel(10 / 2.54, 'cm')).toBe('10 cm');
  });
});
