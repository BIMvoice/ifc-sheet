/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Strict readers for annotation types, symbols and legends, shared by the
 * project file and the catalogue file. A malformed entry fails with its
 * path; an absent optional field takes its default.
 */

import { readShape } from '@bimvoice/ifcsheet';
import type { AxisShape } from '@/drafting/types';
import {
  ANNOTATION_TOOLS, DEFAULT_LABEL, DEFAULT_LEGEND, LEGEND_CATEGORIES, TAG_FIELDS,
  type AnnotationTool, type AnnotationType, type DraftSymbol, type LegendCategory, type ProjectLegend, type SymbolShape, type TagFieldName,
} from './types';
import { asTextFrame } from '@/drafting/text-block';
import { asLeaderMode } from '@/labels/label-leader';
import { MISSING_MODES } from '@/labels/label-resolve';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fail(path: string, message: string, what = 'project file'): never {
  throw new Error(`Not a ${what}: ${path} ${message}`);
}

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (values.includes(v as T) ? (v as T) : undefined);

export function readAnnotationType(v: unknown, path: string, what?: string): AnnotationType {
  if (!isObject(v) || !isString(v.id) || !isString(v.name) || !v.name.trim()) fail(path, 'must be an annotation type { id, name, tool }', what);
  const tool = oneOf<AnnotationTool>(v.tool, ANNOTATION_TOOLS);
  if (!tool) fail(`${path}.tool`, `must be one of ${ANNOTATION_TOOLS.join(', ')}`, what);
  const out: AnnotationType = { id: v.id, name: v.name, tool };
  if (isString(v.textStyle)) out.textStyle = v.textStyle;
  if (isString(v.dimStyle)) out.dimStyle = v.dimStyle;
  if (isString(v.layer)) out.layer = v.layer;
  if (isObject(v.axis)) {
    out.axis = {
      bubble: v.axis.bubble === 'square' ? 'square' : 'circle',
      ends: oneOf<AxisShape['ends']>(v.axis.ends, ['both', 'start', 'end', 'none']) ?? 'both',
      size: isNumber(v.axis.size) && v.axis.size > 0 ? v.axis.size : null,
      lineType: oneOf<AxisShape['lineType']>(v.axis.lineType, ['continuous', 'dashed', 'dotted', 'dashdot']) ?? 'dashdot',
    };
  }
  if (isObject(v.hatch) && isString(v.hatch.pattern) && v.hatch.pattern) {
    out.hatch = { pattern: v.hatch.pattern, scale: isNumber(v.hatch.scale) && v.hatch.scale > 0 ? v.hatch.scale : 1, angle: isNumber(v.hatch.angle) ? v.hatch.angle : 0 };
  }
  const field = oneOf<TagFieldName>(v.tagField, TAG_FIELDS);
  if (field) out.tagField = field;
  if (isObject(v.label) && isString(v.label.template)) {
    const frame = asTextFrame(v.label.frame);
    const leader = asLeaderMode(v.label.leader);
    out.label = { template: v.label.template, missing: oneOf(v.label.missing, MISSING_MODES) ?? DEFAULT_LABEL.missing, ...(frame ? { frame } : {}), ...(leader ? { leader } : {}) };
  }
  return out;
}

export function readSymbol(v: unknown, path: string, what?: string): DraftSymbol {
  if (!isObject(v) || !isString(v.id) || !isString(v.name) || !v.name.trim()) fail(path, 'must be a symbol { id, name, shapes }', what);
  if (!Array.isArray(v.shapes)) fail(`${path}.shapes`, 'must be an array', what);
  const shapes = v.shapes.map((s, i): SymbolShape => {
    const shape = readShape(s, `${path}.shapes/${i}`);
    if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'circle' || shape.type === 'arc' || shape.type === 'text') return shape;
    return fail(`${path}.shapes/${i}.type`, 'must be a line, polyline, circle, arc or text', what);
  });
  return { id: v.id, name: v.name, unit: v.unit === 'model' ? 'model' : 'paper', shapes };
}

export function readLegend(v: unknown, path: string, what?: string): ProjectLegend {
  if (!isObject(v) || !isString(v.id) || !isString(v.name) || !v.name.trim()) fail(path, 'must be a legend { id, name }', what);
  const d = DEFAULT_LEGEND;
  const categories = Array.isArray(v.categories)
    ? [...new Set(v.categories.map((c) => oneOf<LegendCategory>(c, LEGEND_CATEGORIES)).filter((c): c is LegendCategory => c !== undefined))]
    : d.categories;
  const positive = (x: unknown, fallback: number) => (isNumber(x) && x > 0 ? x : fallback);
  return {
    id: v.id, name: v.name, createdAt: isNumber(v.createdAt) ? v.createdAt : 0,
    title: isString(v.title) ? v.title : v.name, showTitle: v.showTitle !== false,
    scope: oneOf(v.scope, ['project', 'view', 'sheet'] as const) ?? d.scope,
    ...(isString(v.scopeId) && v.scopeId ? { scopeId: v.scopeId } : {}),
    categories, columns: Math.min(6, Math.max(1, Math.round(positive(v.columns, d.columns)))),
    rowHeight: positive(v.rowHeight, d.rowHeight), swatchWidth: positive(v.swatchWidth, d.swatchWidth),
    textStyle: isString(v.textStyle) && v.textStyle ? v.textStyle : d.textStyle, headings: v.headings !== false,
  };
}

/** A list field: absent is empty, anything but an array is an error. */
export function readList<T>(raw: Json, key: string, read: (v: unknown, path: string) => T, what?: string): T[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`/${key}`, 'must be an array', what);
  return value.map((v, i) => read(v, `/${key}/${i}`));
}
