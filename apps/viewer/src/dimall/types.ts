/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL's vocabulary: the parts of a plan the planner reads (wall, door and
 * window cut outlines, one entry per model element) and the dimension strings
 * it plans. Everything is in the view's drawing units (metres) except the
 * paper distances, which are millimetres on paper.
 */

import type { Pt } from '@/drafting/types';

export type PartKind = 'wall' | 'door' | 'window';

/** A model element of a plan with the outlines it is cut in. */
export interface PlanPart {
  id: number;
  kind: PartKind;
  rings: Pt[][];
}

export interface DimensionSettings {
  /** Drawing units per paper millimetre. */
  paperUnit: number;
  /** Paper millimetres from the building to the first string. */
  firstMm?: number;
  /** Paper millimetres from one string to the next. */
  stepMm?: number;
  /** Text height in drawing units. */
  textHeight: number;
}

export type StringKind = 'inner' | 'middle' | 'overall';

/** One string of dimensions along a facade: the points it measures between, and the line it runs on. */
export interface PlannedString {
  /** Names the facade run and the kind, so a rerun finds the string again. */
  key: string;
  kind: StringKind;
  /** The facade's direction (along the string) and outward normal, drawing space. */
  along: Pt;
  outward: Pt;
  /** The measured points, ordered along the string, on the facade's outer face. */
  points: Pt[];
  /** Drawing units from the outer face to the string's line. */
  offset: number;
}

export interface DimensionPlan {
  strings: PlannedString[];
  /** Facades with nothing to dimension (no opening and no cross wall). */
  skippedFacades: number;
  /** How far the building's main direction is turned from the drawing's x axis, radians. */
  angle: number;
  /** The building's outer outline, drawing space; empty when there are no walls. */
  outline: Pt[];
}
