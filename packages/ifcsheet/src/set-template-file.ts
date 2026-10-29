/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The set template file (`.bvset`, #21). It is its own file, not a kind of the
 * library file (`.bvlib`): a library carries definitions (styles, hatches,
 * symbols), a template carries rules for making a set, and a person applies one
 * to a new model without touching the library of the project they are in.
 *
 * Read strictly, as the library is: a wrong format, a version this program does
 * not know or a malformed rule fails with the place of the problem, and nothing
 * is half-loaded. A file only ever grows by adding keys.
 */

import { ELEVATION_DIRECTIONS } from './view-defaults.js';
import { readFrame } from './sheet-frame.js';
import { readNumberingScheme } from './numbering.js';
import { ISO_PAPERS, readPaper } from './paper.js';
import { ANNOTATION_COMMANDS, RULED_SERIES, type Annotations, type AnnotationCommand, type RuledSeries, type ScheduleRule, type SetTemplate, type SheetLayoutRule, type SheetRule, type SlotRule, type ViewRule } from './set-template.js';
import type { ScheduleListKind } from './sub-reports.js';

export const SET_TEMPLATE_FILE_SUFFIX = '.bvset';
export const SET_TEMPLATE_FILE_FORMAT = 'bvset';
export const SET_TEMPLATE_FILE_VERSION = 1;

const SCHEDULE_KINDS: readonly ScheduleListKind[] = ['door', 'window', 'all', 'materials', 'types', 'finishes', 'register', 'urban'];

/** A set template as the text of a `.bvset` file. */
export function serializeSetTemplate(template: SetTemplate, now = new Date()): string {
  return JSON.stringify({ format: SET_TEMPLATE_FILE_FORMAT, version: SET_TEMPLATE_FILE_VERSION, savedAt: now.toISOString(), ...template }, null, 2);
}

const WHAT = 'set template file';
const fail = (path: string, problem: string): never => { throw new Error(`Not a usable ${WHAT}: ${path} ${problem}`); };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function objectAt(v: unknown, path: string): Record<string, unknown> {
  return isObject(v) ? v : fail(path, 'must be an object');
}

function listAt<T>(v: unknown, path: string, read: (item: unknown, at: string) => T): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return fail(path, 'must be a list');
  return v.map((item, i) => read(item, `${path}/${i}`));
}

const textAt = (v: unknown, path: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fail(path, 'must be text'));
const scaleAt = (v: unknown, path: string): number | undefined => (v === undefined ? undefined : typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fail(path, 'must be a scale above zero (50 is 1:50)'));

function readViewRule(v: unknown, path: string): ViewRule {
  const o = objectAt(v, path);
  if (o.kind === 'plan') return typeof o.storey === 'number' && Number.isInteger(o.storey) ? { kind: 'plan', storey: o.storey } : fail(`${path}/storey`, 'must be a whole number: the storeys above (+) or below (-) the ground storey');
  if (o.kind === 'allPlans') return { kind: 'allPlans' };
  if (o.kind === 'site') {
    if (o.nth === undefined) return { kind: 'site' };
    return typeof o.nth === 'number' && Number.isInteger(o.nth) && o.nth >= 1 ? { kind: 'site', nth: o.nth } : fail(`${path}/nth`, 'must be a whole number from 1: the second site plan, the third, ...');
  }
  if (o.kind === 'elevation') {
    const direction = ELEVATION_DIRECTIONS.find((d) => d === o.direction);
    return direction ? { kind: 'elevation', direction } : fail(`${path}/direction`, 'must be north, south, east or west');
  }
  if (o.kind === 'section') return typeof o.place === 'number' && Number.isInteger(o.place) && o.place >= 0 ? { kind: 'section', place: o.place } : fail(`${path}/place`, 'must be a whole number from 0');
  return fail(`${path}/kind`, 'must be plan, allPlans, site, elevation or section');
}

