/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drafting styles — the project's standards for annotation and linework:
 *
 *  - TEXT STYLES: paper height (mm), font, bold / italic, an optional colour.
 *  - DIMENSION STYLES: a text style, the arrow (tick, arrow, dot, none) and
 *    its size, extension-line gap and overshoot, where the value sits (above,
 *    centred on or below the line), its gap, precision and unit.
 *  - LAYER GROUPS: layers gathered under a group that switches and locks
 *    them together.
 *
 * Sizes are PAPER millimetres; a view turns them into drawing units with
 * its scale (`paperUnit`: drawing units per paper millimetre — scale / 1000
 * on a view, 1 on a sheet).
 *
 * An entity names its style in `params.textStyle` / `params.dimStyle` and
 * may override any field of it, element by element, in `params['o.<field>']`.
 * `resolveText` / `resolveDim` give the style an entity is drawn with.
 */

import type { DraftLayer, DraftParamValue } from './types';
import { fontFamilyOf } from './text-width';
import type { CustomLineType } from './line-types';
import { DEFAULT_DIM_STYLE as ENGINE_DEFAULT_DIM_STYLE, STANDARD_STYLE_ID, type DimStyle, type DraftLengthUnit, type FontKind, type TextStyle } from '@bimvoice/ifcsheet';
import { decimalsOf, lengthUnitOf, sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';

export type { ArrowKind, DimStyle, FontKind, TextPlacement, TextStyle } from '@bimvoice/ifcsheet';
export type LengthUnit = DraftLengthUnit;
export type LineType = 'continuous' | 'dashed' | 'dotted' | 'dashdot';

export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export const STANDARD = STANDARD_STYLE_ID;

/** The text style schedules, reports and the drawing register are set in (#500); absent from the project, they keep their own sans face. */
export const TABLES_STYLE_ID = 'tables';

/**
 * The faces a table can be set in: the three the issued PDF can write (Inter embedded for sans, Times for serif, Courier for mono;
 * `issue/pdf-fonts.ts`). `FontKind` has no other value, so a table style can never name a face the PDF could not carry.
 */
export const TABLE_FONTS: readonly FontKind[] = ['sans', 'serif', 'mono'];

/** The face the tables are set in: the project's "Tables" text style, or none (today's sans) when it has not made one. */
export function tablesFace(textStyles: readonly TextStyle[] | undefined): { font: FontKind; italic: boolean; styled: boolean } {
  const style = textStyles?.find((s) => s.id === TABLES_STYLE_ID);
  return style ? { font: style.font, italic: style.italic, styled: true } : { font: 'sans', italic: false, styled: false };
}

export const DEFAULT_TEXT_STYLE: TextStyle = { id: STANDARD, name: 'Standard', height: 2.5, font: 'sans', bold: false, italic: false };

/** The project's own dimension style: the engine's (it is also the base of the dimension styles a graphic standard adds). */
export const DEFAULT_DIM_STYLE: DimStyle = ENGINE_DEFAULT_DIM_STYLE;

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

/** Which fields of an entity are overridden (for "by style" / reset in the UI). */
export function overriddenFields(params: Params): string[] {
  return Object.keys(params).filter((k) => k.startsWith('o.')).map((k) => k.slice(2));
}

export const fontFamily = (font: FontKind): string => fontFamilyOf(font);

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

/** Dash pattern of a built-in line type or of one of the project's own by id (an unknown id draws continuous). */
export function dashFor(type: string | undefined, custom: readonly CustomLineType[] = []): number[] {
  const own = custom.find((c) => c.id === type);
  return own ? [...own.dash] : dashOf(type as LineType | undefined);
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
export function layerPen(layer: DraftLayer | undefined, custom: readonly CustomLineType[] = []): { width: number; dash: number[] } {
  return { width: layer?.lineWeight ?? 0.25, dash: dashFor(layer?.lineType, custom) };
}

/** The fields a drafted line may override of its layer's pen, in `params['o.<field>']`. */
export const PEN_OVERRIDES = ['color', 'lineWeight', 'lineType'] as const;

/**
 * The pen a drafted line is drawn with: its layer's colour, weight and line type, and over them the element's own
 * (`o.color`, `o.lineWeight`, `o.lineType`). `own` says which of the three the element overrides, for the DXF.
 */
export function entityPen(layer: DraftLayer | undefined, params: Params, custom: readonly CustomLineType[] = []): {
  color: string; width: number; dash: number[]; lineType: string; own: { lineWeight?: number; lineType?: string };
} {
  const color = params[overrideKey('color')];
  const weight = params[overrideKey('lineWeight')];
  const type = params[overrideKey('lineType')];
  const lineWeight = typeof weight === 'number' && weight > 0 ? weight : undefined;
  const lineType = typeof type === 'string' && type !== '' ? type : undefined;
  const base = layerPen(layer, custom);
  const resolved = lineType ?? layer?.lineType ?? 'continuous';
  return {
    color: typeof color === 'string' && color !== '' ? color : layer?.color ?? '#18181b',
    width: lineWeight ?? base.width,
    dash: lineType !== undefined ? dashFor(lineType, custom) : base.dash,
    lineType: resolved,
    own: { ...(lineWeight !== undefined ? { lineWeight } : {}), ...(lineType !== undefined ? { lineType } : {}) },
  };
}

/** Whether `layer` prints (its own switch; a group, view or viewport that hides it hides it on screen too, so those already leave it out). */
export const layerPrints = (layer: DraftLayer | undefined): boolean => layer?.print !== false;

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
