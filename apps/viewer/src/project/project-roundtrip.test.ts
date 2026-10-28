/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A project filled with one of everything survives save and open, compared
 * deeply, on both paths: the `.ifclite-project.json` sidecar and the `.bvproj`
 * package.
 *
 * The test is structural. Every fixture is `Required<>` of its state type, so
 * a field added to a state type does not compile until the fixture sets it;
 * the document is compared whole, so a field the writer or the reader forgets
 * fails here; and the project store is checked key by key, so a new store
 * field must be either persisted or listed in `SESSION_ONLY` with its reason.
 *
 * A field the fixture leaves at its default proves nothing (a writer that drops
 * it reads back the same default), so every document key (those a reset store
 * writes, those the fixture sets, and those of `EMPTY_PROJECT`) must hold a
 * value that is not its default. Every schedule kind and view kind is in
 * the fixture, so a kind the reader does not know fails the comparison.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { ListScheduleDef } from '@bimvoice/ifcsheet';
import { defaultDoorSpec, defaultWindowSpec, profileFromPreset } from '@ifc-lite/create';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import type { CadLayerRule } from './cad-layers.js';
import type { AnnotationType, DraftSymbol, ProjectLegend } from '@/catalogue/types';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { defaultTypeSpec } from '@/element-types/spec';
import { DEFAULT_JOINERY_MAPPING } from '@/joinery/symbol-mapping';
import type { AnnotationShape, DraftEntity, DraftLayer, DraftShape, EntityShape } from '@/drafting/types';
import { EMPTY_PROJECT, loadProjectDocument, PROJECT_DOCUMENT_KEYS, projectDocument, resetProject, useProjectStore, type ProjectState } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { SEQUENTIAL_SCHEME } from './numbering.js';
import { buildPackage, readPackage, unzipPackage, zipPackage } from './package/package-io.js';
import type {
  CategoryGraphics, DraftingProjectView, ElevationProjectView, PlanProjectView, ProjectCivilDrawing, ProjectDocument, ProjectMaterial, ProjectSchedule,
  ProjectSheet, ProjectViewKind, SectionProjectView, SheetViewport, ThreeDProjectView, ViewGraphics,
} from './types.js';

/** Store fields that are deliberately not part of the project file, each with its reason. */
const SESSION_ONLY: Record<Exclude<keyof ProjectState, keyof ProjectDocument>, string> = {
  levels: 'derived from the loaded models on every load',
  activeItemId: 'which navigator item is selected: a session choice, not a document',
  dirty: 'whether there are unsaved edits: computed against what was saved',
};

/**
 * State a user sets that lives outside the project store and is not saved, on purpose.
 * Not enforced by a type: a state holder outside the project store cannot be found from it.
 */
const SESSION_ONLY_ELSEWHERE: Record<string, string> = {
  'open tabs (project/document-tabs.ts)': 'which views are open is workspace layout, reset on open',
  'selection, camera, zoom and pan (viewer store, drafting/session.ts)': 'where the user is looking, not what the project is',
  'drawing display toggles (viewer store drawing2DDisplayOptions)': 'panel toggles for the live drawing; a view carries its own graphics and scale',
  'wall join style, drafting lines in 3D (lib/wall-join-prefs.ts, lib/drafting-3d-prefs.ts)': 'device preferences kept in localStorage, not part of any one project',
  'generated drawings (project/view-drawings.ts)': 'derived from the model and the view, regenerated on open',
};

const pt = (x: number, y: number) => ({ x, y });

