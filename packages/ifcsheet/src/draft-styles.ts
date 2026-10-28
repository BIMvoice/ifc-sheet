/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text and dimension styles a graphic standard adds to a project (the app's drafting styles, `apps/viewer/src/drafting/styles.ts`
 * re-exports them). They live here, with the standards (`graphic-standard.ts`), so the app and the command line share one definition.
 * Sizes are paper millimetres.
 */

export type FontKind = 'sans' | 'serif' | 'mono';
export type TextPlacement = 'above' | 'centered' | 'below';
export type ArrowKind = 'tick' | 'arrow' | 'dot' | 'none';
export type DraftLengthUnit = 'm' | 'cm' | 'mm';

export interface TextStyle {
  id: string;
  name: string;
  /** Paper millimetres. */
  height: number;
  font: FontKind;
  bold: boolean;
  italic: boolean;
  /** CSS colour; absent = the entity's layer colour. */
  color?: string;
}

export interface DimStyle {
  id: string;
  name: string;
  textStyle: string;
  arrow: ArrowKind;
  /** Paper millimetres. */
  arrowSize: number;
  extGap: number;
  extOver: number;
  placement: TextPlacement;
  textGap: number;
  precision: number;
  unit: DraftLengthUnit;
  color?: string;
  /**
   * Paper millimetres from the building to the first string DIMALL places (the next ones follow at a fixed step).
   * Absent in a style saved before the setting existed: DIMALL then uses the default below.
   */
  allOffset?: number;
}

/** The id of the project's own text and dimension style. */
export const STANDARD_STYLE_ID = 'standard';

export const DEFAULT_DIM_STYLE: DimStyle = {
  id: STANDARD_STYLE_ID, name: 'Standard', textStyle: STANDARD_STYLE_ID, arrow: 'tick', arrowSize: 1.5, extGap: 1, extOver: 1.5,
  placement: 'above', textGap: 0.8, precision: 2, unit: 'm',
  // 20 mm: the 8 mm step between strings on top of the 12 mm it used to be, so a row of tags fits between the wall and the first string.
  allOffset: 20,
};
