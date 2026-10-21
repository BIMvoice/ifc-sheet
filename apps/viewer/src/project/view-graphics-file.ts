/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading a view's graphics (categories, phases, grid) and the project's phase
 * source from a project file (`project-file.ts`): malformed fields are dropped,
 * never fatal.
 */

import { PHASES, type PhaseSource } from './phases';
import type { CategoryGraphics, PhaseId, PhaseStyle, ViewGraphics, ViewGridGraphics } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const WEIGHTS = new Set(['heavy', 'medium', 'light', 'hairline']);
export const HEX = /^#[0-9a-f]{6}$/i;

/** A view's `graphics`: unknown or malformed fields are dropped, never fatal. */
export function readGraphics(raw: Record<string, unknown>): ViewGraphics {
  const out: ViewGraphics = {};
  if (raw.presetId === null || isString(raw.presetId)) out.presetId = raw.presetId;
  if (isObject(raw.categories)) {
    const categories: Record<string, CategoryGraphics> = {};
    for (const [id, value] of Object.entries(raw.categories)) {
      if (!isObject(value)) continue;
      const g: CategoryGraphics = {};
      if (value.visible === false) g.visible = false;
      if (isString(value.lineColor) && HEX.test(value.lineColor)) g.lineColor = value.lineColor;
      if (isString(value.fillColor) && HEX.test(value.fillColor)) g.fillColor = value.fillColor;
      if (isString(value.lineWeight) && WEIGHTS.has(value.lineWeight)) g.lineWeight = value.lineWeight as CategoryGraphics['lineWeight'];
      if (isString(value.cutHatch) && value.cutHatch) g.cutHatch = value.cutHatch;
      if (isNumber(value.hatchScale) && value.hatchScale > 0) g.hatchScale = value.hatchScale;
      if (Object.keys(g).length > 0) categories[id] = g;
    }
    out.categories = categories;
  }
  if (isObject(raw.phases) && Array.isArray(raw.phases.show)) {
    const styles: NonNullable<ViewGraphics['phases']>['styles'] = {};
    if (isObject(raw.phases.styles)) {
      for (const id of PHASES) {
        const value = raw.phases.styles[id];
        if (!isObject(value)) continue;
        const g: Partial<PhaseStyle> = {};
        if (isString(value.lineColor) && HEX.test(value.lineColor)) g.lineColor = value.lineColor;
        if (isString(value.fillColor) && HEX.test(value.fillColor)) g.fillColor = value.fillColor;
        if (isString(value.lineWeight) && WEIGHTS.has(value.lineWeight)) g.lineWeight = value.lineWeight as PhaseStyle['lineWeight'];
        if (typeof value.dashed === 'boolean') g.dashed = value.dashed;
        if (Object.keys(g).length > 0) styles[id] = g;
      }
    }
    out.phases = {
      show: PHASES.filter((id) => (raw.phases as { show: unknown[] }).show.includes(id)),
      ...(raw.phases.demolishAsExisting === true ? { demolishAsExisting: true } : {}),
      ...(Object.keys(styles).length ? { styles } : {}),
    };
  }
  if (isObject(raw.grid)) {
    const grid: ViewGridGraphics = {};
    if (typeof raw.grid.visible === 'boolean') grid.visible = raw.grid.visible;
    if (raw.grid.ends === 'start' || raw.grid.ends === 'end' || raw.grid.ends === 'both') grid.ends = raw.grid.ends;
    if (Object.keys(grid).length > 0) out.grid = grid;
  }
  return out;
}

/** The project's phase source: a malformed mapping or phase is dropped, never fatal. */
export function readPhaseSource(value: unknown): PhaseSource | undefined {
  if (!isObject(value)) return undefined;
  const out: PhaseSource = {};
  const phase = (v: unknown): PhaseId | undefined => PHASES.find((id) => id === v);
  if (phase(value.unmarked)) out.unmarked = phase(value.unmarked);
  const m = value.mapping;
  if (isObject(m) && isString(m.set) && m.set && isString(m.property) && m.property && isObject(m.values)) {
    const values: Record<string, PhaseId> = {};
    for (const [k, v] of Object.entries(m.values)) if (phase(v)) values[k] = phase(v)!;
    out.mapping = { set: m.set, property: m.property, values };
  }
  return out.mapping || out.unmarked ? out : undefined;
}
