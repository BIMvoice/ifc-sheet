/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet boq model.ifc --project p.ifclite-project.json` (#75): the antemasuratoare of a model on the command line, the same
 * sums the app prints (`computeBoq`, the one function) over the articles the project file holds. Text, CSV or JSON. The XLSX is the
 * app's (its one writer, `schedule-export.ts`, loads a spreadsheet library the engine does not carry).
 */

import { readFile } from 'node:fs/promises';
import { escapeCsvCell } from '@ifc-lite/export';
import { BOQ_UNIT_TEXT, boqPropertyNames, type BoqArticle } from './boq.js';
import { boqMissing, computeBoq, type BoqResult } from './boq-compute.js';
import { boqLineText, boqNotes, boqTable, describeBoqProblem, tidy, type BoqCell, type BoqTable } from './boq-table.js';
import { boqSayFor } from './boq-words.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { openModel, type OpenedModel } from './model.js';
import { sheetNumber } from './sheet-number.js';
import { sheetFormat } from './units-and-numbers.js';
import { readProjectFile, type ProjectFacts } from './project-read.js';
import type { CliIo } from './cli.js';
import { commandLanguage } from './cli-language.js';
import { cliSayFor } from './cli-words.js';
import { nameLanguageOf } from './names.js';

export interface BoqArgs {
  model: string;
  project: string;
  csv: boolean;
  json: boolean;
  /** A detail row per type under each article. */
  detail: boolean;
  /** `--locale` as given; the project's language, when it records one, comes first (`cli-language.ts`). */
  locale?: string;
}

const cannotRead = (file: string, error: unknown): string =>
  `ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`;

/** A CSV cell: text is guarded against a spreadsheet reading it as a formula (the one escaper, `@ifc-lite/export`), figures are written plain. */
function csvCell(v: BoqCell, delimiter: string): string {
  if (v === null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return escapeCsvCell(v, { delimiter, exemptNumbers: false });
}

/** The table as CSV: a byte order mark and CRLF ends like the app's file, `;` between columns where the decimal mark is a comma. */
export function boqCsv(table: BoqTable, locale: string): string {
  const delimiter = /^ro\b/i.test(locale) ? ';' : ',';
  const line = (cells: readonly BoqCell[]) => cells.map((c) => csvCell(c, delimiter)).join(delimiter);
  return `﻿${[line(table.header), ...table.rows.map(line), ...table.notes.map((n) => line([n]))].join('\r\n')}\r\n`;
}

/** The sums of `articles` over a model's entity tables: the one computation of `ifcsheet boq` and the MCP schedule. */
export function boqResult(dataStore: OpenedModel['dataStore'], articles: readonly BoqArticle[]): BoqResult {
  return computeBoq(readBoqElements(storeSource('model', dataStore), new Set(boqPropertyNames(articles))), articles);
}

/** The sums as a JSON value: a figure is its plain number, a total nothing counted is null (never 0). */
function resultJson(file: string, project: string, result: BoqResult, locale: string) {
  const say = boqSayFor(locale);
  return {
    file, project,
    articles: result.lines.map((l) => ({
      code: l.article.code, description: l.article.description, unit: BOQ_UNIT_TEXT[l.article.unit], quantity: l.article.quantity,
      total: l.total === null ? null : tidy(l.total), matched: l.matched, counted: l.counted,
      missing: l.missing.map((m) => ({ globalId: m.globalId, name: m.name, ifcClass: m.ifcClass })),
      refused: l.problem ? describeBoqProblem(l.problem, say) : null,
      byType: l.byType.map((t) => ({ type: t.typeName, class: t.className, matched: t.matched, counted: t.counted, missing: t.missing, total: t.total === null ? null : tidy(t.total) })),
    })),
  };
}

/** Everything `ifcsheet boq` prints for a model, as values: the one computation of the command and of the MCP tool `ifcsheet_boq`. */
export interface BoqOutput {
  result: BoqResult;
  /** What `--json` prints (before it is written as text). */
  json: ReturnType<typeof resultJson>;
  /** What `--csv` prints. */
  csv: string;
  /** What the plain run prints: the articles in the project's "Units and numbers" format, the notes, and the count of elements lacking a quantity. */
  text: string;
  /** True when an article was refused: the command exits 1. */
  refused: boolean;
}

/** The bill of quantities of `project`'s articles over an opened model. */
export function boqOutput(file: string, projectName: string, model: OpenedModel, project: Pick<ProjectFacts, 'boqArticles' | 'unitsAndNumbers'>, locale: string, detail: boolean): BoqOutput {
  const result = boqResult(model.dataStore, project.boqArticles);
  const say = boqSayFor(locale);
  // The figures people read are written as the sheet writes them: the language with the project's "Units and numbers" (#88).
  const format = sheetFormat(locale, project.unitsAndNumbers);
  let text = `${say('boq.title')}: ${file}\n\n`;
  result.lines.forEach((l, i) => {
    text += `${i + 1}. ${boqLineText(l, format)}\n`;
    if (detail) for (const t of l.byType) text += `     ${t.typeName ?? t.className}: ${t.total === null ? '–' : sheetNumber(format, tidy(t.total))}\n`;
  });
  const notes = result.lines.flatMap((l) => boqNotes(l, say));
  if (notes.length > 0) text += `\n${notes.join('\n')}\n`;
  const missing = boqMissing(result);
  if (missing.elements > 0) text += `\n${cliSayFor(nameLanguageOf(locale) ?? 'en')('boq.missing', { count: missing.elements, list: missing.list })}\n`;
  return {
    result, text,
    json: resultJson(file, projectName, result, locale),
    csv: boqCsv(boqTable(result, say, { detail }), locale),
    refused: result.lines.some((l) => l.problem),
  };
}

/** `ifcsheet boq`: exit 0 with the sums, 1 when a file cannot be read, the project holds no article or an article was refused. */
export async function boq(args: BoqArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  let projectText: string;
  try { bytes = new Uint8Array(await readFile(args.model)); } catch (error) { io.stderr(cannotRead(args.model, error)); return 1; }
  try { projectText = await readFile(args.project, 'utf8'); } catch (error) { io.stderr(cannotRead(args.project, error)); return 1; }
  let project;
  try { project = readProjectFile(projectText); } catch (error) { io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`); return 1; }
  if (project.boqArticles.length === 0) {
    io.stderr(`ifcsheet: ${args.project} holds no bill-of-quantities articles; add them in the app (Bill of quantities) and save the project.\n`);
    return 1;
  }
  // The quantities are read from the entity tables: no geometry is needed or measured.
  const model = await openModel(bytes, { geometry: false });
  const language = commandLanguage({ project, ...(args.locale !== undefined ? { locale: args.locale } : {}) }, io);
  const out = boqOutput(args.model, args.project, model, project, language, args.detail);
  if (args.json) io.stdout(`${JSON.stringify(out.json, null, 2)}\n`);
  else if (args.csv) io.stdout(out.csv);
  else io.stdout(out.text);
  return out.refused ? 1 : 0;
}
