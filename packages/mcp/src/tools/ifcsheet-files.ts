/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tools that start a set from a file or write one to disk (#165, second
 * slice): apply a set template, export the DXF, issue the set (PDF, DXF, the
 * drawing register, the handover package), save and load the project file.
 * They write only to the paths the caller gives, inside the allowed paths,
 * never an IFC file and never the model that was opened.
 */

import { newHistory } from './ifcsheet-history.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { escapeCsvCell } from '@ifc-lite/export';
import {
  PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, declaredVersion, describeTemplateNote, generateDefaultSet, levelsFromStoreys, parseSetTemplate, readBoqArticles, readClassificationMappings, readListScheduleDef,
  readProjectSet, readSchedule,
  type ProjectDocument, type SetTemplate, type TemplateNoteKey,
} from '@bimvoice/ifcsheet';
import { readUnderlays } from '@bimvoice/ifcsheet/underlay-read';
import { buildHandoverZip, asciiStem, type HandoverPart } from '@bimvoice/ifcsheet/handover';
import { dxfName } from '@bimvoice/ifcsheet/sheet-file-name';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { ToolContext } from '../context.js';
import { annotatedCopy } from './ifcsheet-annotated.js';
import { drawSet } from './ifcsheet-draw.js';
import { SCHEDULES_KEY, projectFileBody } from './ifcsheet-project-file.js';
import { DOCUMENT_ID, DRY_RUN, dryPrefix, findSheet, invalid, optBoolean, optText, outputPath, pathOrInline, sheetsOf, text, unplacedViews } from './ifcsheet-shared.js';
import { addSheetSet, getSheetModel, getSheetSet, type SetSchedule } from './ifcsheet-store.js';
import type { Tool } from './types.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import { okResult } from './util.js';

const MODEL_ID = { type: 'string', description: 'The model_id returned by ifcsheet_open_model.' } as const;

/** Writes `data` to `path` (made to exist), after the same checks as every path these tools write. */
async function write(path: string, ctx: ToolContext, data: Uint8Array | string, want?: { extension: string }): Promise<{ file: string; bytes: number }> {
  const file = await outputPath(path, ctx, want);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  return { file, bytes: typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength };
}

/** The sentence that says what a loaded project holds that was not printed; empty when nothing was left out. */
const notedIn = (notes: readonly string[]): string => (notes.length ? ` Not printed: ${notes.join(' ')}` : '');

// ---- ifcsheet_apply_template ----

export const ifcsheetApplyTemplate: Tool = {
  name: 'ifcsheet_apply_template',
  description:
    'Lay out the drawing set of an opened model by a set template (.bvset, the file the app saves from a finished set): which sheets, which views on them, at which scale, on which paper, numbered by the template\'s scheme. The same as `ifcsheet build --template`. Give template_path (a .bvset file on the server) or template_json (its text). A rule that finds no view in this model (a third storey it does not have) is skipped and said in notes; so are views the template did not foresee and schedules it carries (add those with ifcsheet_add_schedule). Returns a new document_id, the sheets and the notes. Fails if the model has no geometry. With dry_run true no set is made (document_id is null): the sheets and notes it would give are returned.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      model_id: MODEL_ID,
      template_path: { type: 'string', description: 'A .bvset file on the server (inside the allowed paths). Give this or template_json.' },
      template_json: { type: 'string', description: 'The text of a .bvset file.' },
      dry_run: DRY_RUN,
      name: { type: 'string', description: 'The project name printed in the title blocks. Default: the model\'s.' },
    },
    required: ['model_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetModel(ctx, text(input, 'model_id'));
    const given = await pathOrInline(input, ctx, 'template', 'set template');
    let setTemplate: SetTemplate;
    try {
      setTemplate = parseSetTemplate(given.text);
    } catch (err) {
      throw invalid(`${given.source} cannot be used as a set template: ${(err as Error).message}`);
    }
    const name = optText(input, 'name');
    const set = generateDefaultSet(entry.model, { ...(name ? { name } : {}), setTemplate });
    if (!set) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: `Model '${entry.id}' has no geometry inside its storeys, so there is nothing to lay a drawing set out on.` });
    const dry = optBoolean(input, 'dry_run') ?? false;
    // A dry run lays the set out and reports it, but never enters it in the session (no document_id is made).
    const stored = dry ? { id: '', modelId: entry.id, model: entry, set, schedules: [], history: newHistory() } : addSheetSet(ctx, entry.id, set);
    const notes = set.notes.filter((n) => n.key.startsWith('setTemplate.')).map((n) => describeTemplateNote({ key: n.key as TemplateNoteKey, params: n.params }));
    const sheets = sheetsOf(stored);
    return okResult(
      dryPrefix(dry, `${dry ? 'Would lay out' : 'Laid out'} ${sheets.length} sheets (${sheets.map((s) => s.number).join(', ')}) from the template${dry ? '' : ` as ${stored.id}`}.`),
      { document_id: dry ? null : stored.id, dry_run: dry, model_id: entry.id, name: set.document.name, sheets, unplaced_views: unplacedViews(set.document), notes },
    );
  },
};

