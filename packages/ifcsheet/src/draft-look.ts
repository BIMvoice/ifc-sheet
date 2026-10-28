/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a drafted entity looks, resolved: the text and dimension style it names with its own overrides (`params['o.<field>']`),
 * a length in its dimension style's unit and precision, and whether and with which pen its layer draws. The app's drafting
 * (`apps/viewer/src/drafting/styles.ts` re-exports these) and the engine's sheet (`sheet-annotations.ts`) resolve an entity with
 * this one code, so a dimension prints the same figure on screen and in the PDF of `ifcsheet build` (#479).
 *
 * Sizes are PAPER millimetres; a view turns them into drawing units with its scale.
 */

import type { DraftLayer, DraftParamValue } from './draft-types.js';
import { DEFAULT_DIM_STYLE, STANDARD_STYLE_ID as STANDARD, type DimStyle, type FontKind, type TextStyle } from './draft-styles.js';
import { decimalsOf, lengthUnitOf, type SheetLocale } from './units-and-numbers.js';
import { sheetNumber } from './sheet-number.js';

export type LineType = 'continuous' | 'dashed' | 'dotted' | 'dashdot';

export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export const DEFAULT_TEXT_STYLE: TextStyle = { id: STANDARD, name: 'Standard', height: 2.5, font: 'sans', bold: false, italic: false };

/** The text style schedules, reports and the drawing register are set in (#500); absent from the project, they keep their own sans face. */
export const TABLES_STYLE_ID = 'tables';

/** The face the tables are set in: the project's "Tables" text style, or none (today's sans) when it has not made one. */
export function tablesFace(textStyles: readonly TextStyle[] | undefined): { font: FontKind; italic: boolean; styled: boolean } {
  const style = textStyles?.find((s) => s.id === TABLES_STYLE_ID);
  return style ? { font: style.font, italic: style.italic, styled: true } : { font: 'sans', italic: false, styled: false };
}

/** The fields an element may override, by kind. */
export const TEXT_OVERRIDES = ['height', 'font', 'bold', 'italic', 'color'] as const;
export const DIM_OVERRIDES = ['arrow', 'arrowSize', 'placement', 'textGap', 'precision', 'unit', 'color'] as const;

export const overrideKey = (field: string) => `o.${field}`;

export interface StyleBook {
  textStyles: readonly TextStyle[];
  dimStyles: readonly DimStyle[];
}

type Params = Record<string, DraftParamValue>;

function overridden<T extends object>(base: T, params: Params, fields: readonly string[]): T {
  const out = { ...base } as Record<string, unknown>;
  for (const field of fields) {
    const value = params[overrideKey(field)];
    if (value === undefined) continue;
    const current = out[field];
    if (typeof current === 'number' && typeof value === 'number') out[field] = value;
    else if (typeof current === 'boolean' && typeof value === 'boolean') out[field] = value;
    else if (typeof value === 'string') out[field] = value;
    else if (current === undefined) out[field] = value;
  }
  return out as T;
}

export function textStyleOf(book: StyleBook, id: unknown): TextStyle {
  return book.textStyles.find((s) => s.id === id) ?? book.textStyles.find((s) => s.id === STANDARD) ?? DEFAULT_TEXT_STYLE;
}

export function dimStyleOf(book: StyleBook, id: unknown): DimStyle {
  return book.dimStyles.find((s) => s.id === id) ?? book.dimStyles.find((s) => s.id === STANDARD) ?? DEFAULT_DIM_STYLE;
}

/** The text style an entity is drawn with: its style (or its dimension style's), then its own overrides. */
export function resolveText(book: StyleBook, params: Params): TextStyle {
  const base = params.textStyle !== undefined ? textStyleOf(book, params.textStyle) : textStyleOf(book, dimStyleOf(book, params.dimStyle).textStyle);
  return overridden(base, params, TEXT_OVERRIDES);
}

export function resolveDim(book: StyleBook, params: Params): DimStyle {
  return overridden(dimStyleOf(book, params.dimStyle), params, DIM_OVERRIDES);
}

/** Metres to `unit`. */
export const unitFactor = (unit: 'mm' | 'cm' | 'm'): number => (unit === 'mm' ? 1000 : unit === 'cm' ? 100 : 1);

/** The decimals a length is drawn to in `unit` when nothing says otherwise: metres to the centimetre, centimetres and millimetres whole. */
export const naturalDecimals = (unit: 'mm' | 'cm' | 'm'): number => (unit === 'm' ? 2 : 0);

/**
 * A length in a dimension style's unit and precision (the value is metres). The project's "Units and numbers" (#88) overrides
 * the style's unit, and its length decimals the style's precision, when it sets them. A unit that differs from the style's
 * brings the natural decimals of that unit instead of the style's precision, which was written for the style's own unit
 * (2 decimals of metres would be "1148.00" in centimetres).
 */
export function formatDimension(locale: SheetLocale, metres: number, style: Pick<DimStyle, 'unit' | 'precision'>): string {
  const unit = lengthUnitOf(locale, style.unit);
  const precision = decimalsOf(locale, 'length', unit === style.unit ? style.precision : naturalDecimals(unit));
  // Never grouped: on a dimension a dot or a comma means the decimal and nothing else.
  return sheetNumber(locale, metres * unitFactor(unit), Math.max(0, Math.min(6, Math.round(precision))), { group: false });
}

/**
 * Text reads left to right, and bottom to top when it runs vertically: a
 * screen angle (degrees, y down) folded into [−90°, 90°).
 */
export function readableDeg(deg: number): number {
  let d = ((deg % 360) + 540) % 360 - 180;
  if (d >= 90 - 1e-6) d -= 180;
  else if (d < -90 - 1e-6) d += 180;
  return d;
}

/** Dash pattern of a line type, paper millimetres (empty = continuous). */
export function dashOf(type: LineType | undefined): number[] {
  switch (type) {
    case 'dashed': return [3, 1.5];
    case 'dotted': return [0.3, 1];
    case 'dashdot': return [4, 1, 0.3, 1];
    default: return [];
  }
}

export interface LayerVisibilityScope {
  /** Layers the view in front hides (`ProjectView.hiddenLayers`). */
  view?: readonly string[];
  /** Layers a sheet viewport hides on top of its view (`SheetViewport.hiddenLayers`). */
  viewport?: readonly string[];
}

/** An entity's drawing styles, resolved. */
export function lookOf(book: StyleBook, params: Params): { text: TextStyle; dim: DimStyle } {
  return { text: resolveText(book, params), dim: resolveDim(book, params) };
}

/** A layer's pen: width and dash in paper millimetres. */
export function layerPen(layer: DraftLayer | undefined): { width: number; dash: number[] } {
  return { width: layer?.lineWeight ?? 0.25, dash: dashOf(layer?.lineType) };
}

/** Whether `layer` shows: its own switch, its group's, then the view's and the viewport's overrides. */
export function layerShows(layer: DraftLayer, groups: readonly LayerGroup[], scope: LayerVisibilityScope = {}): boolean {
  if (!layer.visible) return false;
  const group = layer.group ? groups.find((g) => g.id === layer.group) : undefined;
  if (group && !group.visible) return false;
  if (scope.view?.includes(layer.id)) return false;
  return !scope.viewport?.includes(layer.id);
}

/** Whether `layer` is locked, by itself or by its group. */
export function layerLocked(layer: DraftLayer, groups: readonly LayerGroup[]): boolean {
  return layer.locked || (layer.group ? groups.find((g) => g.id === layer.group)?.locked ?? false : false);
}