const category: Required<CategoryGraphics> = {
  visible: false, lineColor: '#112233', fillColor: '#445566', lineWeight: 'heavy', cutHatch: 'ANSI31', hatchScale: 2.5,
};
const graphics: Required<ViewGraphics> = {
  presetId: 'structure', categories: { walls: category, doors: { visible: false } }, grid: { visible: false, ends: 'start' },
  phases: { show: ['existing', 'demolish'], styles: { demolish: { lineColor: '#ffcc00', lineWeight: 'heavy', dashed: false, fillColor: '#fff2a8' } } },
  colourScheme: { property: 'Pset_SpaceCommon.Category', target: 'elements', classes: ['IfcSpace', 'IfcWall'], colours: { office: '#aabbcc' }, palette: 'okabe-ito' },
  colouredSurfaces: true,
  // Single elements by GlobalId, including ones the model has not got (kept, #32 #33), and a hidden line.
  hiddenElements: ['2O2Fr$t4X7Zf8NOew3FLOH', '0000000000000000000000'],
  elements: {
    '3cUkl32yn9qRSPvBJVyWYp': {
      visible: true, lineColor: '#808080', fillColor: '#101010', cutWeight: 'heavy', projectionWeight: 'hairline', lineStyle: 'dashed', cutHatch: 'ANSI31', hatchScale: 1.5, about: 'IfcWall Basement wall',
    },
  },
  hiddenLines: ['2O2Fr$t4X7Zf8NOew3FLOH|0,0,1500,0'],
  // A template's class and material mapping, kept on a view that was detached from it (#31).
  styleRules: [{ id: 'sr-w', by: 'class', match: ['IfcWall'], style: { lineColor: '#112233', fillColor: '#445566', lineWeight: 'heavy', cutHatch: 'ANSI31', hatchScale: 2 } }],
  detailLevel: 'coarse',
};

const base = { auto: false, createdAt: 11, viewDepth: 4.5, showHidden: false, detail: { of: 'v-src', min: { x: -1.5, y: 2 }, max: { x: 3.25, y: 6 }, number: 3 }, graphics, scale: 50, hiddenLayers: ['L-hidden'], templateId: 'vt-plans' };

const VIEWS: { [K in ProjectViewKind]: Required<Extract<import('./types.js').ProjectView, { kind: K }>> } = {
  plan: {
    ...base, id: 'v-plan', name: 'Level 1', kind: 'plan', cutHeight: 1.4, site: true, discipline: 'foundation', reflected: true,
    level: { name: 'Level 1', elevation: 3.2, storeyGlobalIds: ['G-A', 'G-B'] },
  } satisfies Required<PlanProjectView>,
  section: {
    ...base, id: 'v-sec', name: 'Section A', kind: 'section', through: 'Through the stair',
    plane: {
      axis: 'front', offset: -2.5, flipped: true,
      custom: { normal: [0, 0, 1], distance: 1.5, pickedAt: [1, 2, 3], tangent: [1, 0, 0], bitangent: [0, 1, 0] },
    },
  } satisfies Required<SectionProjectView>,
  elevation: {
    ...base, showHidden: true, id: 'v-el', name: 'East', kind: 'elevation', direction: 'east', planeOffset: 7.25,
    interior: {
      room: 'G-ROOM',
      plane: { axis: 'side', offset: 4.5, flipped: false, custom: { normal: [-1, 0, 0], distance: -4.5, pickedAt: [4.5, 0, -2], tangent: [0, 0, 1], bitangent: [0, 1, 0] } },
      crop: { min: { x: -1.75, y: 0 }, max: { x: 1.75, y: 2.5 } },
    },
  } satisfies Required<ElevationProjectView>,
  '3d': {
    ...base, id: 'v-3d', name: 'Axo', kind: '3d',
    viewpoint: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fov: 50, projectionMode: 'orthographic', orthoSize: 12 },
    projection: 'axonometric', preset: 'sw', shaded: true,
    raster: { href: 'data:image/png;base64,AAAA', widthPx: 1772, heightPx: 1182, widthMm: 150, heightMm: 100 },
    cutaway: { storey: { level: { name: 'Ground', elevation: 0, storeyGlobalIds: ['G'] }, cutHeight: 1.2 }, box: { min: { x: -1, y: -0.5, z: -2 }, max: { x: 8, y: 6, z: 4 } } },
  } satisfies Required<ThreeDProjectView>,
  drafting: { ...base, id: 'v-draft', name: 'Typical parapet', kind: 'drafting', number: 4 } satisfies Required<DraftingProjectView>,
};

