/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What DIMALL needs to measure a figure or a text on the plan in front: the width of a line of text (the app measures with the
 * browser's font, the command line from a table) and which way is up on screen. Passed in, so the planner reads no session (#707).
 */

import type { AnnotationShape, DraftEntity, Pt, TextFrame } from '../draft-types.js';
import { dimensionLayout, type ScreenFrame } from '../dimension-figure.js';
import { tableWidthEm, type TextFace } from '../text-advance.js';
import { textBlock } from '../text-block.js';
import { textBoxOf, type Rect } from '../text-leader.js';

export interface DimAllMeasure {
  /** The width of one line of text, in ems. */
  widthOf: (line: string, face?: TextFace) => number;
  /** The way the plan's screen runs. */
  frame: ScreenFrame;
}

/** A plan measured from the engine's width table, as the command line and the PDF do. */
export const tableMeasure: DimAllMeasure = { widthOf: tableWidthEm, frame: { up: -1, right: 1 } };

/** The link a draft carries as part of a section symbol, else null (the app reads it with the sections' naming). */
export type SectionLinkOf = (d: DraftEntity) => string | null;

/** The boxes the annotations among `drafts` fill (the app's, since their bounds are drawn with its fonts). */
export type RectsOf = (drafts: readonly DraftEntity[]) => Rect[];

/** What the pieces that read the drafts on a view need: which are section symbols, and how a text is measured. */
export interface DraftReader {
  sectionLink: SectionLinkOf;
  measure: DimAllMeasure;
}

type DimShape = Extract<AnnotationShape, { type: 'dimension' | 'radial' | 'angular' }>;

/** The width of the figure a dimension prints, as a text of `height`. */
export function figureWidth(m: DimAllMeasure, shape: DimShape, height: number): number {
  return textBlock(dimensionLayout(shape, {}, m.frame, m.widthOf).label, height, undefined, undefined, m.widthOf).outer.x1;
}

/** A text box's corners. */
export function textBoxIn(m: DimAllMeasure, p: Pt, text: string, height: number, rotation: number, frame?: TextFrame): Pt[] {
  return textBoxOf(p, text, height, rotation, frame, m.frame.up, m.widthOf);
}
