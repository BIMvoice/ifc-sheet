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
import { openModel } from './model.js';
import { readProjectFile } from './project-read.js';
import type { CliIo } from './cli.js';
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

/** `ifcsheet classify`: exit 0 with the table, 1 when a file cannot be read or the project holds no such mapping. */
export async function classify(args: ClassifyArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  let projectText: string;
  try { bytes = new Uint8Array(await readFile(args.model)); } catch (error) { io.stderr(cannotRead(args.model, error)); return 1; }
  try { projectText = await readFile(args.project, 'utf8'); } catch (error) { io.stderr(cannotRead(args.project, error)); return 1; }
  let project;
  try { project = readProjectFile(projectText); } catch (error) { io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`); return 1; }
  const mapping = chosenMapping(project.classificationMappings, args.system);
  if (!mapping) {
    io.stderr(args.system
      ? `ifcsheet: ${args.project} has no classification system "${args.system}"; it has: ${project.classificationMappings.map((m) => systemLabel(m.system)).join(', ') || 'none'}.\n`
      : `ifcsheet: ${args.project} holds no classification mapping; add one in the app (Classification codes) and save the project.\n`);
    return 1;
  }
  const say = cliSayFor(commandLanguage({ project, ...(args.locale !== undefined ? { locale: args.locale } : {}) }, io));
  const model = await openModel(bytes, { geometry: false });
  const rows = classifiedTypes(readBoqElements(storeSource('model', model.dataStore), new Set()), [mapping], storeClassifications(new Map([['model', model.dataStore]])));
  if (args.json) {
    io.stdout(`${JSON.stringify({ file: args.model, project: args.project, system: systemLabel(mapping.system), types: rows.map((r) => ({ class: r.className, type: r.typeName, code: r.code || null, title: r.title || null, source: r.source, count: r.count })) }, null, 2)}\n`);
  } else if (args.csv) {
    io.stdout(classifyCsv(rows));
  } else {
    io.stdout(`${args.model}: ${systemLabel(mapping.system)}\n\n`);
    for (const r of rows) io.stdout(`${(r.code || '-').padEnd(18)} ${plain(r.className)}${r.typeName ? `: ${r.typeName}` : say('classify.noType')}  x${r.count}${r.source === 'model' ? `  ${say('classify.fromModel')}` : ''}\n`);
    const missing = rows.filter((r) => r.source === 'none').reduce((n, r) => n + r.count, 0);
    if (missing > 0) io.stdout(`\n${say('classify.noCode', { count: missing })}\n`);
  }
  return 0;
}
