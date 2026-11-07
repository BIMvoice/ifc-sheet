/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The reusable definitions of a drafting practice: annotation types
 * (named presets of the annotation tools), symbols (named blocks of drafted
 * shapes with an insertion point) and legend configurations. They live in
 * the project document and travel between projects in a catalogue file
 * (`catalogue-file.ts`) together with the layers, styles, hatch patterns and
 * materials that already exist there.
 */

import type { DraftSymbol } from '@bimvoice/ifcsheet';
import type { DraftEntity, DraftLayer } from '@/drafting/types';

export { ANNOTATION_TOOLS, TAG_FIELDS, DEFAULT_LABEL, type AnnotationTool, type TagFieldName, type LabelSpec, type AnnotationType } from '@bimvoice/ifcsheet';

export type { DraftSymbol, SymbolShape } from '@bimvoice/ifcsheet';

/** `colours` lists the values of the views a colour scheme paints (#92); it is not on a legend until the legend is made for them. */
export const LEGEND_CATEGORIES = ['materials', 'layers', 'hatches', 'symbols', 'annotations', 'colours'] as const;
export type LegendCategory = (typeof LEGEND_CATEGORIES)[number];

/** What a legend lists and how it is laid out. It stores WHAT to list, never the graphics. */
export interface LegendConfig {
  title: string;
  showTitle: boolean;
  /** `project`: everything; `view` / `sheet`: what `scopeId` (a view or sheet id) uses. A legend placed on a sheet with scope `sheet` and no `scopeId` follows that sheet. */
  scope: 'project' | 'view' | 'sheet';
  scopeId?: string;
  /** The categories listed, in this order. */
  categories: LegendCategory[];
  columns: number;
  /** Paper millimetres. */
  rowHeight: number;
  swatchWidth: number;
  /** Text style id (its height and font set the entries' text). */
  textStyle: string;
  /** A heading line above each category. */
  headings: boolean;
}

/** A legend as a project document: placeable on sheets like a view. */
export interface ProjectLegend extends LegendConfig {
  id: string;
  name: string;
  createdAt: number;
}

export const DEFAULT_LEGEND: LegendConfig = {
  title: 'Legend', showTitle: true, scope: 'project', categories: ['materials', 'layers', 'hatches', 'symbols', 'annotations'],
  columns: 1, rowHeight: 7, swatchWidth: 18, textStyle: 'standard', headings: true,
};

/**
 * A detail kept in the library: the drafts of a drafting view with what they
 * refer to, so it can be placed in any project. Self-contained: layers,
 * symbols and hatch patterns are the entry's own copies (ids inside it refer
 * only to each other), merged into the project under the library's clash
 * policies when it is placed.
 */
export interface LibraryDetail {
  id: string;
  name: string;
  /** Drawing scale denominator of the view it was saved from. */
  scale: number;
  drafts: Omit<DraftEntity, 'viewId'>[];
  /** The layers the drafts are on (without their group). */
  layers: DraftLayer[];
  /** The user hatch patterns the drafts use, as `.pat` text. */
  hatchPatterns: string;
  /** The project symbols the drafts place. */
  symbols: DraftSymbol[];
}
