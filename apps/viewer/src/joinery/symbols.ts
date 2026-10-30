/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A configured joinery type's plan, elevation and section strokes. Lives in the engine (`@bimvoice/ifcsheet`, `joinery-symbols.ts`), one copy for the app and the engine; re-exported for the app's imports. */

export {
  elevationSymbol, openingMarks, planSymbol, sectionSymbol, strokeBounds,
  type ElevationOptions, type JoineryStroke, type OpeningConvention, type P2, type PlanOptions, type SectionOptions, type StrokeWeight,
} from '@bimvoice/ifcsheet';
