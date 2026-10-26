/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The names the engine gives what it creates (the starting set's sheets, the
 * default views, a proposed section), in English. A name is resolved once,
 * when the item is made, and stored as plain text.
 *
 * A client that speaks another language installs its own resolver with
 * {@link setNameResolver}; the web app installs its translation catalogue
 * (`apps/viewer/src/i18n/registry.ts`), whose English and Romanian names are
 * these ({@link ENGINE_NAMES_EN}, {@link ENGINE_NAMES_RO}), so the app and a
 * command-line build that names a sheet in the same language write the same
 * text. A caller without a catalogue (the command line) names one set in a
 * language with {@link withNameLanguage}.
 *
 * Also its own entry, `@bimvoice/ifcsheet/names`: it imports nothing but the
 * pure number formatter it re-exports, so a translation catalogue can install
 * its resolver without loading the engine.
 */

export { sheetNumber, sheetLevel, type SheetNumberOptions, type SheetLevelOptions } from './sheet-number.js';
export {
  LENGTH_UNITS, NUMBER_KINDS, MAX_DECIMALS, readUnitsAndNumbers, sheetFormat, languageOf, decimalMarkOf, decimalsOf, groupingOff, lengthUnitOf, intlLocaleOf,
  type LengthUnit, type NumberKind, type UnitsAndNumbers, type SheetFormat, type SheetLocale,
} from './units-and-numbers.js';

export const ENGINE_NAMES_EN = {
  'names.project.untitled': 'Untitled project',
  'names.sheet.plans': 'Floor plans',
  'names.sheet.plansN': 'Floor plans {n}',
  'names.sheet.elevations': 'Elevations',
  'names.sheet.interiors': 'Interior elevations',
  'names.sheet.elevationsSouthNorth': 'Elevations, south and north',
  'names.sheet.elevationsEastWest': 'Elevations, east and west',
  'names.sheet.sections': 'Sections',
  'names.sheet.sectionsN': 'Sections {n}',
  'names.sheet.schedules': 'Schedules',
  'names.view.plan': 'Plan',
  'names.view.north': 'North Elevation',
  'names.view.east': 'East Elevation',
  'names.view.south': 'South Elevation',
  'names.view.west': 'West Elevation',
  'names.view.section': 'Section {mark}-{mark}',
  'names.view.detail': 'Detail {number} - {source}',
  // The starting view templates (#44), one per kind of view.
  'names.viewTemplate.plan': 'Plans',
  'names.viewTemplate.section': 'Sections',
  'names.viewTemplate.elevation': 'Elevations',
} as const;

export type EngineNameKey = keyof typeof ENGINE_NAMES_EN;

/** The same names in Romanian (terms: `apps/viewer/src/i18n/ro-glossary.md`). The app's Romanian catalogue spreads this; there is no second copy. */
export const ENGINE_NAMES_RO: Record<EngineNameKey, string> = {
  'names.project.untitled': 'Proiect fără titlu',
  'names.sheet.plans': 'Planuri',
  'names.sheet.plansN': 'Planuri {n}',
  'names.sheet.elevations': 'Fațade',
  'names.sheet.interiors': 'Fațade interioare',
  'names.sheet.elevationsSouthNorth': 'Fațade sud și nord',
  'names.sheet.elevationsEastWest': 'Fațade est și vest',
  'names.sheet.sections': 'Secțiuni',
  'names.sheet.sectionsN': 'Secțiuni {n}',
  'names.sheet.schedules': 'Tabele',
  'names.view.plan': 'Plan',
  'names.view.north': 'Fațada nord',
  'names.view.east': 'Fațada est',
  'names.view.south': 'Fațada sud',
  'names.view.west': 'Fațada vest',
  'names.view.section': 'Secțiunea {mark}-{mark}',
  'names.view.detail': 'Detaliu {number} - {source}',
  'names.viewTemplate.plan': 'Planuri',
  'names.viewTemplate.section': 'Secțiuni',
  'names.viewTemplate.elevation': 'Fațade',
};

/** The languages the engine can name a set in without a catalogue. */
export const NAME_LANGUAGES = ['en', 'ro'] as const;
export type NameLanguage = (typeof NAME_LANGUAGES)[number];

/** The language a tag names (`ro`, `en`, in any case), or undefined for anything else: the engine has names in exactly these two. */
export function nameLanguageOf(tag: string | undefined): NameLanguage | undefined {
  const exact = tag?.trim().toLowerCase();
  return (NAME_LANGUAGES as readonly string[]).includes(exact ?? '') ? (exact as NameLanguage) : undefined;
}

/** What a project file's `language` says: the language when it is `ro` or `en`, else the unaccepted text. The one validator of the app's reader and the command line's. */
export interface ProjectLanguageRead {
  language?: NameLanguage;
  /** A `language` the file records that is not one of {@link NAME_LANGUAGES}; ignored by both readers, with {@link unknownLanguageMessage}. */
  unknown?: string;
}

/** Reads `language` from a project file's value: absent, empty or not text is nothing; `ro`/`en` is the language; any other text is `unknown`. */
export function readProjectLanguage(raw: unknown): ProjectLanguageRead {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  const language = nameLanguageOf(raw);
  return language ? { language } : { unknown: raw.trim() };
}

/** The accepted values of `language` and `--locale`, as they are named in a message. */
export const NAME_LANGUAGES_TEXT = NAME_LANGUAGES.join(', ');

/** The message for a project file whose `language` is not accepted; the app's reader and the command line say the same words. */
export const unknownLanguageMessage = (value: string): string => `the project records the language "${value}", which is not one of ${NAME_LANGUAGES_TEXT}; it is ignored.`;

/** The message for a `--locale` that is not accepted. */
export const unknownLocaleMessage = (value: string): string => `--locale must be one of ${NAME_LANGUAGES_TEXT}, not "${value}".`;
export type NameParams = Record<string, string | number>;
export type NameResolver = (key: EngineNameKey, params?: NameParams) => string;

/** `key` in English, each `{param}` replaced by its value. */
export function englishName(key: EngineNameKey, params: NameParams = {}): string {
  return ENGINE_NAMES_EN[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

let resolver: NameResolver = englishName;

/** The names of `language` as a resolver, `{param}` filled in. */
export function nameResolverFor(language: NameLanguage): NameResolver {
  const names: Record<EngineNameKey, string> = language === 'ro' ? ENGINE_NAMES_RO : ENGINE_NAMES_EN;
  return (key, params = {}) => names[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * Run `run` with the engine's names in `tag`'s language, then put the installed resolver back (also when `run` throws).
 * A tag the engine has no names in gives English, the language of a project that says nothing; `undefined` leaves the
 * installed resolver alone (the app's catalogue).
 */
export function withNameLanguage<T>(tag: string | undefined, run: () => T): T {
  if (tag === undefined) return run();
  const before = resolver;
  resolver = nameResolverFor(nameLanguageOf(tag) ?? 'en');
  try {
    return run();
  } finally {
    resolver = before;
  }
}

/** Resolve the engine's names with `next`; `null` puts English back. */
export function setNameResolver(next: NameResolver | null): void {
  resolver = next ?? englishName;
}

/** The name for `key` in the installed language. */
export function nameOf(key: EngineNameKey, params?: NameParams): string {
  return resolver(key, params);
}
