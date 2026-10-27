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
import type { AxisShape, DraftEntity, DraftLayer } from '@/drafting/types';
import type { TextFrame } from '@/drafting/text-block';
import type { LeaderMode } from '@/labels/label-leader';
import type { MissingMode } from '@/labels/label-resolve';

/** The annotation tools a type can preset: a drafting command id. */
export const ANNOTATION_TOOLS = ['text', 'leader', 'tag', 'label', 'dimaligned', 'dimlinear', 'dimradius', 'dimdiameter', 'dimangular', 'level', 'axis', 'hatch'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

export const TAG_FIELDS = ['mark', 'name', 'class', 'classification', 'classificationTitle'] as const;
export type TagFieldName = (typeof TAG_FIELDS)[number];

/**
 * A parametric label: `template` is text with `{field}` placeholders read from
 * the labelled element (`labels/label-template.ts`), `frame` an outline round
 * it, `missing` what shows where a field has no value.
 */
export interface LabelSpec {
  template: string;
  frame?: TextFrame;
  missing: MissingMode;
  /** Whether the label is joined to its element by a leader: never, once displaced, or always. Absent: once displaced. */
  leader?: LeaderMode;
}

export const DEFAULT_LABEL: LabelSpec = { template: '{Name}', missing: 'question' };

/**
 * A named preset for one annotation tool: the text and dimension style it
 * draws with, the layer it draws on, and the tool's own options. Style and
 * layer ids refer to the project's (or the catalogue's) own lists.
 */
export interface AnnotationType {
  id: string;
  name: string;
  tool: AnnotationTool;
  textStyle?: string;
  dimStyle?: string;
  layer?: string;
  /** Axis: bubble shape, which ends carry one, bubble size (model metres; null: four text heights) and line type. */
  axis?: { bubble: AxisShape['bubble']; ends: AxisShape['ends']; size: number | null; lineType: AxisShape['lineType'] };
  /** Hatch: pattern name, scale and angle (degrees). */
  hatch?: { pattern: string; scale: number; angle: number };
  /** Tag: what the label shows. */
  tagField?: TagFieldName;
  /** Label: the template, its frame and what shows for a missing value. */
  label?: LabelSpec;
}

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
