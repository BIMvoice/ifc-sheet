/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tools that edit a drawing set held by the session (#165, second slice):
 * list its sheets, add a view, place a view on a sheet, fill the title block,
 * renumber. Each is a call to the engine function the app uses for the same
 * edit (`planViewFor`, `withViewHung`, `placeViewports`, `planRenumber`...) on
 * the session's copy of the project document; the tool replaces that copy, so
 * the next call (and the PDF, the DXF and the issue) sees the edit.
 */

import {
  DEFAULT_SCHEME, FIELD_PARAMS, SCHEME_PRESETS, SHEET_SCALES, defaultPlanCutHeight, drawingArea, elevationDepth, elevationName, elevationPlaneOffset,
  fitsScale, freshProjectId, nameOf, placeViewports, planRenumber, planViewFor, renumbered, scaleOn, sectionPlaneThrough, sheetFields, uniqueViewName,
  viewExtent, withViewHung,
  type ElevationDirection, type ModelExtent, type NumberingScheme, type ProjectDocument, type ProjectLevel, type ProjectSheet, type ProjectView, type SectionProjectView,
} from '@bimvoice/ifcsheet';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { getSheetSet, replaceSheetDocument, type SheetSetEntry } from './ifcsheet-store.js';
import {
  DOCUMENT_ID, findSheet, findView, invalid, optBoolean, optChoice, optNumber, optText, sheetsOf, text, unplacedViews,
} from './ifcsheet-shared.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

/** The model's extent, which every view and placement is measured on. A set exists only for a model that has one. */
function extentOf(entry: SheetSetEntry): ModelExtent {
  const extent = entry.model.model.extent;
  if (!extent) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The model has no geometry, so views cannot be measured.' });
  return extent;
}

const sheetsPatch = (doc: ProjectDocument, sheets: ProjectSheet[]): ProjectDocument => ({ ...doc, sheets });

// ---- ifcsheet_list_sheets ----

export const ifcsheetListSheets: Tool = {
  name: 'ifcsheet_list_sheets',
  description:
    'List the sheets of a drawing set held by this session. Returns, per sheet: id, number (e.g. "A-101"), name, paper ("A1") and paperMm (width and height, millimetres), orientation, and the views placed on it in order (slot = 0-based position, view name and kind, scale as "1:100", viewport centre in paper millimetres from the top-left). Also returns the views no sheet shows yet (unplaced_views: id, name, kind) and the title block fields every sheet prints. A sheet that prints a schedule says which (schedule: "rooms" or "boq"). Read-only.',
  scope: 'read',
  inputSchema: { type: 'object', properties: { document_id: DOCUMENT_ID }, required: ['document_id'], additionalProperties: false },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const doc = entry.set.document;
    const sheets = sheetsOf(entry);
    return okResult(
      `${doc.sheets.length} sheet${doc.sheets.length === 1 ? '' : 's'} (${doc.sheets.map((s) => s.number).join(', ')}), ${doc.views.length} views, ${unplacedViews(doc).length} not placed.`,
      { document_id: entry.id, name: doc.name, sheets, unplaced_views: unplacedViews(doc), title_block: doc.titleBlock ?? {} },
    );
  },
};

// ---- ifcsheet_add_view ----

const KINDS = ['plan', 'elevation', 'section', 'axonometric'] as const;
const DIRECTIONS: readonly ElevationDirection[] = ['north', 'south', 'east', 'west'];
const PRESETS = ['se', 'sw', 'ne', 'nw'] as const;

/** `[x, z]` or `[x, y, z]` metres in the viewer frame from an input array. */
function point(input: Record<string, unknown>, key: string, length: 2 | 3): number[] | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length !== length || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw invalid(`${key} must be [${length === 2 ? 'x, z' : 'x, y, z'}]: ${length} finite numbers, metres in the viewer frame (X east, Y up, Z south).`);
  }
  return v as number[];
}