// ---- ifcsheet_export_dxf ----

export const ifcsheetExportDxf: Tool = {
  name: 'ifcsheet_export_dxf',
  description:
    'Write the sheets of a drawing set as DXF files, one per sheet, into a directory on the server: named by sheet number (A-101.dxf), paper millimetres, the same files as `ifcsheet build --dxf`.  Like the engine\'s DXF, the files hold lines and no text. Give sheet (an id or number) to write one sheet only. The directory is created if absent and must be inside the allowed paths. Returns the files written (sheet, file, bytes).',
  scope: 'export',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      directory: { type: 'string', description: 'The directory to write into.' },
      sheet: { type: 'string', description: 'One sheet\'s id or number. Default: every sheet.' },
    },
    required: ['document_id', 'directory'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const directory = await outputPath(input.directory, ctx);
    const one = optText(input, 'sheet');
    const { exportDxf } = await import('@bimvoice/ifcsheet/headless');
    const drawn = await drawSet(entry, entry.model);
    const only = one === undefined ? undefined : findSheet(entry.set.document, one).id;
    const wanted = drawn.sheets.filter((g) => only === undefined || g.sheetId === only);
    const used = new Set<string>();
    const files = [];
    for (const sheet of wanted) {
      const written = await write(join(directory, dxfName(sheet.number, used)), ctx, exportDxf(sheet));
      files.push({ sheet: sheet.number, ...written });
    }
    return okResult(`Wrote ${files.length} DXF file${files.length === 1 ? '' : 's'} to ${directory}.${notedIn(drawn.notes)}`, { document_id: entry.id, directory, files, notes: drawn.notes });
  },
};

// ---- ifcsheet_issue_set ----

const REGISTER_HEADER = ['Number', 'Name', 'Paper', 'Scale', 'Views'];

