/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The readers of the project file's own parts (models, views, sheets, materials, ...) and the small
 * helpers they share, kept apart from `project-file.ts` so the field registry (`./fields`) can register a
 * reader without importing the file reader, which imports the store, which imports the registry (#144).
 */

import { isDisciplineId } from './discipline-views';
import { readSheetLayout } from './sheet-file';
import { read3dPrint } from './view-3d-file';
import { HEX, WEIGHTS, readGraphics } from './view-graphics-file';
import type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, ElevationDirection, InteriorElevation, ProjectDocument, ProjectLevel, ProjectModelRef, ProjectSheet, ProjectView, ProjectViewKind, SectionProjectPlane, ViewDetail } from './types';

const VIEW_KINDS: readonly ProjectViewKind[] = ['plan', 'section', 'elevation', '3d', 'drafting'];
const DIRECTIONS: readonly ElevationDirection[] = ['north', 'south', 'east', 'west'];
const AXES = ['down', 'front', 'side'] as const;

export type Json = Record<string, unknown>;
export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

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

export function readModel(v: unknown, path: string): ProjectModelRef {
  if (!isObject(v) || !isString(v.key) || !isString(v.name)) fail(path, 'must be a model { key, name }');
  const model: ProjectModelRef = { key: v.key, name: v.name };
  // A role or style this version does not know (a newer file, a hand edit) is dropped, not fatal: the model opens linked, in its role's style.
  if (v.role === 'host' || v.role === 'linked') model.role = v.role;
  else if (v.role !== undefined) {
    model.role = 'linked';
    console.warn(`[ifcsheet] project file ${path}.role: ${JSON.stringify(v.role)} is not host or linked; the model is opened as linked`);
  }
  if (v.drawStyle === 'normal' || v.drawStyle === 'halftone') model.drawStyle = v.drawStyle;
  else if (v.drawStyle !== undefined) console.warn(`[ifcsheet] project file ${path}.drawStyle: ${JSON.stringify(v.drawStyle)} is not normal or halftone; the model's default style is used`);
  return model;
}

/** The urban settings; a field that is not what it should be is dropped (its default applies). */
export function readUrbanSettings(raw: unknown): Pick<ProjectDocument, 'urbanSettings'> {
  if (!isObject(raw)) return {};
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out: NonNullable<ProjectDocument['urbanSettings']> = {};
  if (finite(raw.terrainLevel)) out.terrainLevel = raw.terrainLevel;
  if (finite(raw.zeroElevation)) out.zeroElevation = raw.zeroElevation;
  if (isObject(raw.cutExcluded)) {
    const chosen = Object.entries(raw.cutExcluded).filter((e): e is [string, boolean] => typeof e[1] === 'boolean');
    if (chosen.length) out.cutExcluded = Object.fromEntries(chosen);
  }
  return Object.keys(out).length ? { urbanSettings: out } : {};
}


/** `symbolFlips`: GlobalId → 1..3; anything else is dropped. */
export function readFlips(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [id, bits] of Object.entries(value)) {
    if (typeof bits === 'number' && Number.isInteger(bits) && bits >= 1 && bits <= 3) out[id] = bits;
  }
  return out;
}

export function readCurrentJoinery(raw: unknown): { door?: string; window?: string } {
  if (!isObject(raw)) return {};
  return {
    ...(isString(raw.door) ? { door: raw.door } : {}),
    ...(isString(raw.window) ? { window: raw.window } : {}),
  };
}

export function readMaterial(raw: unknown): ProjectMaterial[] {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.name) || !raw.name.trim()) return [];
  const out: ProjectMaterial = { id: raw.id, name: raw.name };
  if (raw.hatch === null || isString(raw.hatch)) out.hatch = raw.hatch;
  if (isNumber(raw.hatchScale) && raw.hatchScale > 0) out.hatchScale = raw.hatchScale;
  if (raw.fill === null || (isString(raw.fill) && HEX.test(raw.fill))) out.fill = raw.fill;
  if (isString(raw.hatchPen) && WEIGHTS.has(raw.hatchPen)) out.hatchPen = raw.hatchPen as ProjectMaterial['hatchPen'];
  if (raw.membrane === true) out.membrane = true;
  return [out];
}

export function readTypicalSection(raw: unknown): ProjectTypicalSection[] {
  if (!isObject(raw) || !isString(raw.id) || !isObject(raw.assembly)) return [];
  const a = raw.assembly;
  const lane = (v: unknown) => (isObject(v) && isNumber(v.width) && v.width > 0 && isNumber(v.slope) ? { width: v.width, slope: v.slope } : null);
  const lanes = Array.isArray(a.lanes) ? a.lanes.map(lane).filter((l): l is { width: number; slope: number } => l !== null) : [];
  const layers = Array.isArray(a.layers) ? a.layers.flatMap((l) => (isObject(l) && isString(l.name) && isNumber(l.thickness) && l.thickness > 0
    ? [{ name: l.name, thickness: l.thickness, color: isString(l.color) && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#8a7f6a' }] : [])) : [];
  const day = isObject(a.daylight) ? a.daylight : {};
  if (!lanes.length || !layers.length) return [];
  return [{
    id: raw.id, name: isString(raw.name) && raw.name ? raw.name : 'Typical section',
    assembly: {
      lanes, shoulder: lane(a.shoulder), layers,
      daylight: { cutSlope: isNumber(day.cutSlope) && day.cutSlope > 0 ? day.cutSlope : 1, fillSlope: isNumber(day.fillSlope) && day.fillSlope > 0 ? day.fillSlope : 1.5 },
      ...(isNumber(a.nominalDepth) && a.nominalDepth > 0 ? { nominalDepth: a.nominalDepth } : {}),
    },
  }];
}

export function readCivilDrawing(raw: unknown): ProjectCivilDrawing[] {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.corridorGlobalId)) return [];
  const num = (v: unknown, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : undefined);
  const out: ProjectCivilDrawing = {
    id: raw.id, name: isString(raw.name) && raw.name ? raw.name : 'Road drawing', kind: raw.kind === 'sections' ? 'sections' : 'profile',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0, corridorGlobalId: raw.corridorGlobalId, scale: num(raw.scale, 1) ?? (raw.kind === 'sections' ? 200 : 1000),
  };
  for (const key of ['vExaggeration', 'stationStep', 'elevationStep', 'every', 'columns', 'halfWidth'] as const) {
    const v = num(raw[key], 0);
    if (v !== undefined) out[key] = v;
  }
  if (Array.isArray(raw.stations)) out.stations = raw.stations.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return [out];
}


/** The array at `key` of the file, `[]` when absent; anything else but an array fails. */
export function listAt(raw: Json, key: string): unknown[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`/${key}`, 'must be an array');
  return value;
}
