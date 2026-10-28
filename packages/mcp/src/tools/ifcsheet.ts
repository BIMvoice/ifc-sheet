/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawing-set tools (#165, first slice), over the `@bimvoice/ifcsheet` engine:
 * `ifcsheet_open_model` opens an IFC model for drawing, `ifcsheet_generate_set`
 * lays out its starting set of sheets, `ifcsheet_export_pdf` writes the set as
 * one PDF, `ifcsheet_check_readiness` says what the model lacks and which
 * drawings are weaker for it (the report of `ifcsheet check`, #164). The `ifcsheet_` prefix keeps them apart from the model tools
 * (`model_load`, `export_ifc`, ...): these hold their own handles, not
 * registry models. The engine is imported on first use, so a server that
 * never draws a set does not load the PDF writer or the geometry engine.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { describeReadiness, paperLabel, paperOf } from '@bimvoice/ifcsheet';
import type { ProjectFacts } from '@bimvoice/ifcsheet/project';
import type { ToolContext } from '../context.js';
import type { Tool } from './types.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import { okResult } from './util.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { resolveSafePath } from '../safe-path.js';
import { drawSet } from './ifcsheet-draw.js';
import { assertWithinLimit, outputPath } from './ifcsheet-shared.js';
import { hostedModelCache } from './hosted-model-cache.js';
import { addSheetModel, addSheetSet, getSheetModel, getSheetSet } from './ifcsheet-store.js';

const MODEL_ID = { type: 'string', description: 'The model_id returned by ifcsheet_open_model.' } as const;

async function modelBytes(input: Record<string, unknown>, ctx: ToolContext): Promise<{ name: string; bytes: Uint8Array; path?: string }> {
  const { file_path: path, ifc_base64: base64 } = input;
  if ((typeof path === 'string') === (typeof base64 === 'string')) {
    throw new ToolExecutionError({
      code: ToolErrorCode.INVALID_INPUT,
      message: 'Give exactly one of file_path (an .ifc or .ifcx file on the server) or ifc_base64 (the file\'s bytes, base64).',
    });
  }
  if (typeof base64 === 'string') {
    const cap = ctx.config.maxModelBytes;
    // The decoded size is known from the text before anything is allocated.
    if (cap !== undefined && Math.floor(base64.length * 3 / 4) > cap) {
      throw new ToolExecutionError({
        code: ToolErrorCode.INVALID_INPUT,
        message: `The model is larger than the ${cap.toLocaleString()} byte limit of this server; it was not opened.`,
        details: { limit_bytes: cap },
      });
    }
    return { name: typeof input.name === 'string' ? input.name : 'model.ifc', bytes: new Uint8Array(Buffer.from(base64, 'base64')) };
  }
  const filePath = await resolveSafePath(path, ctx, 'read');
  try {
    return { name: basename(filePath), bytes: new Uint8Array(await readFile(filePath)), path: filePath };
  } catch (err) {
    throw new ToolExecutionError({
      code: ToolErrorCode.INVALID_INPUT,
      message: `Cannot read '${filePath}': ${(err as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (err as Error).message}`,
    });
  }
}

/** Opens the model a call carries (file_path or ifc_base64) and enters it in the session. */
async function openEntry(input: Record<string, unknown>, ctx: ToolContext) {
  const { name, bytes, path } = await modelBytes(input, ctx);
  const { openModel } = await import('@bimvoice/ifcsheet/headless');
  let model;
  let contentHash: string | undefined;
  try {
    // The hosted endpoint keeps parsed models per instance by content hash, so a session that resends a model does not parse it again.
    if (ctx.config.hosted) ({ model, hash: contentHash } = await hostedModelCache.open(bytes, openModel));
    else model = await openModel(bytes);
  } catch (err) {
    throw new ToolExecutionError({ code: ToolErrorCode.PARSE_FAILED, message: `Failed to open '${name}': ${(err as Error).message}` });
  }
  if (model.dataStore.entityCount === 0) {
    throw new ToolExecutionError({ code: ToolErrorCode.PARSE_FAILED, message: `'${name}' holds no IFC entities: it is not an IFC or IFCX model.` });
  }
  return addSheetModel(ctx, name, model, { bytes, path, contentHash });
}

export const ifcsheetOpenModel: Tool = {
  name: 'ifcsheet_open_model',
  description:
    'Open an IFC or IFCX model for drawing-set work (the format is read from the content): parses it and meshes its geometry. Returns a model_id handle for ifcsheet_generate_set, plus a summary (project name, storeys with elevations, element and mesh counts). This is a separate handle from model_load; it does not register the model for the query tools. Next step: ifcsheet_generate_set.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to an .ifc or .ifcx file on the server (must be inside the allowed paths). Give this or ifc_base64.' },
      ifc_base64: { type: 'string', description: 'The .ifc file\'s bytes, base64-encoded. Give this or file_path.' },
      name: { type: 'string', description: 'A display name for the model when ifc_base64 is used. Default "model.ifc".' },
    },
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = await openEntry(input, ctx);
    const { name, model } = entry;
    const summary = {
      model_id: entry.id,
      name,
      projectName: model.projectName,
      storeys: [...model.storeys].sort((a, b) => a.elevation - b.elevation).map((s) => ({ name: s.name, elevation: s.elevation })),
      storeyCount: model.storeys.length,
      elementCount: model.dataStore.entityCount,
      meshCount: model.meshes.length,
      hasGeometry: model.extent !== null,
      // The building's box in the viewer frame (X east, Y up, Z south), metres: the coordinates a section plane is given in.
      extent: model.extent,
    };
    return okResult(
      `Opened '${name}' as ${entry.id}: project '${summary.projectName}', ${summary.storeyCount} storeys, ${summary.meshCount} meshes. Next: ifcsheet_generate_set.`,
      summary,
    );
  },
};

