/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one way a number is written for people on a sheet (#269): urban
 * indicators, the site balance, schedules and quantities, level marks,
 * dimensions, room tags. The language decides the separators ("120,00" in
 * Romanian, "120.00" in English) unless the project's "Units and numbers"
 * setting (#88, `units-and-numbers.ts`) names a separator, decimals or no
 * grouping, which the caller passes in the same first argument (a
 * {@link SheetLocale}); nothing here
 * reads a global, so the screen, the PDF, the DXF and the command line agree
 * for the same project and language.
 *
 * Only for text a person reads. Numbers that a machine reads back stay in
 * their plain spelling: IFC and CSV values, DXF group codes, SVG and DXF
 * coordinates, anything that is parsed.
 *
 * Re-exported by `@bimvoice/ifcsheet/names` (which the web app already
 * resolves) and imports only the setting's own pure module.
 */

import { decimalsOf, groupingOff, intlLocaleOf, usableLocale, type NumberKind, type SheetLocale } from './units-and-numbers.js';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, digits: number, group: boolean, trim: boolean): Intl.NumberFormat {
  const key = `${locale}|${digits}|${group}|${trim}`;
  let f = formatters.get(key);
  if (!f) {
    // `negative` (no sign on a value that rounds to zero) is in every engine we run on but not in the TypeScript lib we build against.
    const options = { minimumFractionDigits: trim ? 0 : digits, maximumFractionDigits: digits, useGrouping: group, signDisplay: 'negative' };
    f = new Intl.NumberFormat(usableLocale(locale), options as Intl.NumberFormatOptions);
    formatters.set(key, f);
  }
  return f;
}

export interface SheetNumberOptions {
  /**
   * Group thousands: "1.234,50" in Romanian, "1,234.50" in English, as the
   * site balance has always printed an area, so it is the default for
   * quantities and areas. `false` for dimensions, levels and coordinates,
   * where a dot or a comma inside a figure must only ever mean the decimal.
   */
  group?: boolean;
  /** Up to `digits` decimals, no trailing zeros (a scale bar's "2,5" and "5"). */
  trim?: boolean;
  /**
   * What the figure measures. A project that sets the decimals of that kind
   * (#88) replaces `digits` with its own; without a setting, `digits` stands.
   */
  kind?: NumberKind;
}

/** `value` with exactly `digits` decimals in the locale's separators. */
export function sheetNumber(locale: SheetLocale, value: number, digits = 2, options: SheetNumberOptions = {}): string {
  const places = options.kind === undefined ? digits : decimalsOf(locale, options.kind, digits);
  // The project can turn grouping off everywhere; it cannot turn it on where a figure is never grouped (a dimension).
  const group = groupingOff(locale) ? false : options.group ?? true;
  return formatter(intlLocaleOf(locale), places, group, options.trim ?? false).format(value);
}

export interface SheetLevelOptions {
  digits?: number;
  /** The sign written for a level below zero; drawings of the dimension tool use the true minus "−". */
  minus?: string;
}

/**
 * An elevation as drawings write it: +2,70, -1,50, ±0,00. A value that
 * rounds to zero at the printed precision is ±0, whichever way it fell.
 */
export function sheetLevel(locale: SheetLocale, value: number, options: SheetLevelOptions = {}): string {
  const digits = options.digits ?? decimalsOf(locale, 'level', 2);
  const text = sheetNumber(locale, Math.abs(value), digits, { group: false });
  if (!Number.isFinite(value)) return text;
  if (Number(Math.abs(value).toFixed(digits)) === 0) return `±${sheetNumber(locale, 0, digits, { group: false })}`;
  return `${value < 0 ? options.minus ?? '-' : '+'}${text}`;
}
