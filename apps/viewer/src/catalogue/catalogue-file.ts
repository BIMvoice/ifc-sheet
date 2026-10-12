/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The catalogue file (`.bvlib`): the reusable definitions of a project —
 * layers and layer groups, text and dimension styles, hatch patterns,
 * materials with their drawing settings, annotation types, symbols and
 * legend configurations — to export from one project and import into
 * another. Read strictly: a wrong format, an unknown version or a malformed
 * entry fails with the path of the problem rather than half-loading.
 */

import { readDraftLayer } from '@/drafting/draft-file';
import type { DimStyle, LayerGroup, TextStyle } from '@/drafting/styles';
import type { DraftLayer } from '@/drafting/types';
import { readMaterial } from '@/project/project-file';
import { readStandards } from '@/project/standards-file';
import type { ProjectMaterial } from '@/project/types';
import { fail, readAnnotationType, readLegend, readList, readSymbol } from './readers';
import type { AnnotationType, DraftSymbol, ProjectLegend } from './types';

export const CATALOGUE_FILE_SUFFIX = '.bvlib';
export const CATALOGUE_FILE_FORMAT = 'bvlib';
export const CATALOGUE_FILE_VERSION = 1;

/** The kinds of definition a catalogue carries, in the order the dialog lists them. */
export const CATALOGUE_KINDS = ['layers', 'textStyles', 'dimStyles', 'hatchPatterns', 'materials', 'annotationTypes', 'symbols', 'legends'] as const;
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];

export interface Catalogue {
  layers: DraftLayer[];
  layerGroups: LayerGroup[];
  textStyles: TextStyle[];
  dimStyles: DimStyle[];
  /** User hatch patterns as `.pat` text. */
  hatchPatterns: string;
  materials: ProjectMaterial[];
  annotationTypes: AnnotationType[];
  symbols: DraftSymbol[];
  /** Legend configurations; a legend's `scopeId` is project-specific and never travels. */
  legends: ProjectLegend[];
}

export interface CatalogueFile extends Catalogue {
  format: typeof CATALOGUE_FILE_FORMAT;
  version: typeof CATALOGUE_FILE_VERSION;
  name: string;
  savedAt: string;
}

export const emptyCatalogue = (): Catalogue => ({
  layers: [], layerGroups: [], textStyles: [], dimStyles: [], hatchPatterns: '', materials: [], annotationTypes: [], symbols: [], legends: [],
});

/** `catalogue` cut down to the chosen kinds (layer groups travel with their layers, text styles with the dimension styles that need them). */
export function selectKinds(catalogue: Catalogue, kinds: ReadonlySet<CatalogueKind>): Catalogue {
  const out = emptyCatalogue();
  if (kinds.has('layers')) { out.layers = catalogue.layers; out.layerGroups = catalogue.layerGroups; }
  if (kinds.has('textStyles')) out.textStyles = catalogue.textStyles;
  if (kinds.has('dimStyles')) out.dimStyles = catalogue.dimStyles;
  if (kinds.has('hatchPatterns')) out.hatchPatterns = catalogue.hatchPatterns;
  if (kinds.has('materials')) out.materials = catalogue.materials;
  if (kinds.has('annotationTypes')) out.annotationTypes = catalogue.annotationTypes;
  if (kinds.has('symbols')) out.symbols = catalogue.symbols;
  if (kinds.has('legends')) out.legends = catalogue.legends.map(({ scopeId: _scopeId, ...rest }) => rest);
  return out;
}

export function serializeCatalogue(catalogue: Catalogue, name: string, now = new Date()): string {
  const file: CatalogueFile = { format: CATALOGUE_FILE_FORMAT, version: CATALOGUE_FILE_VERSION, name, savedAt: now.toISOString(), ...catalogue };
  return JSON.stringify(file, null, 2);
}

const WHAT = 'library file';

/** Parse and validate a catalogue file's text. Throws with the first problem found. */
export function parseCatalogue(text: string): { name: string; catalogue: Catalogue } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a ${WHAT}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('/', 'must be an object', WHAT);
  const file = raw as Record<string, unknown>;
  if (file.format !== CATALOGUE_FILE_FORMAT) fail('/format', `must be "${CATALOGUE_FILE_FORMAT}"`, WHAT);
  if (file.version !== CATALOGUE_FILE_VERSION) {
    const newer = typeof file.version === 'number' && file.version > CATALOGUE_FILE_VERSION;
    fail('/version', `${String(file.version)} is not supported (expected ${CATALOGUE_FILE_VERSION})${newer ? '; it was made by a newer version of the app' : ''}`, WHAT);
  }
  // The style readers are the project file's own, so the two files agree on what a style is. Each entry
  // must at least be { id, name }; the Standard style the reader always adds is not part of the file.
  const standards = readStandards(file);
  const named = (key: string) => new Set(readList(file, key, (v, p) => {
    if (typeof v !== 'object' || v === null || typeof (v as { id?: unknown }).id !== 'string' || typeof (v as { name?: unknown }).name !== 'string') fail(p, 'must be a style { id, name }', WHAT);
    return (v as { id: string }).id;
  }, WHAT));
  const textIds = named('textStyles');
  const dimIds = named('dimStyles');
  const groupIds = new Set(readList(file, 'layerGroups', (v, p) => {
    if (typeof v !== 'object' || v === null || typeof (v as { id?: unknown }).id !== 'string') fail(p, 'must be a layer group { id, name }', WHAT);
    return (v as { id: string }).id;
  }, WHAT));
  return {
    name: typeof file.name === 'string' && file.name.trim() ? file.name : 'Catalogue',
    catalogue: {
      layers: readList(file, 'layers', (v, p) => readDraftLayer(v, p), WHAT),
      layerGroups: standards.layerGroups.filter((g) => groupIds.has(g.id)),
      textStyles: standards.textStyles.filter((t) => textIds.has(t.id)),
      dimStyles: standards.dimStyles.filter((d) => dimIds.has(d.id)),
      hatchPatterns: typeof file.hatchPatterns === 'string' ? file.hatchPatterns : '',
      materials: readList(file, 'materials', (v, p) => readMaterialStrict(v, p), WHAT),
      annotationTypes: readList(file, 'annotationTypes', (v, p) => readAnnotationType(v, p, WHAT), WHAT),
      symbols: readList(file, 'symbols', (v, p) => readSymbol(v, p, WHAT), WHAT),
      legends: readList(file, 'legends', (v, p) => readLegend(v, p, WHAT), WHAT),
    },
  };
}

function readMaterialStrict(v: unknown, path: string): ProjectMaterial {
  const [m] = readMaterial(v);
  return m ?? fail(path, 'must be a material { id, name }', WHAT);
}