export const ifcsheetIssueSet: Tool = {
  name: 'ifcsheet_issue_set',
  description:
    'Issue the set: write into a directory on the server the PDF (a page per sheet, true scale; <project>.pdf), a DXF per sheet (dxf/A-101.dxf, ...), the drawing register as CSV (register.csv: number, name, paper, scale, views, one row per sheet), and the CSV of every schedule sheet (schedules/). With annotated_ifc true also <model>.annotated.ifc, the annotated copy of the IFC (#82): the headless tools hold no drafts (dimensions, tags and notes are the app\'s), so the copy carries no annotations, and the result says so; it is a new file, the opened IFC is never written. With handover true also handover.zip: the PDF, the DXFs, the register, the schedules and the IFC as it was opened (and the annotated copy, with annotated_ifc), named by pattern (tokens {project} {number} {sheet} {revision} {date} {issue}, default "{number} {sheet}"; plain ASCII), the package `ifcsheet build --handover` writes. The directory is created if absent, must be inside the allowed paths, and the opened IFC is never written to. Returns every file with its size, the page count and the sheet numbers.',
  scope: 'export',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      directory: { type: 'string', description: 'The directory to write into.' },
      handover: { type: 'boolean', description: 'Also write handover.zip. Default false.' },
      pattern: { type: 'string', description: 'handover: how its files are named. Default "{number} {sheet}".' },
      annotated_ifc: { type: 'boolean', description: 'Also write <model>.annotated.ifc, a copy of the IFC made by the annotated-IFC export (and put it in handover.zip). This build holds no drafts, so the copy has no annotations; the result says so. Default false.' },
    },
    required: ['document_id', 'directory'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const doc = entry.set.document;
    const directory = await outputPath(input.directory, ctx);
    const handover = optBoolean(input, 'handover') ?? false;
    const pattern = optText(input, 'pattern');
    if (pattern !== undefined && !handover) throw invalid('pattern is for handover: true.');
    const annotate = optBoolean(input, 'annotated_ifc') ?? false;
    const { exportDxf, exportPdf } = await import('@bimvoice/ifcsheet/headless');
    const drawn = await drawSet(entry, entry.model);
    const pdf = await exportPdf(drawn.sheets, { title: doc.name });
    // Built before anything is written, so a copy that cannot be made leaves the directory as it was.
    const annotated = annotate ? await annotatedCopy(entry) : undefined;
    const dxfs = drawn.sheets.map((sheet) => ({ sheet, text: exportDxf(sheet) }));
    const register = [REGISTER_HEADER, ...sheetsOf(entry).map((s) => [s.number, s.name, s.paper, [...new Set(s.views.map((v) => v.scale))].join(' '), s.views.map((v) => v.view ?? '').join('; ')])].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n') + '\r\n';

    const stem = asciiStem(doc.name) || 'drawing-set';
    const files: { kind: string; file: string; bytes: number }[] = [];
    const put = async (kind: string, name: string, data: Uint8Array | string) => files.push({ kind, ...(await write(join(directory, name), ctx, data)) });
    await put('pdf', `${stem}.pdf`, pdf);
    const used = new Set<string>();
    const dxfNames = dxfs.map((d) => dxfName(d.sheet.number, used));
    for (const [i, d] of dxfs.entries()) await put('dxf', join('dxf', dxfNames[i]), d.text);
    await put('register', 'register.csv', register);
    if (annotated) files.push({ kind: 'annotated_ifc', ...(await write(join(directory, annotated.name), ctx, annotated.bytes, { extension: '.ifc' })) });
    const scheduleFiles: { schedule: SetSchedule; name: string; csv: string; sheetName: string; number: string }[] = [];
    for (const s of drawn.schedules) {
      const sheet = doc.sheets.find((x) => x.id === s.schedule.sheetId)!;
      const name = `${dxfName(sheet.number, new Set()).replace(/\.dxf$/, '')}.csv`;
      scheduleFiles.push({ schedule: s.schedule, name, csv: s.table.csv, sheetName: sheet.name, number: sheet.number });
      await put('schedule', join('schedules', name), s.table.csv);
    }
    let zip: { file: string; bytes: number; files: string[] } | undefined;
    if (handover) {
      const tokens = { project: doc.name, date: new Date().toISOString().slice(0, 10) };
      const enc = new TextEncoder();
      const parts: HandoverPart[] = [
        { kind: 'pdf', extension: 'pdf', tokens: { ...tokens, sheet: doc.name }, data: pdf },
        ...dxfs.map((d): HandoverPart => ({ kind: 'dxf', extension: 'dxf', tokens: { ...tokens, number: d.sheet.number, sheet: d.sheet.name }, data: enc.encode(d.text) })),
        { kind: 'register', extension: 'csv', tokens: { ...tokens, sheet: 'Drawing register' }, data: enc.encode(register) },
        ...scheduleFiles.map((s): HandoverPart => ({ kind: 'schedule', extension: 'csv', tokens: { ...tokens, number: s.number, sheet: s.sheetName }, data: enc.encode(s.csv) })),
        { kind: 'ifc', extension: 'ifc', tokens: { ...tokens, sheet: entry.model.name.replace(/\.ifc$/i, '') }, data: entry.model.bytes },
        ...(annotated ? [{ kind: 'ifc' as const, extension: 'ifc', tokens: { ...tokens, sheet: `${entry.model.name.replace(/\.ifc$/i, '')} annotated` }, data: annotated.bytes }] : []),
      ];
      const built = buildHandoverZip(pattern, parts);
      const written = await write(join(directory, 'handover.zip'), ctx, built.zip);
      files.push({ kind: 'handover', ...written });
      zip = { ...written, files: built.files.map((f) => f.name) };
    }
    return okResult(
      `Issued ${drawn.sheets.length} sheets to ${directory}: ${files.length} files${handover ? ' (with handover.zip)' : ''}.${notedIn(drawn.notes)}`,
      { document_id: entry.id, directory, notes: drawn.notes, pages: drawn.sheets.length, sheets: drawn.sheets.map((s) => s.number), files, ...(zip ? { handover: zip } : {}), ...(annotated ? { annotated_ifc: annotated.report(files.find((f) => f.kind === 'annotated_ifc')!) } : {}) },
    );
  },
};

