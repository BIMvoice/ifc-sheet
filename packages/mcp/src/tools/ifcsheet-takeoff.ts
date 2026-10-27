/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantity-takeoff tools: `ifcsheet_rooms`, `ifcsheet_materials`, `ifcsheet_boq`, `ifcsheet_list` and `ifcsheet_classify`, the MCP side of
 * the commands of the same names. Each calls the engine function its command calls (`roomsOutput`, `materialsOutput`, `boqOutput`,
 * `listOutput`, `classifyOutput`: the command prints their result, the tool returns it), so the tool and the command cannot differ.
 * Read-only. A quantity the model does not declare is null in the result, never 0.
 */

import type { ProjectFacts } from '@bimvoice/ifcsheet/headless';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { DOCUMENT_ID, invalid, optBoolean, optChoice, optText, pathOrInline, text } from './ifcsheet-shared.js';
import { getSheetModel, getSheetSet, type SheetModelEntry } from './ifcsheet-store.js';
import type { Tool } from './types.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import { okResult } from './util.js';

const LOCALES = ['en', 'ro'] as const;

const MODEL = {
  model_id: { type: 'string', description: 'The model_id returned by ifcsheet_open_model. Give this or document_id.' },
  document_id: { ...DOCUMENT_ID, description: 'A document_id of a drawing set: its model is read. Give this or model_id.' },
} as const;
const PROJECT = (what: string) => ({
  project_path: { type: 'string', description: `${what} A saved project (.ifclite-project.json) on the server, inside the allowed paths. Give this or project_json.` },
  project_json: { type: 'string', description: 'The text of a saved project file.' },
}) as const;
const LOCALE = { type: 'string', enum: [...LOCALES], description: 'The language of the headings and of the text: "ro" writes 12,50. Default en. The project\'s "Units and numbers" setting then decides the separator and decimals of the text.' } as const;
const OUTPUT_NOTE = 'Returns the same values `--json` prints, with numbers as numbers and a missing quantity as null (never 0), plus text (what the command prints) and csv. Read-only.';

/** The model a call names: `model_id`, or the model of the set `document_id` names; exactly one. An unknown id is refused with the ids that exist. */
function modelOf(input: Record<string, unknown>, ctx: Parameters<Tool['handler']>[1]): SheetModelEntry {
  if ((input.model_id === undefined) === (input.document_id === undefined)) throw invalid('Give exactly one of model_id (from ifcsheet_open_model) or document_id (from ifcsheet_generate_set).');
  return input.document_id !== undefined ? getSheetSet(ctx, text(input, 'document_id')).model : getSheetModel(ctx, text(input, 'model_id'));
}

/** The project text a call carries; undefined when it carries none and `required` is false. */
async function projectText(input: Record<string, unknown>, ctx: Parameters<Tool['handler']>[1], required: boolean): Promise<{ source: string; text: string } | undefined> {
  if (!required && input.project_path === undefined && input.project_json === undefined) return undefined;
  return pathOrInline(input, ctx, 'project', 'saved project');
}

async function projectOf(given: { source: string; text: string }): Promise<ProjectFacts> {
  const { readProjectFile } = await import('@bimvoice/ifcsheet/headless');
  try {
    return readProjectFile(given.text);
  } catch (err) {
    throw invalid(`${given.source} cannot be used as a project: ${(err as Error).message}`);
  }
}

/** The file a result names: the path the model was read from (what the command prints for the same file), else its name. */
const fileOf = (entry: SheetModelEntry): string => entry.sourcePath ?? entry.name;

const unsupported = (message: string): ToolExecutionError => new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message });

export const ifcsheetRooms: Tool = {
  name: 'ifcsheet_rooms',
  description:
    `The room and area schedule of an opened model, as \`ifcsheet rooms\`: every room (IfcSpace) by level with its number, name, area (m²) and perimeter (m), a total per level and for the building (the urban indicators' Au). An area is the model's NetFloorArea (else GrossFloorArea), else the footprint of the room's geometry; each room says which (source), and a room with no area has area null. ${OUTPUT_NOTE} Optional project_path or project_json: its "Units and numbers" setting formats the text (comma, decimals); the numbers stay plain. Needs a model_id or document_id.`,
  scope: 'read',
  inputSchema: { type: 'object', properties: { ...MODEL, ...PROJECT('Optional.'), locale: LOCALE }, additionalProperties: false },
  async handler(input, ctx) {
    const entry = modelOf(input, ctx);
    const locale = optChoice(input, 'locale', LOCALES) ?? 'en';
    const given = await projectText(input, ctx, false);
    const project = given ? await projectOf(given) : undefined;
    const { roomsOutput } = await import('@bimvoice/ifcsheet/cli-rooms');
    const out = roomsOutput(fileOf(entry), entry.model, locale, project?.unitsAndNumbers);
    if (!out) throw unsupported('The model has no rooms (IfcSpace) to list.');
    return okResult(out.text, { model_id: entry.id, ...(given ? { project: given.source } : {}), units: { area: 'm²', perimeter: 'm' }, ...out.json, text: out.text, csv: out.csv });
  },
};

