/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet classify model.ifc --project p.ifclite-project.json [--system <name or id>]` (#89): the model's types with the classification code each
 * has, from the same function the app's schedules and tags call (`classificationOf`): the model's own IfcClassificationReference first, else
 * the project's mapping. Text, CSV or JSON.
 */

import { readFile } from 'node:fs/promises';
import { escapeCsvCell } from '@ifc-lite/export';
import { classifiedTypes, mappingsFor, systemLabel, type ClassificationMapping, type ClassifiedType } from './classification.js';
import { storeClassifications } from './classification-read.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { openModel, type OpenedModel } from './model.js';
import { readProjectFile } from './project-read.js';
import type { CliIo } from './cli.js';
import type { NameLanguage } from './names.js';
import { commandLanguage } from './cli-language.js';
import { cliSayFor } from './cli-words.js';

export interface ClassifyArgs {
  model: string;
  project: string;
  /** A mapping's id or system name; absent: the project's first mapping. */
  system?: string;
  csv: boolean;
  json: boolean;
  /** `--locale` as given; the project's language, when it records one, comes first. */
  locale?: string;
}

const cannotRead = (file: string, error: unknown): string =>
  `ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`;

const plain = (c: string): string => c.replace(/^Ifc/, '');

/** The mapping `choice` names (its id, or its system's name or label, case aside); the first when none is named. */
export function chosenMapping(all: readonly ClassificationMapping[], choice: string | undefined): ClassificationMapping | undefined {
  if (!choice) return all[0];
  const key = choice.trim().toLowerCase();
  return mappingsFor(all, choice)[0] ?? all.find((m) => m.system.name.toLowerCase() === key || systemLabel(m.system).toLowerCase() === key);
}

/** The table as CSV: a byte order mark and CRLF ends like the app's file; text is guarded against a spreadsheet reading it as a formula (the one escaper, `@ifc-lite/export`). */
export function classifyCsv(rows: readonly ClassifiedType[]): string {
  const line = (cells: readonly (string | number)[]): string => cells.map((c) => (typeof c === 'number' ? String(c) : escapeCsvCell(c, { delimiter: ',', exemptNumbers: false }))).join(',');
  return `﻿${[line(['Class', 'Type', 'Code', 'Title', 'Source', 'Count']), ...rows.map((r) => line([plain(r.className), r.typeName ?? '', r.code, r.title, r.source, r.count]))].join('\r\n')}\r\n`;
}

/** Everything `ifcsheet classify` prints for a model, as values: the one computation of the command and of the MCP tool `ifcsheet_classify`. */
export interface ClassifyOutput {
  rows: ClassifiedType[];
  system: string;
  /** What `--json` prints (before it is written as text). A code or title nothing gives is null. */
  json: { file: string; project: string; system: string; types: { class: string; type: string | null; code: string | null; title: string | null; source: string; count: number }[] };
  csv: string;
  text: string;
}

/** The classification of an opened model's types by the mapping `system` names (the first when none is named), or the sentence saying why there is none. */
export function classifyOutput(file: string, projectName: string, model: Pick<OpenedModel, 'dataStore'>, mappings: readonly ClassificationMapping[], system: string | undefined, language: NameLanguage = 'en'): ClassifyOutput | { error: string } {
  const mapping = chosenMapping(mappings, system);
  if (!mapping) {
    return { error: system
      ? `${projectName} has no classification system "${system}"; it has: ${mappings.map((m) => systemLabel(m.system)).join(', ') || 'none'}.`
      : `${projectName} holds no classification mapping; add one in the app (Classification codes) and save the project.` };
  }
  const rows = classifiedTypes(readBoqElements(storeSource('model', model.dataStore), new Set()), [mapping], storeClassifications(new Map([['model', model.dataStore]])));
  const say = cliSayFor(language);
  let text = `${file}: ${systemLabel(mapping.system)}\n\n`;
  for (const r of rows) text += `${(r.code || '-').padEnd(18)} ${plain(r.className)}${r.typeName ? `: ${r.typeName}` : say('classify.noType')}  x${r.count}${r.source === 'model' ? `  ${say('classify.fromModel')}` : ''}\n`;
  const missing = rows.filter((r) => r.source === 'none').reduce((n, r) => n + r.count, 0);
  if (missing > 0) text += `\n${say('classify.noCode', { count: missing })}\n`;
  return {
    rows, system: systemLabel(mapping.system), text, csv: classifyCsv(rows),
    json: { file, project: projectName, system: systemLabel(mapping.system), types: rows.map((r) => ({ class: r.className, type: r.typeName, code: r.code || null, title: r.title || null, source: r.source, count: r.count })) },
  };
}

/** `ifcsheet classify`: exit 0 with the table, 1 when a file cannot be read or the project holds no such mapping. */
export async function classify(args: ClassifyArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  let projectText: string;
  try { bytes = new Uint8Array(await readFile(args.model)); } catch (error) { io.stderr(cannotRead(args.model, error)); return 1; }
  try { projectText = await readFile(args.project, 'utf8'); } catch (error) { io.stderr(cannotRead(args.project, error)); return 1; }
  let project;
  try { project = readProjectFile(projectText); } catch (error) { io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`); return 1; }
  const language = commandLanguage({ project, ...(args.locale !== undefined ? { locale: args.locale } : {}) }, io);
  const model = await openModel(bytes, { geometry: false });
  const out = classifyOutput(args.model, args.project, model, project.classificationMappings, args.system, language);
  if ('error' in out) {
    io.stderr(`ifcsheet: ${out.error}\n`);
    return 1;
  }
  if (args.json) io.stdout(`${JSON.stringify(out.json, null, 2)}\n`);
  else if (args.csv) io.stdout(out.csv);
  else io.stdout(out.text);
  return 0;
}