function readLayout(v: unknown, path: string): SheetLayoutRule {
  const o = objectAt(v, path);
  const paper = readPaper(o.paper) ?? fail(`${path}/paper`, 'must be a paper size');
  const frame = o.frame === undefined ? undefined : readFrame(o.frame) ?? fail(`${path}/frame`, 'must be frame margins and a title block position');
  const stepUp = o.stepUp === undefined ? undefined : listAt(o.stepUp, `${path}/stepUp`, (p, at) => ISO_PAPERS.find((size) => size === p) ?? fail(at, 'must be A0, A1, A2, A3 or A4'));
  return {
    paper,
    orientation: o.orientation === 'portrait' ? 'portrait' : 'landscape',
    ...(frame ? { frame } : {}),
    ...(stepUp && stepUp.length > 0 ? { stepUp } : {}),
    ...(typeof o.templateId === 'string' && o.templateId.startsWith('builtin:') ? { templateId: o.templateId } : {}),
  };
}

function readSlot(v: unknown, path: string): SlotRule {
  const o = objectAt(v, path);
  const scale = scaleAt(o.scale, `${path}/scale`);
  return { view: readViewRule(o.view, `${path}/view`), ...(scale === undefined ? {} : { scale }) };
}

function readSheetRule(v: unknown, path: string): SheetRule {
  const o = objectAt(v, path);
  const series = RULED_SERIES.find((s) => s === o.series) ?? fail(`${path}/series`, 'must be plans, elevations or sections');
  const slots = listAt(o.slots, `${path}/slots`, readSlot);
  if (slots.length === 0) fail(`${path}/slots`, 'must hold at least one slot');
  const notes = listAt(o.notes, `${path}/notes`, (n, at) => textAt(n, at));
  return { name: textAt(o.name, `${path}/name`), series, layout: readLayout(o.layout, `${path}/layout`), slots, ...(notes.length > 0 ? { notes } : {}) };
}

function readScheduleRule(v: unknown, path: string): ScheduleRule {
  const o = objectAt(v, path);
  const kind = SCHEDULE_KINDS.find((k) => k === o.kind) ?? fail(`${path}/kind`, `must be one of ${SCHEDULE_KINDS.join(', ')}`);
  const sheet = objectAt(o.sheet, `${path}/sheet`);
  const scale = scaleAt(o.scale, `${path}/scale`);
  return { kind, name: textAt(o.name, `${path}/name`), ...(scale === undefined ? {} : { scale }), sheet: { name: textAt(sheet.name, `${path}/sheet/name`), layout: readLayout(sheet.layout, `${path}/sheet/layout`) } };
}

function readAnnotations(v: unknown): Annotations {
  if (v === undefined) return {};
  const o = objectAt(v, '/annotations');
  const out: Annotations = {};
  for (const series of Object.keys(o)) {
    const known: RuledSeries | undefined = RULED_SERIES.find((s) => s === series);
    if (!known) fail(`/annotations/${series}`, 'is not a series (plans, elevations, sections)');
    const commands = listAt<AnnotationCommand>(o[series], `/annotations/${series}`, (c, at) => ANNOTATION_COMMANDS.find((a) => a === c) ?? fail(at, 'must be tagAll, dimAll or levelAll'));
    if (known && commands.length > 0) out[known] = commands;
  }
  return out;
}

/** The template in a `.bvset` file's text. Throws, with the place of the first problem, when it is not one. */
export function parseSetTemplate(text: string): SetTemplate {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a ${WHAT}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const file = objectAt(raw, '/');
  if (file.format !== SET_TEMPLATE_FILE_FORMAT) fail('/format', `must be "${SET_TEMPLATE_FILE_FORMAT}"`);
  if (file.version !== SET_TEMPLATE_FILE_VERSION) {
    const newer = typeof file.version === 'number' && file.version > SET_TEMPLATE_FILE_VERSION;
    fail('/version', `${String(file.version)} is not supported (expected ${SET_TEMPLATE_FILE_VERSION})${newer ? '; it was made by a newer version of the app' : ''}`);
  }
  const numbering = file.numbering === undefined ? undefined : readNumberingScheme(file.numbering) ?? fail('/numbering', 'must be a numbering scheme');
  const carried = file.carried === undefined ? undefined : objectAt(file.carried, '/carried');
  return {
    name: textAt(file.name, '/name'),
    sheets: listAt(file.sheets, '/sheets', readSheetRule),
    schedules: listAt(file.schedules, '/schedules', readScheduleRule),
    annotations: readAnnotations(file.annotations),
    ...(numbering ? { numbering } : {}),
    ...(carried ? { carried } : {}),
  };
}