// ---- ifcsheet_save_project / ifcsheet_load_project ----

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const ifcsheetSaveProject: Tool = {
  name: 'ifcsheet_save_project',
  description:
    'Save the drawing set as a project file (.ifclite-project.json, format "ifclite-project" version 1) so a later session can ifcsheet_load_project it, and `ifcsheet check --project` and the app can read it. It holds the project document (views, sheets, title block, numbering) and the schedule sheets. Anything else a loaded file held (the app\'s drafts, styles, issues) is kept and written back as it was read. file_path must end in .json, be inside the allowed paths, and is never an .ifc file or the opened model; missing folders are created; an existing file is replaced. Returns the file, its size and the sheet numbers.',
  scope: 'export',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      file_path: { type: 'string', description: 'Where to write the project, e.g. /work/haus.ifclite-project.json.' },
    },
    required: ['document_id', 'file_path'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const path = await outputPath(input.file_path, ctx, { extension: '.json' });
    const body = { ...projectFileBody(entry), savedAt: new Date().toISOString() };
    const written = await write(path, ctx, JSON.stringify(body, null, 2));
    return okResult(`Saved ${entry.set.document.sheets.length} sheets and ${entry.set.document.views.length} views to ${written.file}.`, { document_id: entry.id, ...written, sheets: entry.set.document.sheets.map((s) => s.number) });
  },
};

/** The document of a project file's text, checked as far as the engine reads it; throws a message an agent can act on. */
function readDocument(raw: unknown, modelName: string): { document: ProjectDocument; schedules: SetSchedule[]; dropped: string[] } {
  if (!isObject(raw) || raw.format !== PROJECT_FILE_FORMAT) throw invalid(`Not a project file: its "format" must be "${PROJECT_FILE_FORMAT}".`);
  const version = declaredVersion(raw);
  if (version === null) throw invalid('Not a project file: its "version" must be a whole number from 1.');
  if (version > PROJECT_FILE_VERSION) throw invalid(`The project file is version ${version}; this build reads up to ${PROJECT_FILE_VERSION}. Update @ifc-lite/mcp.`);
  if (!Array.isArray(raw.views) || !Array.isArray(raw.sheets)) throw invalid('Not a project file: "views" and "sheets" must be arrays.');
  // The views, sheets and drafts are read by the reader the app and `ifcsheet build` use (#479), so a file one refuses the others refuse too.
  let set;
  try {
    set = readProjectSet(raw);
  } catch (err) {
    throw invalid((err as Error).message);
  }
  // A viewport shows a view of the file, or a schedule the app placed (a schedule of the file's "schedules").
  const targets = new Set([...set.views.map((v) => v.id), ...(Array.isArray(raw.schedules) ? raw.schedules : []).flatMap((s) => readSchedule(s)?.id ?? [])]);
  for (const [i, s] of set.sheets.entries()) {
    for (const [j, vp] of (s.viewports ?? []).entries()) {
      if (!targets.has(vp.viewId)) throw invalid(`sheets[${i}].viewports[${j}] shows a view the project does not have.`);
    }
  }
  const sheetIds = new Set(set.sheets.map((s) => s.id));
  const { [SCHEDULES_KEY]: savedSchedules, underlays: _raw, ...rest } = raw;
  const dropped: string[] = [];
  const schedules: SetSchedule[] = [];
  const articles = readBoqArticles(raw.boqArticles);
  for (const s of Array.isArray(savedSchedules) ? savedSchedules : []) {
    if (isObject(s) && s.kind === 'list' && typeof s.sheetId === 'string' && sheetIds.has(s.sheetId) && (s.locale === 'en' || s.locale === 'ro')) {
      const list = readListScheduleDef(s.list);
      if (list.columns.length === 0) dropped.push('a saved list schedule with no readable column');
      else schedules.push({ id: `schedule-${schedules.length + 1}`, kind: 'list', sheetId: s.sheetId, locale: s.locale, list, ...(typeof s.name === 'string' ? { name: s.name } : {}), ...(Array.isArray(s.classificationMappings) ? { classificationMappings: readClassificationMappings(s.classificationMappings) } : {}) });
    } else if (isObject(s) && (s.kind === 'rooms' || s.kind === 'boq') && typeof s.sheetId === 'string' && sheetIds.has(s.sheetId) && (s.locale === 'en' || s.locale === 'ro')) {
      const own = Array.isArray(s.boqArticles) ? readBoqArticles(s.boqArticles) : articles;
      schedules.push({ id: `schedule-${schedules.length + 1}`, kind: s.kind, sheetId: s.sheetId, locale: s.locale, ...(s.kind === 'boq' ? { boqArticles: own } : {}) });
    } else dropped.push('a saved schedule that does not match a sheet');
  }
  // The same reader as the command-line build: an underlay missing its point or scale is refused with its path, not drawn.
  let underlays: ReturnType<typeof readUnderlays>;
  try { underlays = readUnderlays(raw); } catch (e) { throw invalid(e instanceof Error ? e.message : String(e)); }
  const document = { ...rest, ...(underlays.length > 0 ? { underlays } : {}), name: typeof raw.name === 'string' && raw.name ? raw.name : modelName, models: Array.isArray(raw.models) ? raw.models : [], views: set.views, sheets: set.sheets } as unknown as ProjectDocument;
  return { document, schedules, dropped };
}

