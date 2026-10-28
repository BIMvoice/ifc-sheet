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

import type { DraftParamValue } from './types';
import { fontFamilyOf } from './text-width';
import { DEFAULT_DIM_STYLE as ENGINE_DEFAULT_DIM_STYLE, STANDARD_STYLE_ID, type DimStyle, type DraftLengthUnit, type FontKind, type TextStyle } from '@bimvoice/ifcsheet';

// Resolving an entity's look is the engine's (`packages/ifcsheet/src/draft-look.ts`), so the command line prints what the app draws (#479).
export {
  DEFAULT_TEXT_STYLE, DIM_OVERRIDES, TEXT_OVERRIDES, dashOf, dimStyleOf, formatDimension, layerLocked, layerPen, layerShows, lookOf, naturalDecimals, overrideKey,
  readableDeg, resolveDim, resolveText, textStyleOf, unitFactor, type LayerGroup, type LayerVisibilityScope, type LineType, type StyleBook,
} from '@bimvoice/ifcsheet';

export type { ArrowKind, DimStyle, FontKind, TextPlacement, TextStyle } from '@bimvoice/ifcsheet';
export type LengthUnit = DraftLengthUnit;
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

/** The project's own dimension style: the engine's (it is also the base of the dimension styles a graphic standard adds). */
export const DEFAULT_DIM_STYLE: DimStyle = ENGINE_DEFAULT_DIM_STYLE;

/** Which fields of an entity are overridden (for "by style" / reset in the UI). */
export function overriddenFields(params: Record<string, DraftParamValue>): string[] {
  return Object.keys(params).filter((k) => k.startsWith('o.')).map((k) => k.slice(2));
}

export const fontFamily = (font: FontKind): string => fontFamilyOf(font);

