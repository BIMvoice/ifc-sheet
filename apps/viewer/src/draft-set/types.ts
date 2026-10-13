/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The draft drawing set as plain data. The planner (`plan.ts`) turns a
 * model's storeys and extents into a `DraftSetPlan`; the applier
 * (`apply.ts`) turns the plan into project views and sheets. Neither knows
 * the screen: every sentence the person reads is a `Reason` (a catalogue key
 * and its parameters), translated where it is shown.
 *
 * Lengths of the model are metres in the viewer frame (x east, y up, z
 * south); everything on the sheet is paper millimetres from the sheet's
 * top-left corner.
 */

import type { TranslationKey } from '@/i18n';
import type { ElevationDirection, PaperSize } from '@/project/types';

export interface Box3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** A sentence kept as data: a catalogue key and its parameters. */
export interface Reason {
  key: TranslationKey;
  params: Record<string, string | number>;
}

/** What the app offers, so the planner never reads the screen. */
export interface SheetSpec {
  /** Landscape sizes, smallest first. */
  papers: readonly { name: PaperSize; w: number; h: number }[];
  /** Scale denominators offered (50 = 1:50), any order. */
  scales: readonly number[];
  /** Frame inset from the paper edge, mm. */
  frameMarginMm: number;
  /** The title block, bottom right inside the frame, mm. */
  titleBlockMm: { w: number; h: number };
  /** Room a viewport box keeps around its drawing on each side, mm (the auto-fit box of `fitViewportBox`). */
  viewportMarginMm: number;
}

export interface DraftSetInput {
  projectName: string;
  buildingName: string;
  /** Printed in the title block; an input so the same input gives the same plan. */
  date: string;
  storeys: readonly { name: string; elevation: number }[];
  /** The model's extents, `null` before any geometry has loaded. */
  bounds: Box3 | null;
  spec: SheetSpec;
}

export type SectionAxis = 'x' | 'z';

export interface PlannedPlan {
  key: string;
  kind: 'plan';
  name: string;
  level: { name: string; elevation: number };
  /** Cut height above the level, metres. */
  cutHeight: number;
  /** The scale it is drawn at on its sheet (annotation sizes follow it). */
  scale: number;
}

export interface PlannedElevation {
  key: string;
  kind: 'elevation';
  name: string;
  direction: ElevationDirection;
  /** Where the plane stands on its axis, metres: just inside the facade of the main body. */
  planeOffset: number;
  /** View depth, metres. */
  depth: number;
  depthReason: Reason;
}

export interface PlannedSection {
  key: string;
  kind: 'section';
  /** `Section A-A`. */
  name: string;
  axis: SectionAxis;
  /** The cut line on the plan, in plan drawing metres, and a point on the side the section looks toward. */
  line: { a: { x: number; y: number }; b: { x: number; y: number }; side: { x: number; y: number } };
  /** The plan that carries the section mark. */
  onPlan: string;
  depth: number;
  depthReason: Reason;
}

export type PlannedView = PlannedPlan | PlannedElevation | PlannedSection;

export interface PlannedViewport {
  viewKey: string;
  scale: number;
  /** Centre on the paper, mm. */
  x: number;
  y: number;
  /** The drawing's box on the paper at this scale, mm. */
  width: number;
  height: number;
  /** The box is set on the viewport; otherwise it is left to fit the drawing, as for any viewport placed by hand. */
  fixedBox: boolean;
}

export type SheetGroup = 'plans' | 'elevations' | 'sections';

export interface PlannedSheet {
  group: SheetGroup;
  /** `A-101`: plans A-1xx, elevations A-2xx, sections A-3xx. */
  number: string;
  title: Reason;
  paper: PaperSize;
  orientation: 'landscape' | 'portrait';
  viewports: PlannedViewport[];
  titleBlock: Record<string, string>;
  /** Why this scale on this paper. */
  reason: Reason;
  /** False when even the smallest scale on the largest paper leaves the drawing larger than the sheet. */
  fits: boolean;
}

export interface DraftSetPlan {
  views: PlannedView[];
  sheets: PlannedSheet[];
  /** Things the person should know: no storeys, no model, a drawing that does not fit. */
  notes: Reason[];
}
