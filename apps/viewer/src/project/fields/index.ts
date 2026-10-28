/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every field of the project document, once, one per line (#144): its empty value, what is written and loaded
 * for it, and how the file reader reads it (`read`). A new field is one entry here (its own `fields/<key>.ts` when it
 * needs more than a line); a field added to `ProjectDocument` and not listed here, or listed without a reader, does
 * not compile (`MissingField` below, `read` in `./define.ts`).
 *
 * A NEW FIELD is three files and one pair of lines (#144):
 *   - `fields/<key>.ts`: the field (`listField`, `optionalField`, ...), its reader, and its type, declared with
 *     `declare module '../types' { interface ProjectFieldTypes { <key>?: ... } }` (see `./site-area.ts`);
 *   - `fields/<key>.sample.ts`: `export const sample = { <key>: <a value that is not the default> }`, which
 *     `project-roundtrip.test.ts` puts in its full project (see `./site-area.sample.ts`);
 *   - its import and its entry at the END of the list below. That pair is the one shared edit left: two PRs that both
 *     append here still meet at the last line. The fields not yet moved to a file of their own keep their type in
 *     `../types.ts` and their sample in `project-roundtrip.test.ts`; move one when you next touch it.
 *
 * ORDER IS THE FILE'S KEY ORDER: `serializeProject` writes the document's keys in this order, so a new
 * field goes at the end and an existing one does not move (`fields.test.ts` pins the order of the ones
 * listed when the registry was made).
 */
import { readLibraryDetail } from '@/catalogue/detail-reader';
import { readAnnotationType, readLegend, readList, readSymbol } from '@/catalogue/readers';
import { readDraft, readDraftLayer } from '@/drafting/draft-file';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { readCurrentTypes, readElementTypeList } from '@/element-types/spec';
import { resolve } from '@/i18n/registry';
import { readIssues } from './issues-read';
import { readJoineryList } from '@/joinery/spec-file';
import { DEFAULT_JOINERY_MAPPING, readJoineryMapping } from '@/joinery/symbol-mapping';
import { upgradeTagAllTypes } from '@/tagall/types';
import { readTagFields } from '@/tagfields/tag-fields-file';
import { readSnapshot } from '@/whatchanged/snapshot-file';
import { readSchedule } from '@bimvoice/ifcsheet';
import { readStructureProfileList } from '@ifc-lite/create';
import { readCadLayerRule } from '../cad-layers-file';
import { readNumberingScheme } from '../numbering';
import { readMaterial } from '@bimvoice/ifcsheet/materials';
import { isString, listAt, readCivilDrawing, readCurrentJoinery, readFlips, readModel, readSheet, readTypicalSection, readView, type Json } from '../project-read';
import { readSavedSectionCuts } from '../saved-cuts-file';
import { readTitleBlock } from '../sheet-file';
import { readSeriesTemplates, readTemplate } from '../sheet-templates';
import { readDimStyles, readGraphicStandard, readLayerGroups, readTextStyles } from '../standards-file';
import { readTitleBlockParams, readTitleBlockTemplate } from '../title-block-file';
import { readTitleSources } from '../title-block-sources';
import type { ProjectDocument } from '../types';
import { readPhaseSource } from '../view-graphics-file';
import { readViewTemplates } from '../view-templates-file';
import { boqArticlesField } from './boq-articles';
import { installedStandardField } from './installed-standard';
import { classificationMappingsField } from './classification-mappings';
import { commentsField } from './comments';
import { handoverPatternField } from './handover-pattern';
import { includeFarElementsField } from './include-far-elements';
import { languageField } from './language';
import { revisionsField } from './revisions';
import { germanyLandField, germanyPermitField } from './germany-permit';
import { norwayPermitField } from './norway-permit';
import { pacInterventionField } from './pac-intervention';
import { pacModeField } from './pac-mode';
import { siteAreaField } from './site-area';
import { underlaysField } from './underlays';
import { unitsAndNumbersField } from './units-and-numbers';
import { urbanSettingsField } from './urban-settings';
import { defineField, listField, optionalField, recordField, whenPresent, whenUsable, type DocumentField, type FieldKey } from './define';
import { READ_ORDER } from './read-order';

export const DEFAULT_DRAFT_LAYER = { id: '0', name: '0', color: '#18181b', visible: true, locked: false } as const;

const at = <T,>(raw: Json, key: string, read: (v: unknown, path: string) => T): T[] => listAt(raw, key).map((v, i) => read(v, `/${key}/${i}`));
const flat = <T,>(raw: Json, key: string, read: (v: unknown) => T[]): T[] => listAt(raw, key).flatMap((v) => read(v));

const DOCUMENT_FIELD_DEFS = [
  // The core document. Its special load steps stay in `loadProjectDocument` (default views, layer 0).
  defineField({ key: 'name', empty: () => 'Untitled project', read: (raw) => ({ name: isString(raw.name) && raw.name.trim() ? raw.name : resolve('names.project.untitled') }) }),
  defineField({ key: 'models', empty: () => [], read: (raw) => ({ models: at(raw, 'models', readModel) }) }),
  defineField({ key: 'views', empty: () => [], read: (raw) => ({ views: at(raw, 'views', readView) }) }),
  defineField({ key: 'sheets', empty: () => [], read: (raw) => ({ sheets: at(raw, 'sheets', readSheet) }) }),
  // Absent in a file saved before the title block was the project's (`liftSheetTitleBlocks` fills it on load).
  defineField({ key: 'titleBlock', empty: () => ({}), fallback: () => ({}), read: whenPresent('titleBlock', (v) => readTitleBlock(v) ?? {}) }),
  defineField({ key: 'drafts', empty: () => [], read: (raw) => ({ drafts: at(raw, 'drafts', readDraft) }) }),
  defineField({ key: 'draftLayers', empty: () => [{ ...DEFAULT_DRAFT_LAYER }], read: (raw) => ({ draftLayers: at(raw, 'draftLayers', readDraftLayer) }) }),
  defineField({ key: 'hatchPatterns', empty: () => '', fallback: () => '', read: (raw) => ({ hatchPatterns: isString(raw.hatchPatterns) ? raw.hatchPatterns : '' }) }),
  recordField('symbolFlips', (raw) => readFlips(raw.symbolFlips)),
  defineField({ key: 'openingLines', fallback: () => 'handle' as const, load: (v) => v ?? 'handle', read: (raw) => (raw.openingLines === 'hinge' || raw.openingLines === 'handle' ? { openingLines: raw.openingLines } : {}) }),
  defineField({ key: 'textStyles', empty: () => [{ ...DEFAULT_TEXT_STYLE }], fallback: () => [], load: (v) => (v?.length ? v : [{ ...DEFAULT_TEXT_STYLE }]), read: (raw) => ({ textStyles: readTextStyles(raw) }) }),
  defineField({ key: 'dimStyles', empty: () => [{ ...DEFAULT_DIM_STYLE }], fallback: () => [], load: (v) => (v?.length ? v : [{ ...DEFAULT_DIM_STYLE }]), read: (raw) => ({ dimStyles: readDimStyles(raw) }) }),
  listField('layerGroups', readLayerGroups),
  listField('joineryTypes', (raw) => readJoineryList(raw.joineryTypes)),
  recordField('currentJoinery', (raw) => readCurrentJoinery(raw.currentJoinery)),
  listField('schedules', (raw) => listAt(raw, 'schedules').flatMap((v) => readSchedule(v) ?? [])),
  defineField({ key: 'joineryMapping', empty: () => ({ ...DEFAULT_JOINERY_MAPPING }), fallback: () => ({ ...DEFAULT_JOINERY_MAPPING }), load: (v) => v ?? { ...DEFAULT_JOINERY_MAPPING }, read: whenPresent('joineryMapping', readJoineryMapping) }),
  listField('elementTypes', (raw) => readElementTypeList(raw.elementTypes)),
  recordField('currentTypes', (raw) => readCurrentTypes(raw.currentTypes)),
  listField('structureProfiles', (raw) => readStructureProfileList(raw.structureProfiles)),
  listField('civilDrawings', (raw) => flat(raw, 'civilDrawings', readCivilDrawing)),
  listField('typicalSections', (raw) => flat(raw, 'typicalSections', readTypicalSection)),
  listField('materials', (raw) => flat(raw, 'materials', readMaterial)),
  listField('savedSectionCuts', (raw) => flat(raw, 'savedSectionCuts', readSavedSectionCuts)),
  // A project made before the room label read the tag name takes the new template (`tagall/types.ts`).
  defineField({ key: 'annotationTypes', empty: () => [], fallback: () => [], load: (v) => upgradeTagAllTypes(v ?? []), read: (raw) => ({ annotationTypes: readList(raw, 'annotationTypes', readAnnotationType) }) }),
  listField('symbols', (raw) => readList(raw, 'symbols', readSymbol)),
  listField('legends', (raw) => readList(raw, 'legends', readLegend)),
  listField('issues', (raw) => readIssues(raw.issues)),
  optionalField('modelState', whenPresent('modelState', (v) => readSnapshot(v, '/modelState'))),
  listField('cadLayers', (raw) => at(raw, 'cadLayers', readCadLayerRule)),
  listField('details', (raw) => readList(raw, 'details', readLibraryDetail)),
  optionalField('tagFields', whenPresent('tagFields', (v) => readTagFields(v, '/tagFields'))),
  listField('sheetTemplates', (raw) => listAt(raw, 'sheetTemplates').flatMap((v) => readTemplate(v) ?? [])),
  recordField('seriesTemplates', (raw) => readSeriesTemplates(raw.seriesTemplates)),
  optionalField('titleBlockSources', whenUsable('titleBlockSources', readTitleSources)),
  optionalField('titleBlockParams', whenUsable('titleBlockParams', readTitleBlockParams)),
  optionalField('titleBlockTemplate', whenUsable('titleBlockTemplate', readTitleBlockTemplate)),
  optionalField('sheetNumbering', whenPresent('sheetNumbering', readNumberingScheme)),
  optionalField('phaseSource', whenUsable('phaseSource', readPhaseSource)),
  // Loaded through `knownGraphicStandard` in `loadProjectDocument`, which also warns about an unknown one.
  defineField({ key: 'graphicStandard', empty: () => undefined, read: (raw) => { const standard = readGraphicStandard(raw); return standard ? { graphicStandard: standard } : {}; } }),
  commentsField,
  revisionsField,
  siteAreaField,
  urbanSettingsField,
  // Off is stored as absent, so a project that never touched it saves exactly as before.
  includeFarElementsField,
  // Absent is the default pattern (`@bimvoice/ifcsheet/handover`); a value that is not usable loads as absent.
  handoverPatternField,
  // The project's view templates (#44): named graphics that views follow by `templateId`.
  listField('viewTemplates', (raw) => readViewTemplates(raw.viewTemplates)),
  boqArticlesField,
  // The project's units and number format (#88); absent follows the language and each drawing's own style, so an old project saves as it was.
  unitsAndNumbersField,
  // The office's classification mappings (#89).
  classificationMappingsField,
  // The standards pack installed in the project and the values it replaced (#365); absent: none.
  installedStandardField,
  // The language the generated names were made in (set when the starting set is made); absent: not recorded.
  languageField,
  // The works the permit project is for (#364); absent: a new building.
  pacInterventionField,
  // The project is a Norwegian building application (#372); absent: it is not.
  norwayPermitField,
  // The project is a German building application, and in which Land (#372); absent: it is not, none chosen.
  germanyPermitField,
  germanyLandField,
  // Which permit project: the full one or the simplified one for a rural house (#364); absent: the full one.
  pacModeField,
  // PDF pages and images under views, to trace over (#457); absent: none.
  underlaysField,
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

const rank = (key: string) => {
  const at = READ_ORDER.indexOf(key);
  return at < 0 ? READ_ORDER.length : at;
};

/** The fields in the order the file reader reads them (`./read-order.ts`); a new field comes last, in registry order. */
export const FIELDS_IN_READ_ORDER: readonly DocumentField<FieldKey>[] = [...DOCUMENT_FIELDS].sort((a, b) => rank(a.key) - rank(b.key));

/** What each field reads from a project file's object, put together in read order. Throws on the first field the file got wrong. */
export function readDocumentFields(raw: Json): ProjectDocument {
  const doc: Record<string, unknown> = {};
  for (const field of FIELDS_IN_READ_ORDER) Object.assign(doc, field.read(raw));
  return doc as unknown as ProjectDocument;
}
