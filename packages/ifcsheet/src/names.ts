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
 * (`apps/viewer/src/i18n/registry.ts`), whose English names are these.
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
} as const;

export type EngineNameKey = keyof typeof ENGINE_NAMES_EN;
export type NameParams = Record<string, string | number>;
export type NameResolver = (key: EngineNameKey, params?: NameParams) => string;

/** `key` in English, each `{param}` replaced by its value. */
export function englishName(key: EngineNameKey, params: NameParams = {}): string {
  return ENGINE_NAMES_EN[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

let resolver: NameResolver = englishName;

/** Resolve the engine's names with `next`; `null` puts English back. */
export function setNameResolver(next: NameResolver | null): void {
  resolver = next ?? englishName;
}

/** The name for `key` in the installed language. */
export function nameOf(key: EngineNameKey, params?: NameParams): string {
  return resolver(key, params);
}