export const ifcsheetGenerateSet: Tool = {
  name: 'ifcsheet_generate_set',
  description:
    'Lay out the default drawing set of an opened model: a floor plan per storey, elevations, and proposed sections, hung on numbered sheets (A-101 plans, A-201/A-202 elevations, A-301 sections). Returns document_id (pass it to ifcsheet_export_pdf), the sheets (number, name, paper, the views on each), the views (kind, level), and the full project document as JSON. Fails if the model has no geometry.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      model_id: { type: 'string', description: 'The model_id returned by ifcsheet_open_model. Give this or ifc_base64.' },
      ifc_base64: { type: 'string', description: 'The .ifc file\'s bytes, base64: opens the model and lays out its set in this one call (the way to use the hosted endpoint, which keeps nothing between requests). Give this or model_id.' },
      name: { type: 'string', description: 'Project name printed in the title blocks. Default: the model\'s project name.' },
    },
    additionalProperties: false,
  },
  async handler(input, ctx) {
    if ((input.model_id === undefined) === (input.ifc_base64 === undefined)) {
      throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: 'Give exactly one of model_id (from ifcsheet_open_model) or ifc_base64 (the file\'s bytes, base64).' });
    }
    const entry = input.ifc_base64 !== undefined ? await openEntry(input, ctx) : getSheetModel(ctx, input.model_id as string);
    const { generateDefaultSet } = await import('@bimvoice/ifcsheet');
    const set = generateDefaultSet(entry.model, typeof input.name === 'string' ? { name: input.name } : {});
    if (!set) {
      throw new ToolExecutionError({
        code: ToolErrorCode.UNSUPPORTED_OPERATION,
        message: `Model '${entry.id}' has no geometry inside its storeys, so there is nothing to lay a drawing set out on.`,
      });
    }
    const stored = addSheetSet(ctx, entry.id, set);
    const { views, sheets } = set.document;
    const viewInfo = (id: string) => views.find((v) => v.id === id);
    const summary = {
      document_id: stored.id,
      model_id: entry.id,
      name: set.document.name,
      sheets: sheets.map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        paper: paperLabel(s.paper ?? 'A1'),
        paperMm: paperOf(s),
        viewports: (s.viewports ?? []).map((vp) => ({ viewId: vp.viewId, view: viewInfo(vp.viewId)?.name, scale: `1:${vp.scale}`, x: vp.x, y: vp.y, width: vp.width, height: vp.height })),
      })),
      views: views.map((v) => ({ id: v.id, name: v.name, kind: v.kind, ...(v.kind === 'plan' ? { level: v.level.name } : {}) })),
      notes: set.notes,
      document: set.document,
    };
    return okResult(
      `Laid out ${sheets.length} sheets (${sheets.map((s) => s.number).join(', ')}) with ${views.length} views as ${stored.id}. Next: ifcsheet_export_pdf.`,
      summary,
    );
  },
};

