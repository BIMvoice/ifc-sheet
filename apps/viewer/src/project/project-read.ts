/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The readers of the project file's own parts (models, materials, road drawings, ...), kept apart from `project-file.ts` so
 * the field registry (`./fields`) can register a reader without importing the file reader, which imports the store, which
 * imports the registry (#144). The drawing set's readers (levels, views, sheets) and the helpers they share are the engine's
 * (`packages/ifcsheet/src/set-read.ts`), so the command line reads the set the app saved with the same code (#479).
 */

import { fail, isNumber, isObject, isString, readUrbanSettings as readEngineUrbanSettings } from '@bimvoice/ifcsheet';
import type { ProjectCivilDrawing, ProjectTypicalSection, ProjectDocument, ProjectModelRef } from './types';

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
  const settings = readEngineUrbanSettings(raw);
  return settings ? { urbanSettings: settings } : {};
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


