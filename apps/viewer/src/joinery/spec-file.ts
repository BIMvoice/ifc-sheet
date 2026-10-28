/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading joinery specs from a project file or an imported catalogue,
 * tolerantly: every field falls back to the kind's default, unknown
 * operations become fixed glazing, an entry that is not an object (or names
 * no kind) is dropped. A catalogue file is `{ format, version, types: [...] }`.
 */

import type { JoinerySpec } from '@ifc-lite/create';
import { readJoineryList } from '@bimvoice/ifcsheet/project';

// The tolerant reader is the engine's, so `ifcsheet check --project` reads a joinery type as the app does.
export { readJoinerySpec, readJoineryList } from '@bimvoice/ifcsheet/project';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

export const JOINERY_CATALOGUE_FORMAT = 'ifc-lite-joinery-catalogue';
export const JOINERY_CATALOGUE_VERSION = 1;

export function joineryCatalogueText(specs: readonly JoinerySpec[]): string {
  return JSON.stringify({ format: JOINERY_CATALOGUE_FORMAT, version: JOINERY_CATALOGUE_VERSION, types: specs }, null, 2);
}

/** The types of a catalogue file (or a bare array of specs). */
export function parseJoineryCatalogue(text: string): JoinerySpec[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a joinery catalogue: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (Array.isArray(raw)) return readJoineryList(raw);
  if (isObject(raw) && raw.format === JOINERY_CATALOGUE_FORMAT) return readJoineryList(raw.types);
  throw new Error(`Not a joinery catalogue: expected "format": "${JOINERY_CATALOGUE_FORMAT}"`);
}
