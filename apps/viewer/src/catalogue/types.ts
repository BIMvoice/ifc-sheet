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

import type { AxisShape, DraftShape, AnnotationShape } from '@/drafting/types';

/** The annotation tools a type can preset: a drafting command id. */
export const ANNOTATION_TOOLS = ['text', 'leader', 'tag', 'dimaligned', 'dimlinear', 'dimradius', 'dimdiameter', 'dimangular', 'level', 'axis', 'hatch'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

export const TAG_FIELDS = ['mark', 'name', 'class'] as const;
export type TagFieldName = (typeof TAG_FIELDS)[number];

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
}

/** What a symbol is drawn from: geometry and plain text. */
export type SymbolShape = DraftShape | Extract<AnnotationShape, { type: 'text' }>;

/**
 * A block of shapes drawn around the origin, which is its insertion point.
 * `paper` symbols are drawn in paper millimetres and keep that size at any
 * view scale (a north arrow, a tag bubble); `model` symbols are in metres
 * and keep their real size (a scale bar, a piece of furniture).
 */
export interface DraftSymbol {
  id: string;
  name: string;
  unit: 'paper' | 'model';
  shapes: SymbolShape[];
}

export const LEGEND_CATEGORIES = ['materials', 'layers', 'hatches', 'symbols', 'annotations'] as const;
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
