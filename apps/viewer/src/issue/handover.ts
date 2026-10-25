/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The handover package of an issue (#83): which files go in it and what each is called. Pure: the sheets are drawn and the schedules
 * read elsewhere (`handover-collect.ts`), and the names and the archive are the engine's one builder
 * (`@bimvoice/ifcsheet/handover`, which `ifcsheet build --handover` uses too).
 *
 * The tokens of a pattern (`{project} {number} {sheet} {revision} {date} {issue}`) are read per file. A sheet's DXF has all of them;
 * a file of the set as a whole (the PDF, the IFC, a schedule, the register) has no number or revision, and its `{sheet}` is its own
 * title: the issue's name for the PDF, the model's for the IFC, the schedule's for a schedule. So the default pattern, `{number} {sheet}`,
 * names the files as an issue always has: `A-101 Ground floor.dxf`, `Issue 1.pdf`.
 */

import { buildHandoverZip, type HandoverFile, type HandoverPart, type HandoverTokens } from '@bimvoice/ifcsheet/handover';
import type { IssuePlan } from './plan';

export interface HandoverModel {
  /** The file as it was opened (`Haus.ifc`); its name without the extension is `{sheet}`. */
  name: string;
  /** The bytes as loaded, unchanged. */
  bytes: Uint8Array;
}

export interface HandoverWorkbook {
  /** The schedule's name (`{sheet}`). */
  name: string;
  xlsx: Uint8Array;
}

export interface HandoverSource {
  /** `ProjectDocument.handoverPattern`; absent is the default. */
  pattern?: string;
  project: string;
  plan: IssuePlan;
  /** The issued PDF of the whole set. */
  pdf: Uint8Array;
  /** Sheet id → its DXF. */
  dxfs: ReadonlyMap<string, Uint8Array>;
  models: readonly HandoverModel[];
  schedules: readonly HandoverWorkbook[];
  /** The drawing register of this issue as a workbook, and its title (`Issue 1 drawing list`). */
  register: HandoverWorkbook;
}

const stemOf = (fileName: string): string => fileName.replace(/\.(ifc|ifcx|ifczip)$/i, '');

/** The files of the package, in the order they are listed in: the PDF, a DXF per sheet, the IFC, the schedules, the register. */
export function handoverParts(src: HandoverSource): HandoverPart[] {
  const { plan } = src;
  const set: HandoverTokens = { project: src.project, date: plan.date, issue: plan.name };
  const parts: HandoverPart[] = [{ kind: 'pdf', extension: 'pdf', tokens: { ...set, sheet: plan.name }, data: src.pdf }];
  for (const { sheet, row } of plan.sheets) {
    const data = src.dxfs.get(sheet.id);
    if (data) parts.push({ kind: 'dxf', extension: 'dxf', tokens: { ...set, number: row.number, sheet: row.title, revision: row.revision }, data });
  }
  for (const m of src.models) parts.push({ kind: 'ifc', extension: /\.ifcx$/i.test(m.name) ? 'ifcx' : 'ifc', tokens: { ...set, sheet: stemOf(m.name) }, data: m.bytes });
  for (const s of src.schedules) parts.push({ kind: 'schedule', extension: 'xlsx', tokens: { ...set, sheet: s.name }, data: s.xlsx });
  parts.push({ kind: 'register', extension: 'xlsx', tokens: { ...set, sheet: src.register.name }, data: src.register.xlsx });
  return parts;
}

/** The package as one ZIP, with the names it holds. */
export function buildHandover(src: HandoverSource): { zip: Uint8Array; files: HandoverFile[] } {
  return buildHandoverZip(src.pattern, handoverParts(src));
}
