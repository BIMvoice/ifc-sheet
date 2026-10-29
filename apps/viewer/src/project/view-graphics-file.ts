/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading a view's graphics (categories, phases, grid) and the project's phase
 * source from a project file (`project-file.ts`): malformed fields are dropped,
 * never fatal.
 */

import { readColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { PHASES, type PhaseSource } from './phases';
import type { CategoryGraphics, ElementGraphics, PhaseId, PhaseStyle, StyleRule, StyleRuleStyle, ViewGraphics, ViewGridGraphics } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const WEIGHTS = new Set(['heavy', 'medium', 'light', 'hairline']);
export const HEX = /^#[0-9a-f]{6}$/i;

/** A template's class and material mapping (#31): a rule without an id, a kind or a name to match is dropped, as is a malformed field of its style. */
export function readStyleRules(raw: unknown): StyleRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StyleRule[] = [];
  for (const v of raw) {
    if (!isObject(v) || !isString(v.id) || !v.id || seen.has(v.id) || (v.by !== 'class' && v.by !== 'material') || !Array.isArray(v.match)) continue;
    const match = v.match.filter((m): m is string => isString(m) && m.trim() !== '');
    if (match.length === 0) continue;
    const style: StyleRuleStyle = {};
    const s = isObject(v.style) ? v.style : {};
    if (isString(s.lineColor) && HEX.test(s.lineColor)) style.lineColor = s.lineColor;
    if (isString(s.fillColor) && HEX.test(s.fillColor)) style.fillColor = s.fillColor;
    if (isString(s.lineWeight) && WEIGHTS.has(s.lineWeight)) style.lineWeight = s.lineWeight as StyleRuleStyle['lineWeight'];
    if (isString(s.cutHatch) && s.cutHatch) style.cutHatch = s.cutHatch;
    if (isNumber(s.hatchScale) && s.hatchScale > 0) style.hatchScale = s.hatchScale;
    seen.add(v.id);
    out.push({ id: v.id, by: v.by, match, style });
  }
  return out;
}

/** A view's `graphics`: unknown or malformed fields are dropped, never fatal. */
export function readGraphics(raw: Record<string, unknown>): ViewGraphics {
  const out: ViewGraphics = {};
  if (raw.presetId === null || isString(raw.presetId)) out.presetId = raw.presetId;
  if (isObject(raw.categories)) {
    const categories: Record<string, CategoryGraphics> = {};
    for (const [id, value] of Object.entries(raw.categories)) {
      if (!isObject(value)) continue;
      const g: CategoryGraphics = {};
      // `true` is kept: a view over a template shows what its template hides (#44).
      if (typeof value.visible === 'boolean') g.visible = value.visible;
      if (isString(value.lineColor) && HEX.test(value.lineColor)) g.lineColor = value.lineColor;
      if (isString(value.fillColor) && HEX.test(value.fillColor)) g.fillColor = value.fillColor;
      if (isString(value.lineWeight) && WEIGHTS.has(value.lineWeight)) g.lineWeight = value.lineWeight as CategoryGraphics['lineWeight'];
      if (isString(value.cutHatch) && value.cutHatch) g.cutHatch = value.cutHatch;
      if (isNumber(value.hatchScale) && value.hatchScale > 0) g.hatchScale = value.hatchScale;
      if (Object.keys(g).length > 0) categories[id] = g;
    }
    out.categories = categories;
  }
  if (raw.detailLevel === 'coarse' || raw.detailLevel === 'medium' || raw.detailLevel === 'fine') out.detailLevel = raw.detailLevel;
  const styleRules = readStyleRules(raw.styleRules);
  if (styleRules.length > 0) out.styleRules = styleRules;
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
  const scheme = readColourScheme(raw.colourScheme);
  if (scheme) out.colourScheme = scheme;
  if (raw.usePlanSymbols === false) out.usePlanSymbols = false;
  Object.assign(out, readElementGraphics(raw));
  if (isObject(raw.grid)) {
    const grid: ViewGridGraphics = {};
    if (typeof raw.grid.visible === 'boolean') grid.visible = raw.grid.visible;
    if (raw.grid.ends === 'start' || raw.grid.ends === 'end' || raw.grid.ends === 'both') grid.ends = raw.grid.ends;
    if (Object.keys(grid).length > 0) out.grid = grid;
  }
  return out;
}

const MAX_ABOUT = 200;

/** A view's single elements (#32, #33): hidden ones, per-element overrides and hidden lines, all by GlobalId. Malformed entries are dropped, never fatal; GlobalIds the model no longer has are KEPT (they are listed on the Wall). */
export function readElementGraphics(raw: Record<string, unknown>): Pick<ViewGraphics, 'hiddenElements' | 'elements' | 'hiddenLines'> {
  const out: Pick<ViewGraphics, 'hiddenElements' | 'elements' | 'hiddenLines'> = {};
  const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => isString(x) && x.length > 0))] : []);
  const hidden = ids(raw.hiddenElements);
  if (hidden.length > 0) out.hiddenElements = hidden;
  const lines = ids(raw.hiddenLines).filter((e) => e.includes('|') && e.indexOf('|') > 0);
  if (lines.length > 0) out.hiddenLines = lines;
  if (isObject(raw.elements)) {
    const elements: Record<string, ElementGraphics> = {};
    for (const [id, value] of Object.entries(raw.elements)) {
      if (!id || !isObject(value)) continue;
      const g: ElementGraphics = {};
      if (typeof value.visible === 'boolean') g.visible = value.visible;
      if (isString(value.lineColor) && HEX.test(value.lineColor)) g.lineColor = value.lineColor;
      if (isString(value.fillColor) && HEX.test(value.fillColor)) g.fillColor = value.fillColor;
      if (isString(value.cutWeight) && WEIGHTS.has(value.cutWeight)) g.cutWeight = value.cutWeight as ElementGraphics['cutWeight'];
      if (isString(value.projectionWeight) && WEIGHTS.has(value.projectionWeight)) g.projectionWeight = value.projectionWeight as ElementGraphics['projectionWeight'];
      if (value.lineStyle === 'solid' || value.lineStyle === 'dashed') g.lineStyle = value.lineStyle;
      if (isString(value.cutHatch) && value.cutHatch) g.cutHatch = value.cutHatch;
      if (isNumber(value.hatchScale) && value.hatchScale > 0) g.hatchScale = value.hatchScale;
      if (isString(value.about) && value.about) g.about = value.about.slice(0, MAX_ABOUT);
      if (Object.keys(g).length > 0) elements[id] = g;
    }
    if (Object.keys(elements).length > 0) out.elements = elements;
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