export const ifcsheetExportPdf: Tool = {
  name: 'ifcsheet_export_pdf',
  description:
    'Write a generated drawing set as one PDF, a page per sheet at true scale. Give file_path to write the file on the server and get back the path, page count and size; omit file_path to get the PDF as base64 in the result instead.',
  scope: 'export',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The document_id returned by ifcsheet_generate_set.' },
      file_path: { type: 'string', description: 'Where to write the .pdf (must be inside the allowed paths; missing folders are created). Omit to receive base64 bytes in pdf_base64.' },
    },
    required: ['document_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, input.document_id as string);
    const { set, model, id } = entry;
    const { exportPdf } = await import('@bimvoice/ifcsheet/headless');
    const { sheets, notes } = await drawSet(entry, model);
    const pdf = await exportPdf(sheets, { title: set.document.name });
    const pages = sheets.length;
    const base = { document_id: id, pages, sheets: sheets.map((s) => s.number), bytes: pdf.byteLength, notes };
    const said = notes.length ? ` Not printed: ${notes.join(' ')}` : '';
    if (typeof input.file_path !== 'string') {
      return okResult(`Exported ${pages} pages (${pdf.byteLength.toLocaleString()} bytes) as base64.${said}`, { ...base, pdf_base64: Buffer.from(pdf).toString('base64') });
    }
    const filePath = await outputPath(input.file_path, ctx);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, pdf);
    return okResult(`Wrote ${pages} pages (${pdf.byteLength.toLocaleString()} bytes) to ${filePath}.${said}`, { ...base, file_path: filePath });
  },
};

/** The saved project a check reads, from `project_path` (a file on the server) or `project_json` (its text); undefined when neither is given. */
async function projectOf(input: Record<string, unknown>, ctx: Parameters<Tool['handler']>[1]): Promise<{ source: string; project: ProjectFacts } | undefined> {
  const { project_path: path, project_json: json } = input;
  if (path !== undefined && json !== undefined) {
    throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: 'Give project_path or project_json, not both.' });
  }
  if (path === undefined && json === undefined) return undefined;
  if (path !== undefined && typeof path !== 'string') throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: 'project_path must be a string.' });
  if (json !== undefined && typeof json !== 'string') throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: 'project_json must be a string: the text of the project file.' });
  let source: string;
  let text: string;
  if (typeof path === 'string') {
    source = await resolveSafePath(path, ctx, 'read');
    try {
      assertWithinLimit(ctx, (await stat(source)).size, `'${source}'`);
      text = await readFile(source, 'utf8');
    } catch (err) {
      if (err instanceof ToolExecutionError) throw err;
      throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: `Cannot read '${source}': ${(err as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (err as Error).message}` });
    }
  } else {
    source = 'project_json';
    text = json as string;
    assertWithinLimit(ctx, Buffer.byteLength(text, 'utf8'), 'project_json');
  }
  const { readProjectFile } = await import('@bimvoice/ifcsheet/headless');
  try {
    return { source, project: readProjectFile(text) };
  } catch (err) {
    throw new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message: `${source} cannot be used as a project: ${(err as Error).message}` });
  }
}

export const ifcsheetCheckReadiness: Tool = {
  name: 'ifcsheet_check_readiness',
  description:
    'Say what an opened model lacks that the drawing set reads (building storeys, rooms, materials, quantity sets, unique GlobalIds) and which drawings or schedules are weaker for it. Returns ready (true when nothing would weaken the drawings) and the findings, each with its kind, what is missing, what is weaker (plain English) and the counts. The same report as `ifcsheet check`. Needs a model_id from ifcsheet_open_model. Optionally also reads a saved IfcSheet project (project_path, or project_json with the file\'s text): then a schedule split into parts is checked as the app checks it, for an element listed in more than one part or in none (kinds subReportDuplicates and subReportGaps), using the project\'s joinery catalogue and symbol mapping.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      model_id: MODEL_ID,
      project_path: { type: 'string', description: 'Path to a saved project (.ifclite-project.json) on the server (must be inside the allowed paths). Give this or project_json, or neither to check the model alone.' },
      project_json: { type: 'string', description: 'The text of a saved project file. Give this or project_path.' },
    },
    required: ['model_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetModel(ctx, input.model_id as string);
    const read = await projectOf(input, ctx);
    const { readinessWithProject } = await import('@bimvoice/ifcsheet/headless');
    const findings = readinessWithProject(entry.model, read?.project, entry.id).map((f) => ({ kind: f.kind, ...describeReadiness(f), params: f.params }));
    const ready = findings.length === 0;
    return okResult(
      ready
        ? `Model ${entry.id} has what the drawing set reads: storeys, rooms, materials, quantities.`
        : `Model ${entry.id} lacks ${findings.length} thing${findings.length === 1 ? '' : 's'} the drawings read: ${findings.map((f) => f.missing).join(' ')}`,
      { model_id: entry.id, ...(read ? { project: read.source } : {}), ready, findings },
    );
  },
};

/** The four tools of this file; the other tool files register their own groups (`ifcsheet-tools.ts`). */
export const toolGroup: ToolGroup = {
  order: 10,
  tools: [ifcsheetOpenModel, ifcsheetGenerateSet, ifcsheetExportPdf, ifcsheetCheckReadiness],
};