function levelNamed(entry: SheetSetEntry, name: string): ProjectLevel {
  const key = name.trim().toLowerCase();
  const found = entry.set.levels.find((l) => l.name.trim().toLowerCase() === key);
  if (found) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No storey '${name}'. Give one of the storey names ifcsheet_open_model lists.`,
    details: { storeys: entry.set.levels.map((l) => l.name) },
  });
}

/** The first mark (A, B, ... Z) no section is named with. */
function sectionName(views: readonly ProjectView[]): string {
  const taken = new Set(views.map((v) => v.name.toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const name = nameOf('names.view.section', { mark: String.fromCharCode(65 + i) });
    if (!taken.has(name.toLowerCase())) return name;
  }
  return uniqueViewName(nameOf('names.view.section', { mark: 'Z' }), views);
}

function newView(entry: SheetSetEntry, input: Record<string, unknown>): ProjectView {
  const kind = optChoice(input, 'kind', KINDS);
  if (!kind) throw invalid(`kind is required: one of ${KINDS.join(', ')}.`);
  const views = entry.set.document.views;
  const now = Date.now();
  const name = optText(input, 'name')?.trim() || undefined;
  const extent = extentOf(entry);
  const base = { id: freshProjectId('view'), createdAt: now };
  switch (kind) {
    case 'plan': {
      const level = levelNamed(entry, text(input, 'level'));
      const cut = optNumber(input, 'cut_height_m', 0.1, 50);
      const plan = planViewFor(level, views, now, entry.set.levels);
      const { auto: _auto, ...rest } = plan;
      return { ...rest, ...(name ? { name: uniqueViewName(name, views) } : {}), ...(cut !== undefined ? { cutHeight: cut } : {}) };
    }
    case 'elevation': {
      const direction = optChoice(input, 'direction', DIRECTIONS);
      if (!direction) throw invalid(`direction is required for an elevation: one of ${DIRECTIONS.join(', ')}.`);
      return {
        ...base, kind: 'elevation', direction, name: uniqueViewName(name ?? elevationName(direction), views),
        planeOffset: elevationPlaneOffset(direction, extent), viewDepth: elevationDepth(direction, extent),
      };
    }
    case 'section': {
      const from = point(input, 'from', 2);
      const to = point(input, 'to', 2);
      const flipped = optBoolean(input, 'flipped') ?? false;
      const depth = optNumber(input, 'depth_m', 0.1, 10_000);
      const sectionBase = { ...base, kind: 'section' as const, name: uniqueViewName(name ?? sectionName(views), views), ...(depth !== undefined ? { viewDepth: depth } : {}) };
      if (from || to) {
        if (!from || !to) throw invalid('A section along a line needs both from and to: [x, z] points in plan, metres, viewer frame (X east, Z south).');
        const side = point(input, 'look_towards', 2) ?? [from[0] - (to[1] - from[1]), from[1] + (to[0] - from[0])];
        const custom = sectionPlaneThrough({ x: from[0], y: 0, z: from[1] }, { x: to[0], y: 0, z: to[1] }, { x: side[0], y: 0, z: side[1] });
        if (!custom) throw invalid('from and to are the same point: a section needs a line.');
        return { ...sectionBase, plane: { axis: 'front', offset: custom.distance, flipped: false, custom } } satisfies SectionProjectView;
      }
      const axis = optChoice(input, 'axis', ['front', 'side'] as const);
      if (!axis) throw invalid('A section needs axis ("front": plane perpendicular to Z, "side": perpendicular to X) with offset_m, or a line from/to.');
      const centre = axis === 'front' ? (extent.min.z + extent.max.z) / 2 : (extent.min.x + extent.max.x) / 2;
      return { ...sectionBase, plane: { axis, offset: optNumber(input, 'offset_m', -1e6, 1e6) ?? centre, flipped } } satisfies SectionProjectView;
    }
    case 'axonometric': {
      const preset = optChoice(input, 'preset', PRESETS) ?? 'se';
      const cutLevel = optText(input, 'cut_level');
      const cutHeight = optNumber(input, 'cut_height_m', 0.1, 50);
      const min = point(input, 'box_min', 3);
      const max = point(input, 'box_max', 3);
      if ((min === undefined) !== (max === undefined)) throw invalid('A cut-away box needs both box_min and box_max: [x, y, z] metres, viewer frame.');
      if (min && max && min.some((n, i) => n >= max[i])) throw invalid('box_min must be below box_max on every axis.');
      if (cutHeight !== undefined && !cutLevel) throw invalid('cut_height_m needs cut_level: the storey the cut is measured from.');
      const level = cutLevel ? levelNamed(entry, cutLevel) : undefined;
      const cutaway = level || min
        ? {
            ...(level ? { storey: { level, cutHeight: cutHeight ?? defaultPlanCutHeight(level, entry.set.levels) } } : {}),
            ...(min && max ? { box: { min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } } } : {}),
          }
        : undefined;
      return { ...base, kind: '3d', name: uniqueViewName(name ?? (cutaway ? 'Cut-away axonometric' : 'Axonometric'), views), viewpoint: null, projection: 'axonometric', preset, ...(cutaway ? { cutaway } : {}) };
    }
  }
}

export const ifcsheetAddView: Tool = {
  name: 'ifcsheet_add_view',
  description:
    'Add a view to a drawing set; it is not on any sheet until ifcsheet_place_view. All lengths are metres in the viewer frame: X east, Y up, Z south (the building\'s box is "extent" in ifcsheet_open_model). kind "plan": give level (a storey name) and optionally cut_height_m (above the floor, default about 1.2). kind "elevation": give direction (north, south, east or west; the facade it looks at). kind "section": either axis ("front": a plane perpendicular to Z, "side": perpendicular to X) with offset_m (the plane\'s coordinate on that axis, default the middle of the building) and flipped, or a line in plan from [x, z] to [x, z] (optional look_towards [x, z], the side the section looks to); optional depth_m, how far past the cut it sees. kind "axonometric": preset se, sw, ne or nw (default se); optional cut-away: cut_level (a storey) with cut_height_m, nothing above that height is drawn, and/or box_min and box_max [x, y, z] (only what lies inside is drawn). name is optional (made unique). Returns the new view (id, name, kind) and how many views are unplaced.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      kind: { type: 'string', enum: [...KINDS], description: 'The kind of view.' },
      name: { type: 'string', description: 'The view\'s name. Default: the storey, the facade, "Section A", "Axonometric".' },
      level: { type: 'string', description: 'plan: the storey name.' },
      cut_height_m: { type: 'number', description: 'plan, axonometric cut-away: the cut height in metres above the storey\'s floor.' },
      direction: { type: 'string', enum: [...DIRECTIONS], description: 'elevation: the facade it looks at.' },
      axis: { type: 'string', enum: ['front', 'side'], description: 'section: "front" cuts perpendicular to the Z axis, "side" perpendicular to X.' },
      offset_m: { type: 'number', description: 'section: the plane\'s coordinate on its axis, metres. Default: the middle of the building.' },
      flipped: { type: 'boolean', description: 'section: look the other way. Default false.' },
      from: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: start [x, z], metres.' },
      to: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: end [x, z], metres.' },
      look_towards: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: a point [x, z] on the side the section looks to.' },
      depth_m: { type: 'number', description: 'section: how far beyond the cut the view sees, metres. Default: the whole building.' },
      preset: { type: 'string', enum: [...PRESETS], description: 'axonometric: the corner it is seen from. Default se.' },
      cut_level: { type: 'string', description: 'axonometric cut-away: the storey whose cut height removes everything above.' },
      box_min: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'axonometric cut-away: [x, y, z] corner of the box that is kept.' },
      box_max: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'axonometric cut-away: the opposite corner.' },
    },
    required: ['document_id', 'kind'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const view = newView(entry, input);
    replaceSheetDocument(entry, { ...entry.set.document, views: [...entry.set.document.views, view] });
    const unplaced = unplacedViews(entry.set.document).length;
    return okResult(
      `Added ${view.kind} view '${view.name}' (${view.id}); ${unplaced} view${unplaced === 1 ? '' : 's'} not on a sheet. Next: ifcsheet_place_view.`,
      { document_id: entry.id, view: { id: view.id, name: view.name, kind: view.kind }, unplaced_views: unplaced },
    );
  },
};

// ---- ifcsheet_place_view ----

/** `sheet` laid out again with `members` at 1:`scale`, the way the engine lays out a sheet it hangs a view on. */
function laidOut(sheet: ProjectSheet, members: readonly ProjectView[], scale: number, extent: ModelExtent): ProjectSheet {
  const sizes = members.map((v) => viewExtent(v, extent));
  return { ...sheet, viewports: placeViewports(members, sizes, scale, sheet, extent) };
}

/** The most detailed offered scale at which `members` fit `sheet`, as the words an agent can act on. */
function fitAdvice(sheet: ProjectSheet, members: readonly ProjectView[], extent: ModelExtent): string {
  const sizes = members.map((v) => viewExtent(v, extent));
  const fitting = SHEET_SCALES.find((s) => fitsScale(sizes, drawingArea(sheet), s));
  return fitting ? `The most detailed scale at which they fit is 1:${fitting}.` : 'They fit at no offered scale: use a larger sheet or fewer views.';
}

export const ifcsheetPlaceView: Tool = {
  name: 'ifcsheet_place_view',
  description:
    'Put a view on a sheet. Without sheet: the engine\'s own rule hangs it beside the others on the last sheet of its series (plans, elevations, sections) while there is room, else on a new sheet numbered next in that series; a 3D view belongs to no series, so it needs a sheet. With sheet (an id or number from ifcsheet_list_sheets): it is added to that sheet at slot (0-based position among the views on it, default last). scale is the denominator of the drawing scale, 100 for 1:100, one of ' +
    SHEET_SCALES.join(', ') +
    '; a sheet draws all its views at one scale, so every view on it is laid out again at it. Without scale the most detailed of 1:50, 1:100, 1:200 that fits is used. Errors, without changing anything, when the views do not fit the sheet\'s drawing area at that scale. A view already on another sheet is moved. Returns the sheet (number, views with slot and scale).',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      view: { type: 'string', description: 'The view\'s id or name.' },
      sheet: { type: 'string', description: 'The sheet\'s id or number. Omit to let the engine choose or make one.' },
      scale: { type: 'number', description: 'Scale denominator: 100 means 1:100.' },
      slot: { type: 'integer', minimum: 0, description: 'Position among the sheet\'s views, 0 first. Needs sheet.' },
    },
    required: ['document_id', 'view'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const doc = entry.set.document;
    const extent = extentOf(entry);
    const view = findView(doc, text(input, 'view'));
    const scale = optNumber(input, 'scale', 1, 10_000, true);
    if (scale !== undefined && !(SHEET_SCALES as readonly number[]).includes(scale)) throw invalid(`scale must be one of ${SHEET_SCALES.join(', ')} (100 means 1:100).`, { got: scale });
    const slot = optNumber(input, 'slot', 0, 1000, true);
    const sheetRef = optText(input, 'sheet');
    if (slot !== undefined && sheetRef === undefined) throw invalid('slot needs sheet: the position is among the views on that sheet.');
    const target = sheetRef === undefined ? undefined : findSheet(doc, sheetRef);
    if (target && entry.schedules.some((s) => s.sheetId === target.id)) throw invalid(`Sheet ${target.number} prints a schedule; views go on other sheets.`);

    // A view already hung is taken off its sheet first; what stays there is laid out again at the scale it had.
    const viewsOn = (s: ProjectSheet) => (s.viewports ?? []).flatMap((vp) => doc.views.find((v) => v.id === vp.viewId && v.id !== view.id) ?? []);
    let sheets = doc.sheets.map((s) => {
      if (!(s.viewports ?? []).some((vp) => vp.viewId === view.id)) return s;
      const rest = viewsOn(s);
      return { ...s, viewports: rest.length === 0 ? [] : laidOut(s, rest, (s.viewports ?? []).find((vp) => vp.viewId !== view.id)?.scale ?? 100, extent).viewports };
    });

    let placedOn: ProjectSheet;
    if (target) {
      const current = sheets.find((s) => s.id === target.id)!;
      const members = viewsOn(current);
      if (slot !== undefined && slot > members.length) throw invalid(`slot ${slot} is past the end: sheet ${current.number} has ${members.length} view${members.length === 1 ? '' : 's'} (slots 0 to ${members.length}).`);
      members.splice(slot ?? members.length, 0, view);
      const sizes = members.map((v) => viewExtent(v, extent));
      const use = scale ?? scaleOn(sizes, current);
      if (!fitsScale(sizes, drawingArea(current), use)) {
        throw invalid(`${members.map((v) => v.name).join(', ')} do not fit sheet ${current.number} at 1:${use}. ${fitAdvice(current, members, extent)}`, { sheet: current.number, scale: use });
      }
      placedOn = laidOut(current, members, use, extent);
      sheets = sheets.map((s) => (s.id === placedOn.id ? placedOn : s));
    } else {
      const hung = withViewHung(sheets, doc.views, view, extent, Date.now(), {}, doc.sheetNumbering ?? DEFAULT_SCHEME);
      if (!hung) throw invalid(`'${view.name}' belongs to no sheet series (a 3D view does): give sheet.`);
      sheets = hung.sheets;
      placedOn = sheets.find((s) => s.id === hung.sheetId)!;
      if (scale !== undefined) {
        const members = viewsOn(placedOn).concat(view);
        const sizes = members.map((v) => viewExtent(v, extent));
        if (!fitsScale(sizes, drawingArea(placedOn), scale)) {
          throw invalid(`${members.map((v) => v.name).join(', ')} do not fit sheet ${placedOn.number} at 1:${scale}. ${fitAdvice(placedOn, members, extent)} Name a larger sheet with sheet.`, { sheet: placedOn.number, scale });
        }
        placedOn = laidOut(placedOn, members, scale, extent);
        sheets = sheets.map((s) => (s.id === placedOn.id ? placedOn : s));
      }
    }
    replaceSheetDocument(entry, sheetsPatch(doc, sheets));
    const reported = sheetsOf(entry).find((s) => s.id === placedOn.id)!;
    return okResult(
      `Placed '${view.name}' on ${reported.number} (${reported.name}, ${reported.paper}) at ${reported.views.find((v) => v.viewId === view.id)?.scale}.`,
      { document_id: entry.id, sheet: reported, new_sheet: !doc.sheets.some((s) => s.id === placedOn.id) },
    );
  },
};

// ---- ifcsheet_set_title_block ----

const FIELDS = Object.keys(FIELD_PARAMS);
const FIELD_MAX = 200;

export const ifcsheetSetTitleBlock: Tool = {
  name: 'ifcsheet_set_title_block',
  description:
    `Set title block fields. fields is an object of text values, keys among: ${FIELDS.join(', ')} (date is ISO, YYYY-MM-DD; each value at most ${FIELD_MAX} characters; an empty string blanks the field). Without sheet the fields are the project's, printed on every sheet; with sheet (an id or number) they are that sheet's own and win over the project's. The sheet number and name are not fields: they are the sheet's. A set with no title block layout prints project, sheet number and name, scale and date on a sheet; the other fields are kept in the project (ifcsheet_save_project) for the app's title block layouts. Returns the fields the sheet or the project has afterwards.`,
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      fields: { type: 'object', description: 'Field name to text, e.g. {"client": "Muster AG", "drawnBy": "AB"}.', additionalProperties: { type: 'string' } },
      sheet: { type: 'string', description: 'A sheet\'s id or number: set the fields for that sheet only. Omit for the whole project.' },
    },
    required: ['document_id', 'fields'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const doc = entry.set.document;
    const given = input.fields;
    if (typeof given !== 'object' || given === null || Array.isArray(given) || Object.keys(given).length === 0) {
      throw invalid(`fields must be an object with at least one of: ${FIELDS.join(', ')}.`);
    }
    for (const [key, value] of Object.entries(given)) {
      if (!FIELDS.includes(key)) throw invalid(`Unknown title block field '${key}'. Fields: ${FIELDS.join(', ')}.`);
      if (typeof value !== 'string' || value.length > FIELD_MAX) throw invalid(`Field '${key}' must be text of at most ${FIELD_MAX} characters.`);
    }
    if (typeof (given as Record<string, unknown>).date === 'string' && (given as Record<string, string>).date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test((given as Record<string, string>).date)) {
      throw invalid('date must be an ISO date, YYYY-MM-DD.');
    }
    const sheetRef = optText(input, 'sheet');
    const target = sheetRef === undefined ? undefined : findSheet(doc, sheetRef);
    const values = given as Record<string, string>;
    const next: ProjectDocument = target
      ? sheetsPatch(doc, doc.sheets.map((s) => (s.id === target.id ? { ...s, titleBlock: { ...s.titleBlock, ...values } } : s)))
      : { ...doc, titleBlock: { ...doc.titleBlock, ...values } };
    replaceSheetDocument(entry, next);
    const printed = sheetFields(target ? next.sheets.find((s) => s.id === target.id)! : { titleBlock: undefined }, next);
    return okResult(
      `Set ${Object.keys(values).join(', ')} for ${target ? `sheet ${target.number}` : 'the project'}.`,
      { document_id: entry.id, scope: target ? target.number : 'project', fields: printed },
    );
  },
};