export const ifcsheetLoadProject: Tool = {
  name: 'ifcsheet_load_project',
  description:
    'Load a saved project file (.ifclite-project.json, written by ifcsheet_save_project or by the app) as a drawing set on an opened model, to continue editing, export or issue it. Give model_id (the model the project is for) and project_path (a file on the server) or project_json (its text). The views, sheets, title block and numbering are used as stored; the plans are cut on the model\'s storeys. The drafts the app drew on the views (dimensions, texts, lines) and the list schedules it placed on sheets are printed by the exports as `ifcsheet build --project` prints them. A file with the wrong format, a newer version, or a sheet showing a view the file does not have is refused with the reason. Returns a new document_id, the sheets and the views not placed.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      model_id: MODEL_ID,
      project_path: { type: 'string', description: 'A project file on the server (inside the allowed paths). Give this or project_json.' },
      project_json: { type: 'string', description: 'The text of a project file.' },
    },
    required: ['model_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetModel(ctx, text(input, 'model_id'));
    if (!entry.model.extent) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: `Model '${entry.id}' has no geometry, so a project cannot be drawn on it.` });
    const given = await pathOrInline(input, ctx, 'project', 'project');
    let parsed: unknown;
    try {
      parsed = JSON.parse(given.text);
    } catch (err) {
      throw invalid(`${given.source} is not JSON: ${(err as Error).message}`);
    }
    let read;
    try {
      read = readDocument(parsed, entry.model.projectName || entry.name);
    } catch (err) {
      if (err instanceof ToolExecutionError) throw new ToolExecutionError({ code: err.code, message: `${given.source} cannot be used as a project: ${err.message}` });
      throw err;
    }
    const stored = addSheetSet(ctx, entry.id, { document: read.document, levels: levelsFromStoreys(entry.model.storeys), notes: [] });
    stored.schedules.push(...read.schedules);
    const sheets = sheetsOf(stored);
    return okResult(
      `Loaded ${sheets.length} sheets and ${read.document.views.length} views as ${stored.id}.`,
      { document_id: stored.id, model_id: entry.id, name: read.document.name, sheets, unplaced_views: unplacedViews(read.document), ...(read.dropped.length ? { dropped: read.dropped } : {}) },
    );
  },
};

export const ifcsheetFileTools: Tool[] = [ifcsheetApplyTemplate, ifcsheetExportDxf, ifcsheetIssueSet, ifcsheetSaveProject, ifcsheetLoadProject];

export const toolGroup: ToolGroup = { order: 40, tools: ifcsheetFileTools };
