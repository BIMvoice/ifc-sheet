/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every field of the project document, once, one per line (#144). A new field is one line here (its own
 * `fields/<key>.ts` when it needs more than `listField`, `recordField` or `optionalField`); a field added to
 * `ProjectDocument` and not listed here does not compile (`MissingField` below).
 *
 * ORDER IS THE FILE'S KEY ORDER: `serializeProject` writes the document's keys in this order, so a new
 * field goes at the end and an existing one does not move (`fields.test.ts` pins the order of the ones
 * listed when the registry was made).
 */
import { DEFAULT_JOINERY_MAPPING } from '@/joinery/symbol-mapping';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { upgradeTagAllTypes } from '@/tagall/types';
import { readHandoverPattern } from '@bimvoice/ifcsheet/handover';
import type { ProjectDocument } from '../types';
import { defineField, listField, optionalField, recordField, type DocumentField, type FieldKey } from './define';

export const DEFAULT_DRAFT_LAYER = { id: '0', name: '0', color: '#18181b', visible: true, locked: false } as const;

const DOCUMENT_FIELD_DEFS = [
  // The core document. Its special load steps stay in `loadProjectDocument` (default views, layer 0).
  defineField({ key: 'name', empty: () => 'Untitled project' }),
  defineField({ key: 'models', empty: () => [] }),
  defineField({ key: 'views', empty: () => [] }),
  defineField({ key: 'sheets', empty: () => [] }),
  defineField({ key: 'titleBlock', empty: () => ({}), fallback: () => ({}) }),
  defineField({ key: 'drafts', empty: () => [] }),
  defineField({ key: 'draftLayers', empty: () => [{ ...DEFAULT_DRAFT_LAYER }] }),
  defineField({ key: 'hatchPatterns', empty: () => '', fallback: () => '' }),
  recordField('symbolFlips'),
  defineField({ key: 'openingLines', fallback: () => 'handle' as const, load: (v) => v ?? 'handle' }),
  defineField({ key: 'textStyles', empty: () => [{ ...DEFAULT_TEXT_STYLE }], fallback: () => [], load: (v) => (v?.length ? v : [{ ...DEFAULT_TEXT_STYLE }]) }),
  defineField({ key: 'dimStyles', empty: () => [{ ...DEFAULT_DIM_STYLE }], fallback: () => [], load: (v) => (v?.length ? v : [{ ...DEFAULT_DIM_STYLE }]) }),
  listField('layerGroups'),
  listField('joineryTypes'),
  recordField('currentJoinery'),
  listField('schedules'),
  defineField({ key: 'joineryMapping', empty: () => ({ ...DEFAULT_JOINERY_MAPPING }), fallback: () => ({ ...DEFAULT_JOINERY_MAPPING }), load: (v) => v ?? { ...DEFAULT_JOINERY_MAPPING } }),
  listField('elementTypes'),
  recordField('currentTypes'),
  listField('structureProfiles'),
  listField('civilDrawings'),
  listField('typicalSections'),
  listField('materials'),
  listField('savedSectionCuts'),
  // A project made before the room label read the tag name takes the new template (`tagall/types.ts`).
  defineField({ key: 'annotationTypes', empty: () => [], fallback: () => [], load: (v) => upgradeTagAllTypes(v ?? []) }),
  listField('symbols'),
  listField('legends'),
  listField('issues'),
  optionalField('modelState'),
  listField('cadLayers'),
  listField('details'),
  optionalField('tagFields'),
  listField('sheetTemplates'),
  recordField('seriesTemplates'),
  optionalField('titleBlockSources'),
  optionalField('titleBlockParams'),
  optionalField('titleBlockTemplate'),
  optionalField('sheetNumbering'),
  optionalField('phaseSource'),
  // Loaded through `knownGraphicStandard` in `loadProjectDocument`, which also warns about an unknown one.
  defineField({ key: 'graphicStandard', empty: () => undefined }),
  listField('comments'),
  listField('revisions'),
  optionalField('siteArea'),
  optionalField('urbanSettings'),
  // Off is stored as absent, so a project that never touched it saves exactly as before.
  defineField({ key: 'includeFarElements', empty: () => undefined, load: (v) => (v === true ? true : undefined) }),
  // Absent is the default pattern (`@bimvoice/ifcsheet/handover`); a value that is not usable loads as absent.
  defineField({ key: 'handoverPattern', empty: () => undefined, load: (v) => readHandoverPattern(v) }),
  // The project's view templates (#44): named graphics that views follow by `templateId`.
  listField('viewTemplates'),
  listField('boqArticles'),
] as const satisfies readonly DocumentField<FieldKey>[];

type ListedField = (typeof DOCUMENT_FIELD_DEFS)[number]['key'];
/** A `ProjectDocument` field with no entry above; must stay `never`. */
type MissingField = Exclude<FieldKey, ListedField>;
const complete: [MissingField] extends [never] ? true : MissingField = true;
void complete;

/** Every field of `ProjectDocument`, in file order. */
export const DOCUMENT_FIELDS: readonly DocumentField<FieldKey>[] = DOCUMENT_FIELD_DEFS;

/** A new project: every field that has an `empty` value, in file order. */
export function emptyDocument(): ProjectDocument {
  const doc: Record<string, unknown> = {};
  for (const field of DOCUMENT_FIELDS) if (field.empty) doc[field.key] = field.empty();
  return doc as unknown as ProjectDocument;
}

/** What `loadProjectDocument` stores for each field that has a `load` step, read from `doc`. */
export function loadedFields(doc: ProjectDocument): Partial<ProjectDocument> {
  const out: Record<string, unknown> = {};
  for (const field of DOCUMENT_FIELDS) if (field.load) out[field.key] = field.load(doc[field.key]);
  return out as Partial<ProjectDocument>;
}
