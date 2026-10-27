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
  DEFAULT_SCHEME, FIELD_PARAMS, SCHEME_PRESETS, SHEET_SCALES, drawingArea,
  fitsScale, placeViewports, planRenumber, renumbered, scaleOn, sheetFields,
  viewExtent, withViewHung,
  type ModelExtent, type NumberingScheme, type ProjectDocument, type ProjectSheet, type ProjectView,
} from '@bimvoice/ifcsheet';
import { ifcsheetAddView } from './ifcsheet-add-view.js';
import { getSheetSet, replaceSheetDocument } from './ifcsheet-store.js';
import {
  DOCUMENT_ID, DRY_RUN, dryPrefix, extentOf, findSheet, findView, invalid, optBoolean, optChoice, optNumber, optText, sheetListing, sheetsOf, text, workingEntry,
} from './ifcsheet-shared.js';
import type { Tool } from './types.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import { okResult } from './util.js';

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
    const listing = sheetListing(entry);
    return okResult(
      `${doc.sheets.length} sheet${doc.sheets.length === 1 ? '' : 's'} (${doc.sheets.map((s) => s.number).join(', ')}), ${doc.views.length} views, ${listing.unplaced_views.length} not placed.`,
      listing,
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
    '; a sheet draws all its views at one scale, so every view on it is laid out again at it. Without scale the most detailed of 1:50, 1:100, 1:200 that fits is used. Errors, without changing anything, when the views do not fit the sheet\'s drawing area at that scale. With dry_run true nothing is placed: the sheet it would give is returned (a new sheet\'s id is not kept). A view already on another sheet is moved. Returns the sheet (number, views with slot and scale).',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      dry_run: DRY_RUN,
      view: { type: 'string', description: 'The view\'s id or name.' },
      sheet: { type: 'string', description: 'The sheet\'s id or number. Omit to let the engine choose or make one.' },
      scale: { type: 'number', description: 'Scale denominator: 100 means 1:100.' },
      slot: { type: 'integer', minimum: 0, description: 'Position among the sheet\'s views, 0 first. Needs sheet.' },
    },
    required: ['document_id', 'view'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const session = getSheetSet(ctx, text(input, 'document_id'));
    const dry = optBoolean(input, 'dry_run') ?? false;
    const entry = workingEntry(session, dry);
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
      dryPrefix(dry, `${dry ? 'Would place' : 'Placed'} '${view.name}' on ${reported.number} (${reported.name}, ${reported.paper}) at ${reported.views.find((v) => v.viewId === view.id)?.scale}.`),
      { document_id: entry.id, dry_run: dry, sheet: reported, new_sheet: !doc.sheets.some((s) => s.id === placedOn.id) },
    );
  },
};

// ---- ifcsheet_set_title_block ----

const FIELDS = Object.keys(FIELD_PARAMS);
const FIELD_MAX = 200;

export const ifcsheetSetTitleBlock: Tool = {
  name: 'ifcsheet_set_title_block',
  description:
    `Set title block fields. fields is an object of text values, keys among: ${FIELDS.join(', ')} (date is ISO, YYYY-MM-DD; each value at most ${FIELD_MAX} characters; an empty string blanks the field). Without sheet the fields are the project's, printed on every sheet; with sheet (an id or number) they are that sheet's own and win over the project's. The sheet number and name are not fields: they are the sheet's. A set with no title block layout prints project, sheet number and name, scale and date on a sheet; the other fields are kept in the project (ifcsheet_save_project) for the app's title block layouts. Returns the fields the sheet or the project has afterwards and changed (each field that differs: from, to). With dry_run true nothing is set and these are what the call would give.`,
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      dry_run: DRY_RUN,
      fields: { type: 'object', description: 'Field name to text, e.g. {"client": "Muster AG", "drawnBy": "AB"}.', additionalProperties: { type: 'string' } },
      sheet: { type: 'string', description: 'A sheet\'s id or number: set the fields for that sheet only. Omit for the whole project.' },
    },
    required: ['document_id', 'fields'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const session = getSheetSet(ctx, text(input, 'document_id'));
    const dry = optBoolean(input, 'dry_run') ?? false;
    const entry = workingEntry(session, dry);
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
    const before: Record<string, string> = sheetFields(target ?? { titleBlock: undefined }, doc);
    const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => (before[key] ?? '') !== value).map(([key, value]) => [key, { from: before[key] ?? '', to: value }]));
    return okResult(
      dryPrefix(dry, `${dry ? 'Would set' : 'Set'} ${Object.keys(values).join(', ')} for ${target ? `sheet ${target.number}` : 'the project'}.`),
      { document_id: entry.id, dry_run: dry, scope: target ? target.number : 'project', fields: printed, changed },
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

export const toolGroup: ToolGroup = { order: 20, tools: ifcsheetEditTools };