const GEOMETRY: { [K in DraftShape['type']]: Required<Extract<DraftShape, { type: K }>> } = {
  line: { type: 'line', a: pt(0, 0), b: pt(3, 4) },
  polyline: { type: 'polyline', pts: [pt(0, 0), pt(1, 0), pt(1, 1)], closed: true },
  circle: { type: 'circle', c: pt(1, 1), r: 2 },
  arc: { type: 'arc', c: pt(1, 1), r: 2, start: 0.5, end: 2 },
};
const ANNOTATION: { [K in AnnotationShape['type']]: Required<Extract<AnnotationShape, { type: K }>> } = {
  text: { type: 'text', p: pt(1, 1), text: 'Kitchen\n12.50 m²', height: 0.25, rotation: 1.2, frame: 'bubble', leader: pt(4, 1) },
  leader: { type: 'leader', pts: [pt(0, 0), pt(1, 1)], text: 'W1', height: 0.25 },
  dimension: { type: 'dimension', variant: 'linear', a: pt(0, 0), b: pt(5, 0), at: pt(2, 1), height: 0.25, text: 'EQ', textAt: pt(3, 1.5) },
  radial: { type: 'radial', c: pt(0, 0), r: 2, at: pt(3, 3), diameter: true, height: 0.25 },
  angular: { type: 'angular', c: pt(0, 0), a: pt(1, 0), b: pt(0, 1), at: pt(2, 2), height: 0.25 },
  level: { type: 'level', p: pt(1, 1), value: 3.2, height: 0.25, ref: { at: pt(1, 1), storey: 'Level 1' } },
  axis: { type: 'axis', a: pt(0, 0), b: pt(0, 9), label: 'B', bubble: 'square', ends: 'start', size: 0.8, height: 0.25, lineType: 'dotted' },
  symbol: { type: 'symbol', symbolId: 'sym-model', p: pt(2, 3), scale: 1.5, rotation: 0.7, followsNorth: true },
  hatch: { type: 'hatch', loops: [[pt(0, 0), pt(2, 0), pt(2, 2)], [pt(0.5, 0.2), pt(1, 0.2), pt(1, 0.8)]], pattern: 'ANSI31', scale: 2, angle: 0.4, color: '#aa5500' },
};
const SHAPES: EntityShape[] = [...Object.values(GEOMETRY), ...Object.values(ANNOTATION)];

// Ordered by view: a package keeps a view's drafts in drawing order (that is the stacking), views in path order.
const drafts: DraftEntity[] = SHAPES.map((shape, i) => ({
  id: `d${i}`, viewId: i < SHAPES.length / 2 ? 'v-plan' : 'v-sec', layerId: i % 2 ? 'L-pen' : '0', shape,
  params: { ifcClass: 'IfcWall', depth: 2.7, flag: true, textStyle: 'big', dimStyle: 'arch', tagOf: '2O2Fr$t4X7Zf8NOew3FLOH', sectionOf: 'v-sec', detailOf: 'v-det', detailPart: 8, atype: 'at1', labelOf: '3cUkl32yn9qRSPvBJVyWYp' },
}));

const annotationType: Required<AnnotationType> = {
  id: 'at1', name: 'Grid axis', tool: 'axis', textStyle: 'big', dimStyle: 'arch', layer: 'L-pen',
  axis: { bubble: 'square', ends: 'start', size: 0.8, lineType: 'dashed' }, hatch: { pattern: 'ANSI31', scale: 2, angle: 45 }, tagField: 'class',
  label: { template: 'Fire {Pset_WallCommon.FireRating}\n{Qto_WallBaseQuantities.Length:0.00 m|n/a}', frame: 'rounded', missing: 'field' },
};
const symbols: Required<DraftSymbol>[] = [
  { id: 'sym-paper', name: 'Mark', unit: 'paper', shapes: [{ type: 'circle', c: pt(0, 0), r: 4 }, { type: 'text', p: pt(0, 1), text: 'A', height: 2.5, rotation: 0.3 }, { type: 'line', a: pt(0, 0), b: pt(5, 0) }] },
  { id: 'sym-model', name: 'Scale bar', unit: 'model', shapes: [{ type: 'polyline', pts: [pt(0, 0), pt(5, 0)], closed: false }] },
];
const legend: Required<ProjectLegend> = {
  id: 'lg1', name: 'Plan legend', createdAt: 3, title: 'Key', showTitle: false, scope: 'sheet', scopeId: 'sh1', categories: ['symbols', 'materials'],
  columns: 2, rowHeight: 9, swatchWidth: 22, textStyle: 'big', headings: false,
};

const layer: Required<DraftLayer> = { id: 'L-pen', name: 'Pen', color: '#cc0000', visible: false, locked: true, lineWeight: 0.5, lineType: 'lt-centre', group: 'g1', print: false };

