/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The plan symbols of doors and windows, and the joinery symbol strokes they are made of: one copy for the app and the headless engine. Add new exports of this area here, not in `../index.ts`. */

// Doors and windows as a plan draws them: read from the mesh, with the stated operation and the configured type
export {
  DOUBLE_LEAF_WIDTH, doorSymbol, hullCandidates, minAreaRect, openingSymbols, symbolShapes, windowSymbol,
  type OpeningRect, type OpeningSymbol,
} from '../opening-symbols.js';
// A configured type's strokes in plan, elevation and section, and its plan symbol put where the element is
export {
  elevationSymbol, openingMarks, planSymbol, sectionSymbol, strokeBounds,
  type ElevationOptions, type JoineryStroke, type OpeningConvention, type P2, type PlanOptions, type SectionOptions, type StrokeWeight,
} from '../joinery-symbols.js';
export { typedPlanSymbol, type TypedPlanSymbol } from '../joinery-plan-placement.js';
export { DEFAULT_SEGMENTAL_RISE, archPoints, headArch, type HeadArch } from '../joinery-head-shape.js';
export { glazingBarStrokes, type BarClip } from '../joinery-glazing-bars.js';
