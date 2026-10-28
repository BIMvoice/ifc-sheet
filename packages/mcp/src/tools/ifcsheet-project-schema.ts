/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The JSON Schema of the project file the drawing-set tools save and load (`ifcsheet://project/schema`, #165).
 *
 * Every enumeration and bound in it is read from the engine at the time the schema is built: the format name and version
 * (`PROJECT_FILE_FORMAT`, `PROJECT_FILE_VERSION`), the papers, the number series, the title block fields (`FIELD_PARAMS`), the view
 * kinds the loader accepts (`VIEW_KINDS`) and the schedule locales. The shape of the document is written out here, and
 * `ifcsheet-project-schema.test.ts` holds it to the engine's own types: it reads the property names of `ProjectDocument`,
 * `ProjectSheet`, `SheetViewport` and the view interfaces with the TypeScript compiler and fails when one is missing from the schema
 * (or the schema lists one the type no longer has), so a field added to the engine cannot be left out unnoticed.
 *
 * It describes what the tools read and write. The app's own keys (drafts, styles, issues...) are allowed and kept as they are.
 * A schema cannot say that a viewport's `viewId` names a view of the file; `ifcsheet_load_project` checks that and refuses.
 */

import { ISO_PAPERS, NUMBER_GROUPS, FIELD_PARAMS, PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, type ElevationDirection } from '@bimvoice/ifcsheet';
import { SCHEDULE_LOCALES } from './ifcsheet-draw.js';
import { SCHEDULES_KEY, VIEW_KINDS } from './ifcsheet-project-file.js';

type Schema = Record<string, unknown>;

/** The ids the schema names in `$id` and the resource that serves it. */
export const PROJECT_SCHEMA_URI = 'ifcsheet://project/schema';

const DIRECTIONS = ['north', 'south', 'east', 'west'] as const satisfies readonly ElevationDirection[];
const str: Schema = { type: 'string' };
const num: Schema = { type: 'number' };
const bool: Schema = { type: 'boolean' };
const obj: Schema = { type: 'object' };
const positive: Schema = { type: 'number', exclusiveMinimum: 0 };
const strings: Schema = { type: 'array', items: str };
const nullable = (schema: Schema): Schema => ({ anyOf: [{ type: 'null' }, schema] });

const paper: Schema = {
  description: 'An ISO A-series name ("A1"), an elongated ISO 5457 format or a custom size in millimetres.',
  anyOf: [
    { enum: [...ISO_PAPERS] },
    { type: 'object', required: ['kind', 'base', 'factor'], properties: { kind: { const: 'elongated' }, base: { enum: [...ISO_PAPERS] }, factor: positive } },
    { type: 'object', required: ['kind', 'widthMm', 'heightMm'], properties: { kind: { const: 'custom' }, widthMm: positive, heightMm: positive } },
  ],
};

const level: Schema = {
  type: 'object',
  description: 'A building level: its name, floor elevation in metres and the GlobalIds of the storeys it merges.',
  required: ['name', 'elevation', 'storeyGlobalIds'],
  properties: { name: str, elevation: num, storeyGlobalIds: strings, floorY: num },
};

const sectionPlane: Schema = {
  type: 'object',
  required: ['axis', 'offset', 'flipped'],
  properties: { axis: { enum: ['down', 'front', 'side'] }, offset: num, flipped: bool, custom: obj },
};

/** The properties every view has (`ProjectViewBase`), then the ones of its kind. */
const viewBase: Record<string, Schema> = {
  id: str, name: str, auto: bool, createdAt: num, viewDepth: nullable(num), showHidden: bool, detail: obj, graphics: obj, templateId: str, scale: positive, hiddenLayers: strings,
};

/** A view of `kind` must have `required` (written without if/then: a view of another kind passes). */
const kindNeeds = (kind: string, required: string[]): Schema => ({ anyOf: [{ not: { properties: { kind: { const: kind } }, required: ['kind'] } }, { required }] });

const view: Schema = {
  type: 'object',
  description: 'A view of the model: a plan, section, elevation, 3D (axonometric) view or a drafting view with no model behind it.',
  required: ['id', 'name', 'kind'],
  properties: {
    ...viewBase,
    kind: { enum: [...VIEW_KINDS] },
    level, cutHeight: num, site: { const: true }, discipline: { enum: ['structural', 'foundation', 'roof'] }, reflected: bool,
    plane: sectionPlane, through: str,
    direction: { enum: [...DIRECTIONS] }, planeOffset: num, interior: obj,
    viewpoint: nullable(obj), projection: { enum: ['axonometric', 'perspective'] }, preset: { enum: ['se', 'sw', 'ne', 'nw'] }, raster: nullable(obj), shaded: bool, cutaway: obj,
    number: num,
  },
  allOf: [
    kindNeeds('plan', ['level', 'cutHeight']),
    kindNeeds('section', ['plane']),
    kindNeeds('elevation', ['direction']),
    kindNeeds('3d', ['viewpoint']),
  ],
};

const viewport: Schema = {
  type: 'object',
  description: 'A view placed on a sheet. x and y are the viewport centre in paper millimetres from the sheet\'s top-left; scale is the denominator (100 is 1:100). viewId must name a view of the file.',
  required: ['viewId', 'x', 'y', 'scale'],
  properties: {
    id: str, viewId: str, x: num, y: num, scale: positive, width: { type: 'number', minimum: 0 }, height: { type: 'number', minimum: 0 }, center: nullable({ type: 'object', required: ['x', 'y'], properties: { x: num, y: num } }),
    hiddenLayers: strings, page: { type: 'integer', minimum: 0 }, placed: bool, placedPages: { type: 'array', items: obj }, keyPlanOf: str, drawingNumber: str,
  },
};

const sheet: Schema = {
  type: 'object',
  required: ['id', 'number', 'name'],
  properties: {
    id: str, number: { type: 'string', minLength: 1 }, autoNumber: bool, numberOverride: bool, series: { enum: [...NUMBER_GROUPS] }, name: str, createdAt: num, paper,
    orientation: { enum: ['landscape', 'portrait'] }, frame: obj, templateId: str, viewports: { type: 'array', items: viewport },
    titleBlock: { type: 'object', additionalProperties: str }, revisionIds: strings, titleBlockParams: { type: 'object', additionalProperties: str }, notes: strings,
  },
};

const groupPattern: Schema = {
  type: 'object', required: ['prefix', 'separator', 'start', 'digits', 'step'],
  properties: { prefix: str, separator: str, start: { type: 'integer' }, digits: { type: 'integer', minimum: 1 }, step: { type: 'integer', minimum: 1 } },
};

const numbering: Schema = {
  type: 'object', required: ['discipline', 'continuous', 'groups'],
  properties: { discipline: str, continuous: bool, groups: { type: 'object', properties: Object.fromEntries(NUMBER_GROUPS.map((g) => [g, groupPattern])) } },
};

const schedule: Schema = {
  type: 'object',
  description: 'A schedule printed on a sheet of its own; its rows are read from the model each time the set is drawn.',
  required: ['kind', 'sheetId', 'locale'],
  properties: { id: str, kind: { enum: ['rooms', 'boq', 'list'] }, sheetId: str, locale: { enum: [...SCHEDULE_LOCALES] }, boqArticles: { type: 'array', items: obj }, classificationMappings: { type: 'array', items: obj }, list: obj, name: str },
};

/** The JSON Schema (draft 2020-12) of an IfcSheet project file. */
export function projectSchema(): Schema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: PROJECT_SCHEMA_URI,
    title: 'IfcSheet project file (.ifclite-project.json)',
    description:
      'The project document ifcsheet_save_project writes and ifcsheet_load_project reads, and ifcsheet://session/project shows: the views of the model, the sheets they hang on, the title block and the numbering. ' +
      'Keys the app adds (drafts, styles, issues) are allowed and kept. A viewport\'s viewId must name a view in "views"; a schema cannot say so, and ifcsheet_load_project refuses a file where it does not.',
    type: 'object',
    required: ['format', 'version', 'views', 'sheets'],
    properties: {
      format: { const: PROJECT_FILE_FORMAT },
      version: { type: 'integer', minimum: 1, maximum: PROJECT_FILE_VERSION, description: 'A newer version than this build reads is refused.' },
      savedAt: { type: 'string', description: 'When the file was written (ISO time); set by ifcsheet_save_project.' },
      name: { type: 'string', description: 'The project name printed in the title blocks.' },
      models: { type: 'array', items: { type: 'object', required: ['key', 'name'], properties: { key: str, name: str, role: { enum: ['host', 'linked'] }, drawStyle: { enum: ['normal', 'halftone'] } } } },
      views: { type: 'array', items: view },
      sheets: { type: 'array', items: sheet },
      titleBlock: {
        type: 'object',
        description: `Title block fields every sheet prints; a sheet's own titleBlock wins. Known fields: ${Object.keys(FIELD_PARAMS).join(', ')}. date is ISO, YYYY-MM-DD.`,
        properties: Object.fromEntries(Object.keys(FIELD_PARAMS).map((k) => [k, str])),
        additionalProperties: str,
      },
      titleBlockSources: { type: 'object', description: 'Where each title block field reads its value in the IFC, by field id (an attribute, a property, the OwnerHistory or an actor with a role); a field not listed reads its default, a typed field always wins.', additionalProperties: { type: 'array', items: obj } },
      revisions: { type: 'array', description: 'The set\'s revisions, oldest first; a sheet\'s title block prints the latest it has (named by revisionIds, or by a revision cloud on it).', items: obj },
      drafts: { type: 'array', description: 'Drafted shapes; the title block reads only the revision clouds among them.', items: obj },
      titleBlockTemplate: obj,
      titleBlockParams: { type: 'array', items: obj },
      sheetTemplates: { type: 'array', items: obj },
      viewTemplates: { type: 'array', items: obj },
      seriesTemplates: obj,
      sheetNumbering: numbering,
      includeFarElements: bool,
      handoverPattern: str,
      unitsAndNumbers: obj,
      underlays: { type: 'array', description: 'Raster underlays (a scanned PDF page or an image) placed under views to trace: view, picture (PNG/JPEG data URL), centre, metres per pixel, rotation, opacity, lock, and the sheets they print on.', items: obj },
      language: { type: 'string', enum: ['en', 'ro'], description: 'The language (ro or en) the generated names (sheets, views) were made in; the app and a command-line build name a new sheet, view or set in it. Any other value is ignored.' },
      [SCHEDULES_KEY]: { type: 'array', items: schedule, description: 'The schedule sheets of the set (room schedule, bill of quantities, list from the Lists engine).' },
    },
    additionalProperties: true,
  };
}
