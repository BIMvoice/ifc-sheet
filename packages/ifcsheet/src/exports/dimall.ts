/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMALL as a pure function (#707): the dimension strings round a building and through its rooms, planned from plain inputs. Add new exports of this area here, not in `../index.ts`. */

export { planDimAll, type DimAllInputs, type DimAllKey, type DimAllMessage, type DimAllResult } from '../dimall/dimall.js';
export { tableMeasure, type DimAllMeasure, type DraftReader, type RectsOf, type SectionLinkOf } from '../dimall/measure.js';
export { dimensionDrafts, isDimAll, type DimensionTarget } from '../dimall/apply.js';
export { pieceRects, stringsThroughHeads, symbolPieces, type SymbolPiece } from '../dimall/avoid.js';
export { kindOfClass, planParts } from '../dimall/parts.js';
export { planDimensions } from '../dimall/plan.js';
export { planRoomChains, type RoomPlan } from '../dimall/rooms.js';
export type { DimensionPlan, PartKind, PlannedString, PlanPart } from '../dimall/types.js';
export { openingObstacles, overlayObstacleBoxes, type ObstacleBox, type ObstacleOverlay } from '../dimall/plan-obstacles.js';
