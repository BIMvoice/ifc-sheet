/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** TAGALL as a pure function (#707): the labels of a plan, section or elevation planned from plain inputs, with the label, tag-field and room pieces under it. Add new exports of this area here, not in `../index.ts`. */

export { planTagAll, type TagAllInputs, type TagAllKey, type TagAllMessage, type TagAllResult } from '../tagall/tagall.js';
export { modelArea, type TagAllDrafts } from '../tagall/plan.js';
export {
  ALL_TAG_PARTS, AREA_FIELDS, LEGACY_ROOM_TEMPLATE, MARK_TEMPLATE, MARK_TYPE_ID, NUMBERLESS_ROOM_TEMPLATE, ROOM_TEMPLATE, ROOM_TYPE_ID, TAGALL_TYPES, upgradeTagAllTypes,
  type TagAllSummary, type TagParts,
} from '../tagall/types.js';
export { type RoomOfPlan } from '../tagall/footprint.js';
export { roomsOfPlan } from '../tagall/rooms.js';
export { roomsOfCut, spaceFloorArea } from '../tagall/cut-rooms.js';
export { roomLabelPoint, type RoomObstacles, type RoomPoint } from '../tagall/room-point.js';
export { roomLabelPointLeast } from '../tagall/room-point-least.js';
export { leaderCrossesOutsideEntry, roomLabelOutside, type OutsidePlace, type OutsideScene } from '../tagall/room-outside.js';
export { clipLoop } from '../clip-loop.js';
export { ANNOTATION_TOOLS, TAG_FIELDS, DEFAULT_LABEL, type AnnotationTool, type TagFieldName, type LabelSpec, type AnnotationType } from '../annotation-type.js';
export { labelDraft, labelSize, type ElementReader, type LabelEnv, type LabelPlacement } from '../labels/label-draft.js';
export { textRectOf, withLeaderOf, type TextShape, type WidthOf } from '../labels/label-attach.js';
export { LEADER_MODES, DEFAULT_LEADER, DISPLACED_MM, asLeaderMode, leaderTip, refToRing, ringToRef, type LeaderMode } from '../labels/label-leader.js';
export { COMPUTED_AREA, COMPUTED_SET, extrasOf, resolveWithExtras, type LabelExtras } from '../labels/label-extras.js';
export { MISSING_MODES, readField, readFieldValue, readStored, resolveTemplate, type FieldValue, type LabelElement, type MissingMode, type PropertySetLike, type QuantitySetLike } from '../labels/label-resolve.js';
export { centredAnchor, classesOf, unlabelledTargets, type LabelTarget } from '../labels/label-place.js';
