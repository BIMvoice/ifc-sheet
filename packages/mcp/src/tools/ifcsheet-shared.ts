/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the `ifcsheet_*` tools share: reading and checking their inputs with
 * errors an agent can act on, finding a sheet or a view by what the agent
 * sees, the one summary of a set every tool returns, and the guard on the
 * paths they write to.
 */

import { newHistory } from './ifcsheet-history.js';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { paperLabel, paperOf, type ModelExtent, type ProjectDocument, type ProjectSheet, type ProjectView } from '@bimvoice/ifcsheet';
import type { ToolContext } from '../context.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { resolveSafePath } from '../safe-path.js';
import { sourcePaths, type SheetSetEntry } from './ifcsheet-store.js';

export const DOCUMENT_ID = { type: 'string', description: 'The document_id returned by ifcsheet_generate_set, ifcsheet_apply_template or ifcsheet_load_project.' } as const;

export const invalid = (message: string, details?: Record<string, unknown>): ToolExecutionError =>
  new ToolExecutionError({ code: ToolErrorCode.INVALID_INPUT, message, ...(details ? { details } : {}) });

/** A required, non-empty string input. */
export function text(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || v.trim() === '') throw invalid(`${key} is required: a non-empty string.`);
  return v;
}

/** An optional string input; undefined when absent. */
export function optText(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw invalid(`${key} must be a string.`);
  return v;
}

/** An optional finite number input, within [min, max]. */
export function optNumber(input: Record<string, unknown>, key: string, min: number, max: number, whole = false): number | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (whole && !Number.isInteger(v))) {
    throw invalid(`${key} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
  }
  return v;
}

/** An optional input that is one of `values`. */
export function optChoice<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]): T | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) throw invalid(`${key} must be one of: ${values.join(', ')}.`, { got: v });
  return v as T;
}

export function optBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw invalid(`${key} must be true or false.`);
  return v;
}

/** A sheet by its id or its number ("A-101", any case). */
export function findSheet(doc: ProjectDocument, ref: string): ProjectSheet {
  const key = ref.trim().toLowerCase();
  const found = doc.sheets.find((s) => s.id === ref) ?? doc.sheets.find((s) => s.number.trim().toLowerCase() === key);
  if (found) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No sheet '${ref}' in this set. Give a sheet id or number from ifcsheet_list_sheets.`,
    details: { sheets: doc.sheets.map((s) => s.number) },
  });
}

/** A view by its id or its exact name (any case). */
export function findView(doc: ProjectDocument, ref: string): ProjectView {
  const key = ref.trim().toLowerCase();
  const found = doc.views.find((v) => v.id === ref) ?? doc.views.find((v) => v.name.trim().toLowerCase() === key);
  if (found) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No view '${ref}' in this set. Give a view id or name from ifcsheet_list_sheets (views and unplaced_views).`,
    details: { views: doc.views.map((v) => v.name) },
  });
}

/** The paper of a sheet, for people and for machines. */
const paperOfSheet = (s: ProjectSheet) => ({ paper: paperLabel(s.paper ?? 'A1'), paperMm: paperOf(s), orientation: s.orientation ?? 'landscape' });

/** The sheets of a set as every tool reports them: number, name, paper and, for each view on it, its kind, scale and place. */
export function sheetsOf(entry: SheetSetEntry) {
  const doc = entry.set.document;
  const viewName = (id: string) => doc.views.find((v) => v.id === id);
  return doc.sheets.map((s) => {
    const schedule = entry.schedules.find((x) => x.sheetId === s.id);
    return {
      id: s.id,
      number: s.number,
      name: s.name,
      ...paperOfSheet(s),
      ...(schedule ? { schedule: schedule.kind } : {}),
      views: (s.viewports ?? []).map((vp, slot) => {
        const view = viewName(vp.viewId);
        return { slot, viewId: vp.viewId, view: view?.name, kind: view?.kind, scale: `1:${vp.scale}`, x: vp.x, y: vp.y };
      }),
    };
  });
}

/** Views no sheet shows yet. */
export function unplacedViews(doc: ProjectDocument) {
  const hung = new Set(doc.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  return doc.views.filter((v) => !hung.has(v.id)).map((v) => ({ id: v.id, name: v.name, kind: v.kind }));
}

/**
 * A path to write a file to: inside the allowed paths, never a file an opened model was read from,
 * and never an .ifc file. Nothing else on disk is written by these tools.
 */
export async function outputPath(raw: unknown, ctx: ToolContext, want?: { extension: string }): Promise<string> {
  const path = await resolveSafePath(raw, ctx, 'write');
  // An .ifc file is written only when the caller asks for one by name (the annotated copy of the issue, a new file); an opened model never.
  if ((extname(path).toLowerCase() === '.ifc' && want?.extension !== '.ifc') || sourcePaths(ctx).includes(path)) {
    throw invalid(`Refusing to write '${path}': the drawing-set tools never write IFC files or the model they opened.`);
  }
  if (want && extname(path).toLowerCase() !== want.extension) throw invalid(`The file must end in ${want.extension}: '${path}'.`);
  return path;
}

/** The text of a file on the server, or of an inline argument: exactly one of `${key}_path` and `${key}_json`. */
export async function pathOrInline(input: Record<string, unknown>, ctx: ToolContext, key: string, what: string): Promise<{ source: string; text: string }> {
  const path = input[`${key}_path`];
  const inline = input[`${key}_json`];
  if ((path === undefined) === (inline === undefined)) throw invalid(`Give exactly one of ${key}_path (a ${what} file on the server) or ${key}_json (its text).`);
  if (typeof inline === 'string') return { source: `${key}_json`, text: inline };
  if (inline !== undefined) throw invalid(`${key}_json must be a string: the text of the ${what} file.`);
  if (typeof path !== 'string') throw invalid(`${key}_path must be a string.`);
  const source = await resolveSafePath(path, ctx, 'read');
  try {
    return { source, text: await readFile(source, 'utf8') };
  } catch (err) {
    throw invalid(`Cannot read '${source}': ${(err as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (err as Error).message}`);
  }
}

/** The model's extent, which every view and placement is measured on. A set exists only for a model that has one. */
export function extentOf(entry: SheetSetEntry): ModelExtent {
  const extent = entry.model.model.extent;
  if (!extent) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The model has no geometry, so views cannot be measured.' });
  return extent;
}

/** The `dry_run` input of the editing tools. */
export const DRY_RUN = { type: 'boolean', description: 'Report what the call would change, and change nothing in the session. The result is the real call\'s, with dry_run true.' } as const;

/**
 * The entry an editing tool writes to. A dry run gets a copy of the session's entry (its own `set` and `schedules`), so the tool runs
 * the same code as the real call and its edit lands on the copy: the session's entry is never touched, by construction.
 */
export function workingEntry(entry: SheetSetEntry, dry: boolean): SheetSetEntry {
  return dry ? { ...entry, set: { ...entry.set }, schedules: [...entry.schedules], history: newHistory() } : entry;
}

/** The words of a result, said as a plan when nothing was changed. */
export const dryPrefix = (dry: boolean, message: string): string => (dry ? `Dry run, nothing changed. ${message}` : message);

/** What `ifcsheet_list_sheets` and the `ifcsheet://session/sheets` resource say of a set: one function, so they cannot differ. */
export function sheetListing(entry: SheetSetEntry) {
  const doc = entry.set.document;
  return { document_id: entry.id, name: doc.name, sheets: sheetsOf(entry), unplaced_views: unplacedViews(doc), title_block: doc.titleBlock ?? {} };
}