const viewport: Required<SheetViewport> = {
  id: 'vp1', viewId: 'v-plan', x: 210, y: 148.5, scale: 50, width: 300, height: 200, center: { x: 4, y: 5 }, hiddenLayers: ['L-pen'], page: 2, placed: true, placedPages: [{ page: 3, x: 120, y: 80 }], keyPlanOf: 'vp0', drawingNumber: '7',
};
const sheet: Required<ProjectSheet> = {
  id: 'sh1', number: 'A-201', autoNumber: true, numberOverride: true, series: 'elevations', name: 'Plans', createdAt: 9, paper: { kind: 'elongated', base: 'A2', factor: 3 }, orientation: 'portrait', viewports: [viewport],
  frame: { margins: { top: 8, right: 9, bottom: 11, left: 20 }, titleBlock: 'right' }, templateId: 'tpl1',
  titleBlock: { project: 'House', drawnBy: 'PC', date: '2026-10-12' }, revisionIds: ['rev-b'],
  titleBlockParams: { Phase: 'PAC' }, notes: ['Format A2: the drawing does not fit A3 at 1:50.'],
};
/** One schedule of every kind: a kind added to `ProjectSchedule['kind']` does not compile until it is listed here. */
const SCHEDULES: { [K in ProjectSchedule['kind']]: Required<Omit<ProjectSchedule, 'sub' | 'textRows' | 'content' | 'keptApart' | 'detail' | 'classification' | 'list'>> & { kind: K; list?: ListScheduleDef } } = {
  door: { id: 'sc1', name: 'Doors', kind: 'door', createdAt: 5, scale: 25 },
  window: { id: 'sc2', name: 'Windows', kind: 'window', createdAt: 6, scale: 20 },
  all: { id: 'sc3', name: 'Joinery', kind: 'all', createdAt: 7, scale: 50 },
  materials: { id: 'sc4', name: 'Takeoff', kind: 'materials', createdAt: 8, scale: 100 },
  types: { id: 'sc5', name: 'Quantities by type', kind: 'types', createdAt: 9, scale: 100 },
  finishes: { id: 'sc6', name: 'Room finishes', kind: 'finishes', createdAt: 10, scale: 100 },
  register: { id: 'sc7', name: 'Drawing register', kind: 'register', createdAt: 11, scale: 100 },
  urban: { id: 'sc8', name: 'Urban indicators', kind: 'urban', createdAt: 12, scale: 100 },
  boq: { id: 'sc13', name: 'Antemăsurătoare', kind: 'boq', createdAt: 17, scale: 100 },
  rooms: { id: 'sc20', name: 'Room and area schedule', kind: 'rooms', createdAt: 15, scale: 100 },
  // Every field of a list schedule's definition (#78) set to something that is not its default: one the writer or reader drops fails the comparison.
  list: {
    id: 'sc21', name: 'Walls by type', kind: 'list', createdAt: 19, scale: 100,
    list: {
      filter: { classes: ['IfcWallStandardCase'], levels: ['Erdgeschoss'], predefined: ['STANDARD'], properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', op: 'equals', value: 'true' }] },
      columns: [
        { id: 'attribute::Type', source: 'attribute', propertyName: 'Type', label: 'Wall type' },
        { id: 'quantity:Qto_WallBaseQuantities:NetSideArea', source: 'quantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'NetSideArea' },
        { id: 'attribute::Name', source: 'attribute', propertyName: 'Name', hidden: true },
      ],
      groupBy: ['attribute::Type'], sum: ['quantity:Qto_WallBaseQuantities:NetSideArea'], totals: false,
    },
  },
};
/** A bill of quantities that prints the rows per type (#75): `detail`, off by default, set. */
const BOQ_DETAIL_SCHEDULE: Required<Omit<ProjectSchedule, 'sub' | 'textRows' | 'content' | 'keptApart' | 'classification' | 'list'>> = { id: 'sc14', name: 'Antemăsurătoare, pe tipuri', kind: 'boq', createdAt: 18, scale: 100, detail: true };
/** Quantities by type with a classification column grouped by code (#89): both fields of the choice set. */
const CLASSIFICATION_SCHEDULE: Required<Omit<ProjectSchedule, 'sub' | 'textRows' | 'content' | 'keptApart' | 'detail' | 'list'>> = {
  id: 'sc15', name: 'Quantities by Uniclass code', kind: 'types', createdAt: 19, scale: 100, classification: { mapping: 'class1', group: true },
};
/** A sub-report (#186) with every dimension of its filter set: a field the writer or reader drops fails the comparison. */
const SUB_REPORT: Required<Omit<ProjectSchedule, 'textRows' | 'content' | 'keptApart' | 'detail' | 'classification' | 'list'>> = {
  id: 'sc9', name: 'Ground floor windows', kind: 'all', createdAt: 13, scale: 50, sub: { parent: 'sc3', filter: { kinds: ['window'], levels: ['Ground'], types: ['t1', 't2'] } },
};
/** A joinery schedule with text rows (#186): every field of a row and of a cell set, a cell keyed by a type id and one by an untyped group. */
const TEXT_SCHEDULE: Required<Omit<ProjectSchedule, 'sub' | 'content' | 'keptApart' | 'detail' | 'classification' | 'list'>> = {
  id: 'sc10', name: 'Joinery with notes', kind: 'all', createdAt: 14, scale: 50,
  textRows: [
    { id: 'tr1', label: 'Producător', cells: { j1: { text: 'Rehau, ușă ț ă', about: 'D1 Ușă interioară' }, 'untyped:window:900×1200': { text: 'de verificat', about: 'Fereastră 900×1200' } } },
    { id: 'tr2', label: 'Observații', cells: {} },
  ],
};
/** A joinery schedule with a content choice (#186): every field of it set to something that is not its default. */
const CONTENT_SCHEDULE: Required<Omit<ProjectSchedule, 'sub' | 'textRows' | 'keptApart' | 'detail' | 'classification' | 'list'>> = {
  id: 'sc11', name: 'Joinery, chosen', kind: 'all', createdAt: 15, scale: 50,
  content: { rows: { order: ['total', 'name', 'size', 'text:tr1'], hidden: ['u', 'text:tr2'] }, sort: { by: 'count', descending: true }, numbering: { marks: 'sequence', typeStart: 4, elementStart: 0 } },
};
/** A split schedule that keeps elements apart on purpose (#186): an element and a whole type. */
const KEPT_SCHEDULE: Required<Omit<ProjectSchedule, 'sub' | 'textRows' | 'content' | 'detail' | 'classification' | 'list'>> = {
  id: 'sc12', name: 'Joinery, split', kind: 'all', createdAt: 16, scale: 50, keptApart: ['j1|2O2Fr$t4X7Zf8NOew3FLOH', 'untyped:window:900×1200|'],
};
const civil: Required<ProjectCivilDrawing> = {
  id: 'c1', name: 'DN1 sections', kind: 'sections', createdAt: 3, corridorGlobalId: '2O2Fr$t4X7Zf8NOew3FLOH', scale: 200, vExaggeration: 10,
  stationStep: 50, elevationStep: 5, every: 25, stations: [0, 100, 250], columns: 3, halfWidth: 20,
};
const material: Required<ProjectMaterial> = { id: 'm1', name: 'Mineral wool', hatch: 'INSULATION', hatchScale: 1.5, fill: '#ffeeaa', hatchPen: 'light', membrane: true };

const cadRule: Required<CadLayerRule> = {
  id: 'cad1', source: 'CUT', kind: 'text', ifcClasses: ['IfcWall', 'IfcWallStandardCase'], material: 'Beton armat', layer: 'A-WALL-CUT', color: '#7f1d1d', lineWeight: 0.5, lineType: 'dashed',
};

/**
 * The samples fields register with their definition (#144): `fields/<name>.sample.ts` exports `sample`, the field's
 * key set to something that is not its default. A field with a sample file is not listed in `FULL` below, so a
 * new field adds its sample next to its definition instead of editing this file.
 */
async function fieldSamples(): Promise<Partial<ProjectDocument>> {
  const dir = new URL('./fields/', import.meta.url);
  const samples: Partial<ProjectDocument> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sample.ts')).sort()) {
    const { sample } = (await import(new URL(file, dir).href)) as { sample: Partial<ProjectDocument> };
    for (const key of Object.keys(sample)) assert.equal(key in samples, false, `${key} has two samples (${file})`);
    Object.assign(samples, sample);
  }
  return samples;
}
const SAMPLES = await fieldSamples();

/** The title block fields the cartuș F_01 of Ordinul 975/2026 adds (#364): typed, kept with the project. */
const F01_TITLE_FIELDS: Record<string, string> = {
  registrationNumber: 'J40/1234/2020', projectManagerTitle: 'arh. Ion Ionescu', designerTitle: 'arhitect', drawnByTitle: 'desenator', authorsCapacity: 'proiectant arhitectură',
  verifierCapacity: 'verificator atestat', verifierRequirement: 'A1', reportNumber: 'RV-77', reportDate: '2026-10-20',
};

/** Every field of the project document set to something that is not its default: the fields below, and the ones that bring a sample. */
const FULL = {
  ...SAMPLES,
  name: 'Full house',
  models: [{ key: 'hash-arch', name: 'arch.ifc' }],
  views: Object.values(VIEWS),
  sheets: [sheet],
  titleBlock: { project: 'Full house', client: 'Owner', checkedBy: 'PC', logo: 'data:image/png;base64,iVBORw0KGgo=', ...F01_TITLE_FIELDS },
  titleBlockParams: [{ name: 'Phase', value: 'DTAC' }, { name: 'ProjectNumber', value: '2026-014' }],
  titleBlockTemplate: { items: [
    { id: 'tb1', kind: 'rect', x: 0, y: 0, w: 180, h: 50, weight: 0.5 },
    { id: 'tb2', kind: 'line', x1: 0, y1: 25, x2: 130, y2: 25, weight: 0.18 },
    { id: 'tb3', kind: 'text', x: 2, y: 8, size: 3.5, text: 'Phase: {Phase}', bold: true, muted: true, fit: 61 },
    { id: 'tb4', kind: 'logo', x: 132, y: 1.5, w: 46, h: 11 },
  ] },
  titleBlockSources: { address: [{ kind: 'attribute', on: 'IfcBuilding', name: 'BuildingAddress' }], organisation: [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Office' }, { kind: 'owner', part: 'developer' }] },
  drafts,
  draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, layer],
  hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n',
  textStyles: [{ ...DEFAULT_TEXT_STYLE }, { id: 'big', name: 'Big', height: 5, font: 'serif', bold: true, italic: true, color: '#aa0000' }],
  dimStyles: [{ ...DEFAULT_DIM_STYLE }, {
    id: 'arch', name: 'Arch', textStyle: 'big', arrow: 'arrow', arrowSize: 2, extGap: 0.5, extOver: 2, placement: 'below', textGap: 0.8, precision: 0, unit: 'mm', color: '#0000aa',
  }],
  layerGroups: [{ id: 'g1', name: 'Annotation', visible: false, locked: true }],
  graphicStandard: 'ro-practice',
  openingLines: 'hinge',
  symbolFlips: { '2O2Fr$t4X7Zf8NOew3FLOH': 3 },
  joineryTypes: [{ ...defaultDoorSpec('D-1'), id: 'j1' }, { ...defaultWindowSpec('W-1'), id: 'j2', columns: [2, 1], panels: [{ col: 0, row: 0, operation: 'tilt-turn-right' }] }],
  currentJoinery: { door: 'j1', window: 'j2' },
  joineryMapping: { ...DEFAULT_JOINERY_MAPPING, byName: false, byDimensions: false, tolerance: 0.07, aliases: { j1: ['Door 90'] } },
  elementTypes: (['wall', 'slab', 'column', 'beam', 'roof', 'opening'] as const).map((kind, i) => ({ ...defaultTypeSpec(kind), kind, id: `t${i}`, name: `Type ${kind}`, mark: `M${i}` }) as never),
  currentTypes: { wall: 't0', slab: 't1', column: 't2' },
  schedules: [...Object.values(SCHEDULES), SUB_REPORT, TEXT_SCHEDULE, CONTENT_SCHEDULE, KEPT_SCHEDULE, BOQ_DETAIL_SCHEDULE, CLASSIFICATION_SCHEDULE],
  sheetTemplates: [{ id: 'tpl1', name: 'Long elevations', paper: { kind: 'custom', widthMm: 500, heightMm: 700 }, orientation: 'portrait', frame: { margins: { top: 8, right: 9, bottom: 11, left: 20 }, titleBlock: 'right' } }],
  seriesTemplates: { plans: 'builtin:a1-plans', details: 'tpl1' },
  viewTemplates: [{ id: 'vt-plans', name: 'Plans', kind: 'plan', graphics: { presetId: 'structure', grid: { visible: false, ends: 'end' }, categories: { furniture: { visible: false }, walls: category },
    styleRules: [{ id: 'sr-w', by: 'class', match: ['IfcWall', 'IfcWallStandardCase'], style: { lineWeight: 'heavy', fillColor: '#666666' } }, { id: 'sr-c', by: 'material', match: ['Concrete'], style: { fillColor: '#999999', cutHatch: 'ANSI31' } }] } }],
  structureProfiles: [profileFromPreset('box-tunnel', 'sp1', 'Culvert 2x2')],
  civilDrawings: [civil],
  typicalSections: [{ id: 'ts1', name: 'Rural', assembly: { lanes: [{ width: 3.5, slope: -2.5 }], shoulder: { width: 1, slope: -4 }, layers: [{ name: 'Asphalt', thickness: 0.1, color: '#333333' }], daylight: { cutSlope: 1, fillSlope: 1.5 }, nominalDepth: 0.6 } }],
  materials: [material],
  cadLayers: [cadRule],
  phaseSource: { mapping: { set: 'Faza', property: 'Stare', values: { Existent: 'existing', Desfiintare: 'demolish', Propus: 'new' } }, unmarked: 'new' },
  annotationTypes: [annotationType],
  symbols,
  legends: [legend],
  sheetNumbering: { discipline: 'AR', continuous: true, groups: { ...SEQUENTIAL_SCHEME.groups, plans: { prefix: 'P', separator: '.', start: 5, digits: 4, step: 5 } } },
  details: [{
    id: 'dt1', name: 'Typical parapet', scale: 10,
    drafts: drafts.slice(0, 3).map(({ viewId: _viewId, ...rest }) => rest),
    layers: [{ id: 'L-pen', name: 'Pen', color: '#cc0000', visible: false, locked: true, lineWeight: 0.5, lineType: 'dashdot' }],
    hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n', symbols,
  }],
  tagFields: { door: { mark: [{ kind: 'pset', pset: 'Pset_DoorCommon', property: 'Reference' }, { kind: 'attribute', name: 'Mark' }] }, room: { name: [{ kind: 'quantity', qto: 'Qto_SpaceBaseQuantities', name: 'NetFloorArea' }, { kind: 'type-pset', pset: 'Pset_X', property: 'Y' }] } },
  issues: [{
    id: 'iss1', name: 'Planning issue', date: '2026-10-13', createdAt: 1760000000000,
    sheets: [{ number: 'A-101', title: 'Ground floor', scale: '1:50, 1:100', paper: 'A3×3', orientation: 'portrait', revision: 'B', fingerprint: '0123456789abcd' }],
  }],
  modelState: snapshotFromElements([{ k: '2O2Fr$t4X7Zf8NOew3FLOH', t: 'IfcWall', n: 'Wall', d: 'abcdef0123', g: 'a1b2c3d4e', a: [0, 0, 0, 4, 0.2, 3], p: 'Site/Building/Level 0' }], 7),
  savedSectionCuts: [{
    id: 'cut1', name: 'Stair cut', createdAt: 1, updatedAt: 2,
    plane: { axis: 'side', position: 4.2, flipped: true, capStyle: { fillColor: [1, 0.5, 0, 1], strokeColor: [0, 0, 0, 1], pattern: 'brick', spacingPx: 6, angleRad: 0.5, widthPx: 2, secondaryAngleRad: -0.5 }, showCap: false, showOutlines: false },
  }],
} as Required<ProjectDocument>; // completeness is checked at run time below: every key of the registry must hold a non-default value.

/** Where two JSON values differ, as paths: a failure names the field that was lost. */
function diffPaths(want: unknown, got: unknown, path = ''): string[] {
  if (Object.is(want, got)) return [];
  const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (!object(want) || !object(got) || Array.isArray(want) !== Array.isArray(got)) return [`${path || '/'}: ${JSON.stringify(want)} became ${JSON.stringify(got)}`];
  return [...new Set([...Object.keys(want), ...Object.keys(got)])].flatMap((k) => diffPaths(want[k], got[k], `${path}/${k}`));
}
const same = (got: unknown) => assert.deepEqual(diffPaths(FULL, got), []);

beforeEach(() => resetProject());

describe('project round trip, one of everything', () => {
  it('the fixture covers every shape type and view kind', () => {
    assert.deepEqual(new Set(drafts.map((d) => d.shape.type)), new Set([...Object.keys(GEOMETRY), ...Object.keys(ANNOTATION)]));
    assert.equal(new Set(FULL.views.map((v) => v.kind)).size, Object.keys(VIEWS).length);
    assert.equal(new Set(FULL.schedules?.map((s) => s.kind)).size, Object.keys(SCHEDULES).length);
  });

  it('every sample belongs to a registered field', () => {
    assert.deepEqual(Object.keys(SAMPLES).filter((k) => !PROJECT_DOCUMENT_KEYS.includes(k as keyof ProjectDocument)), []);
  });

  it('sets every document field to something that is not its default', () => {
    // The keys come from the document itself (PROJECT_DOCUMENT_KEYS, the store's DOCUMENT_FIELDS), not a list kept here: whatever a
    // reset store writes, whatever the fixture sets, and whatever EMPTY_PROJECT names.
    const defaults = projectDocument();
    const keys = [...new Set([...PROJECT_DOCUMENT_KEYS, ...Object.keys(defaults), ...Object.keys(FULL), ...Object.keys(EMPTY_PROJECT)])] as (keyof ProjectDocument)[];
    const empty = (v: unknown) => v === undefined || v === '' || (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
    const unset = keys.filter((k) => empty(FULL[k]) || isDeepStrictEqual(FULL[k], defaults[k]) || isDeepStrictEqual(FULL[k], EMPTY_PROJECT[k]));
    assert.deepEqual(unset, [], `give these fields a non-default value in FULL, so a save that drops them fails: ${unset.join(', ')}`);
  });

  it('survives the .ifclite-project.json sidecar', () => {
    same(parseProjectFile(serializeProject(FULL)));
  });

  it('keeps the F_01 title block fields (#364) through save and reopen, in the sidecar and in the store', () => {
    const reread = parseProjectFile(serializeProject(FULL));
    for (const [k, v] of Object.entries(F01_TITLE_FIELDS)) assert.equal(reread.titleBlock?.[k], v, k);
    resetProject();
    loadProjectDocument(reread);
    for (const [k, v] of Object.entries(F01_TITLE_FIELDS)) assert.equal(useProjectStore.getState().titleBlock?.[k], v, k);
  });

  it('survives the .bvproj package', async () => {
    const { files } = await buildPackage({ projectId: 'p', doc: FULL, models: [] });
    const opened = await readPackage(unzipPackage(zipPackage(files)));
    same(opened.doc);
  });

  it('survives the store: load, then the document the writer reads back', () => {
    loadProjectDocument(FULL);
    same(projectDocument());
  });

  it('the writer reads every persisted store field, and every other store field is listed as session-only', () => {
    loadProjectDocument(FULL);
    const stored = Object.keys(useProjectStore.getState());
    const written = new Set(Object.keys(projectDocument()));
    const missed = stored.filter((k) => !written.has(k) && !(k in SESSION_ONLY));
    assert.deepEqual(missed, [], `store fields neither saved nor listed in SESSION_ONLY: ${missed.join(', ')}`);
    assert.deepEqual([...written].sort(), Object.keys(FULL).sort());
  });

  it('names a reason for everything it leaves out on purpose', () => {
    for (const [what, reason] of [...Object.entries(SESSION_ONLY), ...Object.entries(SESSION_ONLY_ELSEWHERE)]) assert.ok(reason.length > 10, what);
  });

  it('opens a file written before the later fields existed', () => {
    const old = { ...JSON.parse(serializeProject(FULL)) as Record<string, unknown> };
    delete old.openingLines;
    delete old.symbolFlips;
    delete old.savedSectionCuts;
    const doc = parseProjectFile(JSON.stringify(old));
    assert.equal(doc.openingLines, undefined);
    assert.deepEqual(doc.symbolFlips, {});
    assert.deepEqual(doc.savedSectionCuts, []);
  });
});
