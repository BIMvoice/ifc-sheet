/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The readers of a project file's drawing set: its levels, views and sheets, and the small helpers they share. The web app's
 * file reader (`apps/viewer/src/project/fields/`) and the headless one (`project-read.ts`, which `ifcsheet build --project` and
 * the MCP server use) both read the set with these, so a project prints the views and sheets the app saved. Strict where a value
 * is malformed (a view without an id, a viewport without a scale): the file is refused with the path of the first problem.
 */

import type { DisciplineId, ElevationDirection, InteriorElevation, ProjectLevel, ProjectSheet, ProjectView, ProjectViewKind, SectionProjectPlane, ViewDetail } from './document.js';
import { readSheetLayout } from './sheet-layout-read.js';
import { read3dPrint } from './view-3d-read.js';
import { readGraphics } from './view-graphics-read.js';

/** The structural disciplines a plan may draw (`discipline-views.ts` in the app). */
export const DISCIPLINE_IDS: readonly DisciplineId[] = ['structural', 'foundation', 'roof'];

export function isDisciplineId(value: unknown): value is DisciplineId {
  return typeof value === 'string' && (DISCIPLINE_IDS as readonly string[]).includes(value);
}

export type Json = Record<string, unknown>;
export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

const VIEW_KINDS: readonly ProjectViewKind[] = ['plan', 'section', 'elevation', '3d', 'drafting'];
const DIRECTIONS: readonly ElevationDirection[] = ['north', 'south', 'east', 'west'];
const AXES = ['down', 'front', 'side'] as const;

export function readLevel(v: unknown, path: string): ProjectLevel {
  if (!isObject(v) || !isString(v.name) || !isNumber(v.elevation)) fail(path, 'must be a level { name, elevation }');
  const ids = Array.isArray(v.storeyGlobalIds) ? v.storeyGlobalIds.filter(isString) : [];
  return { name: v.name, elevation: v.elevation, storeyGlobalIds: ids };
}

function readRect(v: Json, path: string): Pick<ViewDetail, 'min' | 'max'> {
  const corner = (c: unknown, at: string) => {
    if (!isObject(c) || !isNumber(c.x) || !isNumber(c.y)) fail(at, 'must be { x, y }');
    return { x: c.x, y: c.y };
  };
  const min = corner(v.min, `${path}.min`);
  const max = corner(v.max, `${path}.max`);
  if (max.x <= min.x || max.y <= min.y) fail(path, 'must have min below and left of max');
  return { min, max };
}

function readDetail(v: unknown, path: string): ViewDetail {
  if (!isObject(v) || !isString(v.of) || !isNumber(v.number)) fail(path, 'must be { of, min, max, number }');
  return { of: v.of, ...readRect(v, path), number: v.number };
}

function readPlane(p: unknown, path: string): SectionProjectPlane {
  if (!isObject(p) || !AXES.includes(p.axis as (typeof AXES)[number]) || !isNumber(p.offset)) {
    fail(path, 'must be { axis, offset, flipped }');
  }
  const plane = { axis: p.axis as (typeof AXES)[number], offset: p.offset, flipped: p.flipped === true };
  return isObject(p.custom) ? { ...plane, custom: p.custom as never } : plane;
}

function readInterior(v: unknown, path: string): InteriorElevation {
  if (!isObject(v) || !isString(v.room)) fail(path, 'must be { room, plane, crop }');
  if (!isObject(v.crop)) fail(`${path}.crop`, 'must be { min, max }');
  return { room: v.room, plane: readPlane(v.plane, `${path}.plane`), crop: readRect(v.crop, `${path}.crop`) };
}

export function readView(v: unknown, path: string): ProjectView {
  if (!isObject(v) || !isString(v.id) || !isString(v.name)) fail(path, 'must have a string id and name');
  if (!VIEW_KINDS.includes(v.kind as ProjectViewKind)) fail(`${path}.kind`, `must be one of ${VIEW_KINDS.join(', ')}`);
  const base = {
    id: v.id, name: v.name, ...(typeof v.auto === 'boolean' ? { auto: v.auto } : {}), createdAt: isNumber(v.createdAt) ? v.createdAt : 0,
    ...(isNumber(v.viewDepth) && v.viewDepth >= 0 ? { viewDepth: v.viewDepth } : {}),
    ...(typeof v.showHidden === 'boolean' ? { showHidden: v.showHidden } : {}),
    ...(v.detail !== undefined ? { detail: readDetail(v.detail, `${path}.detail`) } : {}),
    ...(isObject(v.graphics) ? { graphics: readGraphics(v.graphics) } : {}),
    ...(isString(v.templateId) && v.templateId ? { templateId: v.templateId } : {}),
    ...(isNumber(v.scale) && v.scale > 0 ? { scale: v.scale } : {}),
    ...(Array.isArray(v.hiddenLayers) ? { hiddenLayers: v.hiddenLayers.filter(isString) } : {}),
  };
  switch (v.kind) {
    case 'plan':
      if (!isNumber(v.cutHeight)) fail(`${path}.cutHeight`, 'must be a number');
      return { ...base, kind: 'plan', level: readLevel(v.level, `${path}.level`), cutHeight: v.cutHeight, ...(v.site === true ? { site: true as const } : {}), ...(isDisciplineId(v.discipline) ? { discipline: v.discipline } : {}), ...(v.reflected === true ? { reflected: true } : {}) };
    case 'section': {
      const section = { ...base, kind: 'section' as const, plane: readPlane(v.plane, `${path}.plane`) };
      return isString(v.through) && v.through ? { ...section, through: v.through } : section;
    }
    case 'elevation':
      if (!DIRECTIONS.includes(v.direction as ElevationDirection)) fail(`${path}.direction`, `must be one of ${DIRECTIONS.join(', ')}`);
      if (v.planeOffset !== undefined && !isNumber(v.planeOffset)) fail(`${path}.planeOffset`, 'must be a number');
      return {
        ...base, kind: 'elevation', direction: v.direction as ElevationDirection, ...(v.planeOffset !== undefined ? { planeOffset: v.planeOffset } : {}),
        ...(v.interior !== undefined ? { interior: readInterior(v.interior, `${path}.interior`) } : {}),
      };
    case 'drafting':
      return { ...base, kind: 'drafting', ...(isNumber(v.number) && v.number > 0 ? { number: v.number } : {}) };
    default:
      return { ...base, kind: '3d', viewpoint: isObject(v.viewpoint) ? (v.viewpoint as never) : null, ...read3dPrint(v) };
  }
}

export function readSheet(v: unknown, path: string): ProjectSheet {
  if (!isObject(v) || !isString(v.id) || !isString(v.number) || !isString(v.name)) fail(path, 'must be a sheet { id, number, name }');
  return { id: v.id, number: v.number, name: v.name, createdAt: isNumber(v.createdAt) ? v.createdAt : 0, ...readSheetLayout(v, path) };
}

/** The array at `key` of the file, `[]` when absent; anything else but an array fails. */
export function listAt(raw: Json, key: string): unknown[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`/${key}`, 'must be an array');
  return value;
}