export const ifcsheetMaterials: Tool = {
  name: 'ifcsheet_materials',
  description:
    `The materials of an opened model and how each draws where a view cuts it (hatch, hatch scale, fill, hatch pen, membrane), as \`ifcsheet materials\`. With a project (project_path or project_json) the project's own materials table applies; a material it has no row for is guessed from its name (auto true). ${OUTPUT_NOTE} Needs a model_id or document_id.`,
  scope: 'read',
  inputSchema: { type: 'object', properties: { ...MODEL, ...PROJECT('Optional.') }, additionalProperties: false },
  async handler(input, ctx) {
    const entry = modelOf(input, ctx);
    const given = await projectText(input, ctx, false);
    const { materialsOutput, readProjectMaterials } = await import('@bimvoice/ifcsheet/cli-materials');
    let table: ReturnType<typeof readProjectMaterials> = [];
    if (given) {
      try {
        table = readProjectMaterials(given.text);
      } catch (err) {
        throw invalid(`${given.source} cannot be used as a project: ${(err as Error).message}`);
      }
    }
    const out = materialsOutput(fileOf(entry), given?.source, entry.model, table);
    return okResult(out.text, { model_id: entry.id, ...out.json, text: out.text });
  },
};

export const ifcsheetBoq: Tool = {
  name: 'ifcsheet_boq',
  description:
    `The bill of quantities (antemasuratoare) of an opened model, as \`ifcsheet boq\`: the articles of a saved project (project_path or project_json, required), each with its total in its own unit (m, m², m³, kg, buc for a count) from the quantities the model declares. A total is null when no element has the quantity; an element lacking it is named in the article's missing list, never counted as 0. An article the engine refuses (no code, no selector, an unknown quantity, a unit mismatch) has refused set to its reason. detail true adds a row per type to the text and CSV (byType is always returned). ${OUTPUT_NOTE} Needs a model_id or document_id.`,
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: { ...MODEL, ...PROJECT('Required.'), detail: { type: 'boolean', description: 'A row per type under each article in text and csv.' }, locale: LOCALE },
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = modelOf(input, ctx);
    const locale = optChoice(input, 'locale', LOCALES) ?? 'en';
    const given = (await projectText(input, ctx, true))!;
    const project = await projectOf(given);
    if (project.boqArticles.length === 0) throw invalid(`${given.source} holds no bill-of-quantities articles; add them in the app (Bill of quantities) and save the project.`);
    const { boqOutput } = await import('@bimvoice/ifcsheet/cli-boq');
    const out = boqOutput(fileOf(entry), given.source, entry.model, project, locale, optBoolean(input, 'detail') ?? false);
    return okResult(out.text, { model_id: entry.id, ...out.json, refused: out.refused, text: out.text, csv: out.csv });
  },
};

export const ifcsheetList: Tool = {
  name: 'ifcsheet_list',
  description:
    `A schedule from the Lists engine over an opened model, as \`ifcsheet list\`: the list schedule of a saved project (project_path or project_json, required), i.e. the elements of its definition by class, storey and property, its columns, grouped and summed. The rows and totals are the Lists panel's. schedule names one by id or name (the only one when the project has one). header, rows (cells are numbers, text or null where an element lacks the value) and totals (or null). ${OUTPUT_NOTE} To lay a list out on a sheet use ifcsheet_add_schedule kind "list". Needs a model_id or document_id.`,
  scope: 'read',
  inputSchema: { type: 'object', properties: { ...MODEL, ...PROJECT('Required.'), schedule: { type: 'string', description: 'The list schedule\'s id or name.' }, locale: LOCALE }, additionalProperties: false },
  async handler(input, ctx) {
    const entry = modelOf(input, ctx);
    const locale = optChoice(input, 'locale', LOCALES) ?? 'en';
    const given = (await projectText(input, ctx, true))!;
    const project = await projectOf(given);
    const { chooseListSchedule, listOutput } = await import('@bimvoice/ifcsheet/cli-list');
    const chosen = chooseListSchedule(given.source, project.schedules, optText(input, 'schedule'));
    if ('error' in chosen) throw invalid(chosen.error);
    const out = listOutput(fileOf(entry), given.source, entry.model, project, chosen.found, locale);
    if (out.empty) throw unsupported(`Nothing to list: the elements of "${chosen.found.name}" are not in ${fileOf(entry)}.`);
    return okResult(out.text, { model_id: entry.id, ...out.json, text: out.text, csv: out.csv });
  },
};

export const ifcsheetClassify: Tool = {
  name: 'ifcsheet_classify',
  description:
    `The model's types with their classification code, as \`ifcsheet classify\`: the model's own IfcClassificationReference first (source "model"), else the project's mapping (a type, a material or a class to the office's code); source "none" and code null when neither gives one. A saved project (project_path or project_json) is required; system picks one of its classification systems (a name or id; default the first). ${OUTPUT_NOTE} Needs a model_id or document_id.`,
  scope: 'read',
  inputSchema: { type: 'object', properties: { ...MODEL, ...PROJECT('Required.'), system: { type: 'string', description: 'A classification system of the project, by name or id. Default: the first.' } }, additionalProperties: false },
  async handler(input, ctx) {
    const entry = modelOf(input, ctx);
    const given = (await projectText(input, ctx, true))!;
    const project = await projectOf(given);
    const { classifyOutput } = await import('@bimvoice/ifcsheet/cli-classify');
    const out = classifyOutput(fileOf(entry), given.source, entry.model, project.classificationMappings, optText(input, 'system'));
    if ('error' in out) throw invalid(out.error);
    return okResult(out.text, { model_id: entry.id, ...out.json, text: out.text, csv: out.csv });
  },
};

export const ifcsheetTakeoffTools: Tool[] = [ifcsheetRooms, ifcsheetMaterials, ifcsheetBoq, ifcsheetList, ifcsheetClassify];

export const toolGroup: ToolGroup = { order: 60, tools: ifcsheetTakeoffTools };
