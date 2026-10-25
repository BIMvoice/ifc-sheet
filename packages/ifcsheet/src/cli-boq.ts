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
import { BOQ_UNIT_TEXT, boqPropertyNames } from './boq.js';
import { boqMissing, computeBoq, type BoqResult } from './boq-compute.js';
import { boqLineText, boqNotes, boqTable, describeBoqProblem, tidy, type BoqCell, type BoqTable } from './boq-table.js';
import { boqSayFor } from './boq-words.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { openModel } from './model.js';
import { readProjectFile } from './project-read.js';
import type { CliIo } from './cli.js';

export interface BoqArgs {
  model: string;
  project: string;
  csv: boolean;
  json: boolean;
  /** A detail row per type under each article. */
  detail: boolean;
  locale: string;
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

function resultJson(file: string, project: string, result: BoqResult, locale: string): string {
  const say = boqSayFor(locale);
  return JSON.stringify({
    file, project,
    articles: result.lines.map((l) => ({
      code: l.article.code, description: l.article.description, unit: BOQ_UNIT_TEXT[l.article.unit], quantity: l.article.quantity,
      total: l.total === null ? null : tidy(l.total), matched: l.matched, counted: l.counted,
      missing: l.missing.map((m) => ({ globalId: m.globalId, name: m.name, ifcClass: m.ifcClass })),
      refused: l.problem ? describeBoqProblem(l.problem, say) : null,
      byType: l.byType.map((t) => ({ type: t.typeName, class: t.className, matched: t.matched, counted: t.counted, missing: t.missing, total: t.total === null ? null : tidy(t.total) })),
    })),
  }, null, 2);
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
  const result = computeBoq(readBoqElements(storeSource('model', model.dataStore), new Set(boqPropertyNames(project.boqArticles))), project.boqArticles);
  const say = boqSayFor(args.locale);
  if (args.json) io.stdout(`${resultJson(args.model, args.project, result, args.locale)}\n`);
  else if (args.csv) io.stdout(boqCsv(boqTable(result, say, { detail: args.detail }), args.locale));
  else {
    io.stdout(`${say('boq.title')}: ${args.model}\n\n`);
    result.lines.forEach((l, i) => {
      io.stdout(`${i + 1}. ${boqLineText(l, args.locale)}\n`);
      if (args.detail) for (const t of l.byType) io.stdout(`     ${t.typeName ?? t.className}: ${t.total === null ? '–' : tidy(t.total)}\n`);
    });
    const notes = result.lines.flatMap((l) => boqNotes(l, say));
    if (notes.length > 0) io.stdout(`\n${notes.join('\n')}\n`);
    const missing = boqMissing(result);
    if (missing.elements > 0) io.stdout(`\n${missing.elements} elements lack a quantity an article takes: ${missing.list}.\n`);
  }
  return result.lines.some((l) => l.problem) ? 1 : 0;
}
