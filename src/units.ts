import type { Unit } from './types';

const CM_PER_IN = 2.54;

export const toDisplay = (inches: number, unit: Unit) => (unit === 'cm' ? inches * CM_PER_IN : inches);
export const fromDisplay = (value: number, unit: Unit) => (unit === 'cm' ? value / CM_PER_IN : value);

function parseNumber(s: string): number | null {
  s = s.trim();
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : null;
}

/** Parses "11.5", "11 3/4", "3/4", "11-3/4" as inches. */
function parseInches(s: string): number | null {
  s = s.trim();
  const m = s.match(/^(-)?\s*(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const den = parseInt(m[4], 10);
    if (den === 0) return null;
    const v = parseInt(m[2] ?? '0', 10) + parseInt(m[3], 10) / den;
    return m[1] ? -v : v;
  }
  return parseNumber(s);
}

/**
 * Parses a length typed by the user and returns inches, or null when invalid.
 * Plain numbers use the active unit. Suffixes override it: `"`/in, cm, mm, and feet like `8' 4"`.
 */
export function parseLength(raw: string, unit: Unit): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[”″“]/g, '"')
    .replace(/[’′]/g, "'");
  if (!s) return null;

  let m = s.match(/^(.*?)\s*mm$/);
  if (m) {
    const n = parseNumber(m[1]);
    return n === null ? null : n / (CM_PER_IN * 10);
  }
  m = s.match(/^(.*?)\s*cm$/);
  if (m) {
    const n = parseNumber(m[1]);
    return n === null ? null : n / CM_PER_IN;
  }
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(.*)$/);
  if (m) {
    const rest = m[2].replace(/\s*(?:"|in|inches)$/, '').trim();
    const inches = rest === '' ? 0 : parseInches(rest);
    return inches === null ? null : parseFloat(m[1]) * 12 + inches;
  }
  m = s.match(/^(.*?)\s*(?:"|in|inches)$/);
  if (m) return parseInches(m[1]);
  return unit === 'cm' ? ((n) => (n === null ? null : n / CM_PER_IN))(parseNumber(s)) : parseInches(s);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function fraction(abs: number, denom: number): string {
  let whole = Math.floor(abs);
  let n = Math.round((abs - whole) * denom);
  if (n === denom) {
    whole += 1;
    n = 0;
  }
  if (n === 0) return `${whole}`;
  const g = gcd(n, denom);
  const frac = `${n / g}/${denom / g}`;
  return whole === 0 ? frac : `${whole} ${frac}`;
}

const trim = (v: number, places: number) => `${parseFloat(v.toFixed(places))}`;

/** Text for editable inputs: exact (fractions only when they are lossless). */
export function formatInput(inches: number, unit: Unit): string {
  if (unit === 'cm') return trim(inches * CM_PER_IN, 2);
  const abs = Math.abs(inches);
  const sign = inches < 0 ? '-' : '';
  const sixteenths = Math.round(abs * 16);
  if (Math.abs(abs - sixteenths / 16) < 1e-6) return sign + fraction(sixteenths / 16, 16);
  return sign + trim(abs, 3);
}

/** Compact text for canvas labels (rounded to 1/8" or 0.1 cm). */
export function formatLabel(inches: number, unit: Unit): string {
  if (unit === 'cm') return `${trim(inches * CM_PER_IN, 1)} cm`;
  const sign = inches < -1e-9 ? '-' : '';
  return `${sign}${fraction(Math.round(Math.abs(inches) * 8) / 8, 8)}"`;
}
