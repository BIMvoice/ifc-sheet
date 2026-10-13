/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How one value of a label field is written: a number pattern (`0`, `0.00`,
 * `#,##0.0`) and an optional unit that follows the value, so a missing value
 * never leaves a unit standing alone.
 */

export interface FormatSpec {
  /** Digits after the point; null keeps the number as it is (up to three). */
  decimals: number | null;
  /** Group the integer part in thousands. */
  thousands: boolean;
  /** Written after the value, separated by a space. */
  unit: string;
}

const PATTERN = /^([#,]*0(?:\.0+)?)$/;

/** The spec a `:…` suffix of a field names: an optional number pattern, then an optional unit (a text that is no pattern is all unit). */
export function parseFormatSpec(text: string): FormatSpec {
  const trimmed = text.trim();
  const space = trimmed.search(/\s/);
  const head = space < 0 ? trimmed : trimmed.slice(0, space);
  const match = PATTERN.exec(head);
  const unit = match ? (space < 0 ? '' : trimmed.slice(space).trim()) : trimmed;
  if (!match) return { decimals: null, thousands: false, unit };
  const pattern = match[1];
  const dot = pattern.indexOf('.');
  return { decimals: dot < 0 ? 0 : pattern.length - dot - 1, thousands: pattern.includes(','), unit };
}

/** The text of a spec, the inverse of {@link parseFormatSpec}. */
export function formatSpecText(spec: FormatSpec): string {
  const digits = spec.decimals === null ? '' : `${spec.thousands ? '#,##' : ''}0${spec.decimals > 0 ? `.${'0'.repeat(spec.decimals)}` : ''}`;
  return [digits, spec.unit].filter(Boolean).join(' ');
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function writeNumber(value: number, spec: FormatSpec | undefined): string {
  const decimals = spec?.decimals ?? null;
  let text = decimals === null ? String(Math.round(value * 1000) / 1000) : value.toFixed(decimals);
  
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  if (!spec?.thousands) return text;
  const negative = text.startsWith('-');
  const [whole, fraction] = text.replace('-', '').split('.');
  return `${negative ? '-' : ''}${groupThousands(whole)}${fraction === undefined ? '' : `.${fraction}`}`;
}

/** The value as text, or null when there is nothing to show (no value, an empty string). */
export function formatValue(value: unknown, spec?: FormatSpec): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const parts = value.map((v) => formatValue(v, spec ? { ...spec, unit: '' } : undefined)).filter((v): v is string => v !== null);
    return parts.length === 0 ? null : withUnit(parts.join(', '), spec);
  }
  if (typeof value === 'object') return 'value' in value ? formatValue((value as { value: unknown }).value, spec) : null;
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = writeNumber(value, spec);
  } else if (typeof value === 'boolean') {
    text = value ? 'Yes' : 'No';
  } else {
    const raw = String(value).trim();
    if (raw === '') return null;
    text = spec && spec.decimals !== null && NUMERIC.test(raw) ? writeNumber(Number(raw), spec) : raw;
  }
  return withUnit(text, spec);
}

const withUnit = (text: string, spec: FormatSpec | undefined): string => (spec?.unit ? `${text} ${spec.unit}` : text);