// ---- ifcsheet_renumber ----

const OVERRIDES = ['keep', 'renumber'] as const;

export const ifcsheetRenumber: Tool = {
  name: 'ifcsheet_renumber',
  description:
    'Renumber the sheets by a numbering scheme. preset "default" numbers by series: A-001 general, A-101 plans, A-201 elevations, A-301 sections, A-401 interior elevations, A-501 drafting views, A-601 schedules, A-901 other; "sequential" runs A01, A02, A03... through the whole set in sheet order. discipline (at most 8 characters, default "A") is printed first on every number. Sheet numbers typed by hand are kept unless overrides is "renumber". With dry_run true nothing changes and the table of changes is returned. Without preset the project\'s current scheme is applied again (this closes gaps). Returns changes: [{from, to}] and the scheme in force.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      preset: { type: 'string', enum: Object.keys(SCHEME_PRESETS), description: 'The numbering scheme.' },
      discipline: { type: 'string', maxLength: 8, description: 'The letter(s) printed first, default "A".' },
      overrides: { type: 'string', enum: [...OVERRIDES], description: 'keep (default): numbers typed by hand stay. renumber: they are renumbered too.' },
      dry_run: { type: 'boolean', description: 'Report the changes without making them.' },
    },
    required: ['document_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const doc = entry.set.document;
    const preset = optChoice(input, 'preset', Object.keys(SCHEME_PRESETS) as (keyof typeof SCHEME_PRESETS)[]);
    const discipline = optText(input, 'discipline');
    if (discipline !== undefined && (discipline.length === 0 || discipline.length > 8)) throw invalid('discipline must be 1 to 8 characters.');
    const overrides = optChoice(input, 'overrides', OVERRIDES) ?? 'keep';
    const dry = optBoolean(input, 'dry_run') ?? false;
    const scheme: NumberingScheme = { ...(preset ? SCHEME_PRESETS[preset] : doc.sheetNumbering ?? DEFAULT_SCHEME), ...(discipline ? { discipline } : {}) };
    const rows = planRenumber(doc.sheets, scheme, overrides);
    const changes = rows.filter((r) => r.from !== r.to).map((r) => ({ from: r.from, to: r.to }));
    if (!dry) replaceSheetDocument(entry, { ...doc, sheets: renumbered(doc.sheets, rows, overrides), sheetNumbering: scheme });
    return okResult(
      `${dry ? 'Would renumber' : 'Renumbered'} ${changes.length} of ${rows.length} sheets${changes.length ? `: ${changes.map((c) => `${c.from} to ${c.to}`).join(', ')}` : ''}.`,
      { document_id: entry.id, dry_run: dry, changes, sheets: dry ? doc.sheets.map((s) => s.number) : sheetsOf(entry).map((s) => s.number), scheme: { discipline: scheme.discipline, continuous: scheme.continuous, plans: scheme.groups.plans } },
    );
  },
};

export const ifcsheetEditTools: Tool[] = [ifcsheetListSheets, ifcsheetAddView, ifcsheetPlaceView, ifcsheetSetTitleBlock, ifcsheetRenumber];
