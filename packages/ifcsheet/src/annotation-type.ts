/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The annotation type, a named preset for one annotation tool (#707: the engine's TAGALL draws with its label types). */

import type { AxisShape } from './draft-types.js';
import type { TextFrame } from './draft-types.js';
import type { LeaderMode } from './labels/label-leader.js';
import type { MissingMode } from './labels/label-resolve.js';

/** The annotation tools a type can preset: a drafting command id. */
export const ANNOTATION_TOOLS = ['text', 'leader', 'tag', 'label', 'dimaligned', 'dimlinear', 'dimradius', 'dimdiameter', 'dimangular', 'level', 'axis', 'hatch'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

export const TAG_FIELDS = ['mark', 'name', 'typeName', 'class', 'classification', 'classificationTitle'] as const;
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
