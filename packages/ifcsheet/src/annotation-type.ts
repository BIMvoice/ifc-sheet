/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The annotation type, a named preset for one annotation tool (#707: the engine's TAGALL draws with its label types). */

import type { AxisShape, LeaderEnd } from './draft-types.js';
import type { TextFrame } from './draft-types.js';
import type { LeaderMode } from './labels/label-leader.js';
import type { MissingMode } from './labels/label-resolve.js';

/** The annotation tools a type can preset: a drafting command id. */
export const ANNOTATION_TOOLS = ['text', 'leader', 'tag', 'label', 'dimaligned', 'dimlinear', 'dimradius', 'dimdiameter', 'dimangular', 'level', 'axis', 'hatch'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

export const TAG_FIELDS = ['mark', 'name', 'typeName', 'class', 'classification', 'classificationTitle', 'custom'] as const;
export type TagFieldName = (typeof TAG_FIELDS)[number];

/** The IFC classes a label type may frame on their own (#924): many offices ring a door's mark and put a window's in a hexagon. */
export const FRAMED_CLASSES = ['IfcDoor', 'IfcWindow'] as const;
export type FramedClass = (typeof FRAMED_CLASSES)[number];
/** A class's own frame: one of the frames, or none where the type has one. */
export type ClassFrame = TextFrame | 'none';

/**
 * A parametric label: `template` is text with `{field}` placeholders read from
 * the labelled element (`labels/label-template.ts`), `frame` an outline round
 * it, `missing` what shows where a field has no value.
 */
export interface LabelSpec {
  template: string;
  frame?: TextFrame;
  /** The frame of the labels of a door or a window, in place of `frame` (#924). Absent, or a class absent: `frame`. */
  classFrames?: Partial<Record<FramedClass, ClassFrame>>;
  missing: MissingMode;
  /** Whether the label is joined to its element by a leader: never, once displaced, or always. Absent: once displaced. */
  leader?: LeaderMode;
  /** What the leader carries at its tip (#842): an arrow, a dot or nothing. Absent: an arrow. */
  leaderEnd?: LeaderEnd;
  /** Clear space round each label, paper millimetres (#842): from its element, the other labels and what it keeps clear of. Absent: the standard spacing (`labelSpacing`). */
  gap?: number;
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
