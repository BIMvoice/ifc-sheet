/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's "Units and numbers" setting (#88): the length unit dimensions
 * are written in, the decimals of each kind of figure, the decimal separator
 * and whether thousands are grouped. It is stored in the project file
 * (`unitsAndNumbers`), read here, and handed to the one sheet formatter
 * (`sheet-number.ts`) as part of its first argument, a {@link SheetLocale}:
 * the language alone (a plain string) or the language together with the
 * project's setting ({@link SheetFormat}). Nothing here reads a global, so the
 * app, the PDF, the DXF and the command line write the same figure for the
 * same project.
 *
 * Every field is optional and absent means "as before": no setting, or one
 * with nothing set, gives the plain language string back, so a project that
 * never touched it prints byte for byte what it printed.
 *
 * Area is always m² and volume m³ for now; they are not settings.
 */

export const LENGTH_UNITS = ['mm', 'cm', 'm'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** The kinds of figure a sheet prints with a number of decimals of their own. */
export const NUMBER_KINDS = ['length', 'area', 'volume', 'level'] as const;
export type NumberKind = (typeof NUMBER_KINDS)[number];

export const MAX_DECIMALS = 6;

/** The stored setting. A field that is absent follows the language and the drawing's own style, as before. */
export interface UnitsAndNumbers {
  /** The unit a dimension is written in, over the unit of its dimension style. */
  lengthUnit?: LengthUnit;
  /** Decimals per kind of figure, over the places the figure's style or table gives it. */
  decimals?: Partial<Record<NumberKind, number>>;
  /** The decimal separator; absent follows the interface language. */
  separator?: 'comma' | 'point';
  /** `false` writes no thousands grouping anywhere; absent keeps it where it has always been (areas and quantities). */
  group?: false;
}

/** The language together with the project's setting; what the formatter takes when a project sets anything. */
export interface SheetFormat extends UnitsAndNumbers {
  locale: string;
}

/** What every figure formatter takes: a language (`"ro"`), or a language with the project's setting. */
export type SheetLocale = string | SheetFormat;

/** A locale Intl rejects falls back to English instead of throwing in the middle of a drawing. */
export function usableLocale(locale: string): string {
  try {
    Intl.getCanonicalLocales(locale);
    return locale;
  } catch {
    return 'en';
  }
}

/** A setting read from a project file: what is not a valid field is dropped; undefined when nothing is left. */
export function readUnitsAndNumbers(raw: unknown): UnitsAndNumbers | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: UnitsAndNumbers = {};
  if (typeof r.lengthUnit === 'string' && (LENGTH_UNITS as readonly string[]).includes(r.lengthUnit)) out.lengthUnit = r.lengthUnit as LengthUnit;
  if (typeof r.decimals === 'object' && r.decimals !== null && !Array.isArray(r.decimals)) {
    const d = r.decimals as Record<string, unknown>;
    const decimals: Partial<Record<NumberKind, number>> = {};
    for (const kind of NUMBER_KINDS) {
      const v = d[kind];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_DECIMALS) decimals[kind] = v;
    }
    if (Object.keys(decimals).length) out.decimals = decimals;
  }
  if (r.separator === 'comma' || r.separator === 'point') out.separator = r.separator;
  if (r.group === false) out.group = false;
  return Object.keys(out).length ? out : undefined;
}

/** The language alone when the setting sets nothing (so a project that never touched it is unchanged), else the language with the setting. */
export function sheetFormat(locale: string, units: UnitsAndNumbers | undefined): SheetLocale {
  const set = readUnitsAndNumbers(units);
  return set ? { locale, ...set } : locale;
}

/** The interface language of a {@link SheetLocale}, for anything that is not a figure. */
export const languageOf = (locale: SheetLocale): string => (typeof locale === 'string' ? locale : locale.locale);

function commaDecimal(locale: string): boolean {
  return new Intl.NumberFormat(usableLocale(locale)).format(1.5).includes(',');
}

/** The locale Intl writes the figure in: the language's own, unless the setting names a separator the language does not use. */
export function intlLocaleOf(locale: SheetLocale): string {
  if (typeof locale === 'string') return locale;
  if (locale.separator === undefined) return locale.locale;
  const wantComma = locale.separator === 'comma';
  // Romanian and English are the two the product ships; their grouping mark is the other character, as a sheet reads it.
  return commaDecimal(locale.locale) === wantComma ? locale.locale : wantComma ? 'ro' : 'en';
}

/** The decimal mark a figure is written with ("," or "."). */
export const decimalMarkOf = (locale: SheetLocale): ',' | '.' => (commaDecimal(intlLocaleOf(locale)) ? ',' : '.');

/** The decimals of `kind`: the project's, else `fallback`. */
export function decimalsOf(locale: SheetLocale, kind: NumberKind, fallback: number): number {
  return (typeof locale === 'string' ? undefined : locale.decimals?.[kind]) ?? fallback;
}

/** The unit a dimension is written in: the project's, else `fallback` (the dimension style's). */
export function lengthUnitOf(locale: SheetLocale, fallback: LengthUnit): LengthUnit {
  return (typeof locale === 'string' ? undefined : locale.lengthUnit) ?? fallback;
}

/** Whether the setting turns thousands grouping off everywhere. */
export const groupingOff = (locale: SheetLocale): boolean => typeof locale !== 'string' && locale.group === false;
