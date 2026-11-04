/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The parts of the project's drafting standards that compute from a style
 * book and a paper unit, without reading a store: the book with its defaults,
 * the paper unit where an entity lives, and the style an annotation takes when
 * it is made. The app reads its project for the inputs and calls these; the
 * command line and MCP can do the same from a project file (#707).
 */

import { DEFAULT_DIM_STYLE, type DimStyle, type TextStyle } from './draft-styles.js';
import { DEFAULT_TEXT_STYLE, overrideKey, resolveText, type StyleBook } from './draft-look.js';
import type { DraftParamValue, EntityShape } from './draft-types.js';

/** The book of a project's text and dimension styles; an empty list falls back to the default style. */
export function styleBookOf(textStyles: readonly TextStyle[] | undefined, dimStyles: readonly DimStyle[] | undefined): StyleBook {
  return {
    textStyles: textStyles?.length ? textStyles : [DEFAULT_TEXT_STYLE],
    dimStyles: dimStyles?.length ? dimStyles : [DEFAULT_DIM_STYLE],
  };
}

/** Drawing units per paper millimetre where an entity lives: a view's scale / 1000, a sheet's 1. */
export function paperUnitFor(viewId: string, sheets: readonly { id: string }[], views: readonly { id: string; scale?: number }[]): number {
  if (sheets.some((sheet) => sheet.id === viewId)) return 1;
  return (views.find((v) => v.id === viewId)?.scale ?? 100) / 1000;
}

/** A shape that carries a text height. */
export function isSizedShape(shape: EntityShape): shape is Extract<EntityShape, { height: number }> {
  return 'height' in shape && typeof (shape as { height?: unknown }).height === 'number';
}

/** A new annotation takes its style: style ids by kind, and an `o.height` when its height is not the style's. */
export function styledParamsIn(book: StyleBook, paperUnit: number, shape: EntityShape, current: { textStyle: string; dimStyle: string }): Record<string, DraftParamValue> {
  if (!isSizedShape(shape)) return {};
  const dimensional = shape.type === 'dimension' || shape.type === 'radial' || shape.type === 'angular';
  const params: Record<string, DraftParamValue> = dimensional ? { dimStyle: current.dimStyle } : { textStyle: current.textStyle };
  const mm = shape.height / paperUnit;
  if (Math.abs(mm - resolveText(book, params).height) > 1e-6) params[overrideKey('height')] = Number(mm.toFixed(3));
  return params;
}
