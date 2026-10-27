/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drafting entities: the 2D geometry a user draws on a view. The shapes are the engine's (`packages/ifcsheet/src/draft-types.ts`),
 * so the command line reads and prints the drafts the app saved with the same definitions (#479); re-exported here for the app.
 */

export { isGeometry } from '@bimvoice/ifcsheet';
export type {
  AnnotationShape, AxisEnds, AxisShape, DraftEntity, DraftLayer, DraftParamValue, DraftShape, EntityShape, LevelRef, Pt, SnapHit, SnapMode, SymbolInstanceShape,
} from '@bimvoice/ifcsheet';
