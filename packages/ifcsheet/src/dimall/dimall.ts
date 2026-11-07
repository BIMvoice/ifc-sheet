/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL as one pure function (#707): the dimension strings an architect draws around a building and through its rooms, from
 * what the plan in front carries. The app, the command line and MCP each build the inputs from where they keep the project and
 * apply the result; none of them plans. The result names its messages by translation key and parameters, never as text.
 */

import type { StyleBook } from '../draft-look.js';
import type { DraftEntity, EntityShape, Pt } from '../draft-types.js';
import type { Rect } from '../text-leader.js';
import { dimensionDrafts, isDimAll } from './apply.js';
import { isRoomDim, roomDrafts } from './apply-rooms.js';
import { pieceRects, stringsThroughHeads, symbolPieces } from './avoid.js';
import type { DraftReader, RectsOf } from './measure.js';
import { planDimensions } from './plan.js';
import { planRoomChains } from './rooms.js';
import { clearTags } from './tag-clear.js';
import type { PlanPart } from './types.js';

export interface DimAllInputs {
  viewId: string;
  layerId: string;
  /** The drafts the view carries now. */
  placed: readonly DraftEntity[];
  /** The walls, doors and windows the plan is cut through. */
  parts: readonly PlanPart[];
  /** The model's spaces on the plan: GlobalId and outline, drawing space. */
  rooms: readonly { guid: string; ring: readonly Pt[] }[];
  /** What the drawing carries besides the drafts (a dashed one may be crossed by a dimension line), and its lines. */
  obstacles: readonly (Rect & { dashed?: boolean })[];
  lines?: readonly { a: Pt; b: Pt }[];
  /** The next id of a draft. */
  newId: () => string;
  book: StyleBook;
  /** Drawing units per paper millimetre where the view is drawn. */
  paperUnit: number;
  /** Paper millimetres from the building to the first string (the dimension style's offset). */
  firstMm?: number | undefined;
  settings: { textHeight: number; textStyle: string; dimStyle: string };
  /** The GlobalId of a plan part, to stamp on the dimension that measures it. */
  guidOf?: (partId: number) => string | null;
  reader: DraftReader;
  rectsOf: RectsOf;
}

/** The keys DIMALL says things with; the app's catalogue has them (`drafting.msg.dimAll*`). */
export type DimAllKey = 'drafting.msg.dimAllNone' | 'drafting.msg.dimAllNoRooms' | 'drafting.msg.dimAllHave' | 'drafting.msg.dimAllDone' | 'drafting.msg.dimAllDropped' | 'drafting.msg.dimAllTagsMoved' | 'drafting.msg.dimAllOpenings' | 'drafting.msg.dimAllHeads';

export interface DimAllMessage {
  key: DimAllKey;
  params?: Record<string, number>;
}

export interface DimAllResult {
  /** The dimensions to add. */
  add: DraftEntity[];
  /** Tags that slid clear of the strings, by draft id: the shape each takes. */
  update: Map<string, EntityShape>;
  messages: DimAllMessage[];
}

/** What a run of DIMALL on the plan adds, moves and says. A second run adds only what is missing. */
export function planDimAll(inputs: DimAllInputs): DimAllResult {
  const { placed, settings, reader, rectsOf } = inputs;
  const none = new Map<string, EntityShape>();
  const link = (d: DraftEntity) => reader.sectionLink(d) === null;
  // Tags, notes and labels already on the plan (TAGALL runs first): the strings stand beyond the ones in front of a facade. A section symbol is its own case (`stringsThroughHeads`), dimensions are what is being drawn.
  const clear = rectsOf(placed.filter((d) => d.shape.type !== 'dimension' && link(d)));
  const plan = planDimensions(inputs.parts, { paperUnit: inputs.paperUnit, textHeight: settings.textHeight, ...(inputs.firstMm !== undefined ? { firstMm: inputs.firstMm } : {}), clear });
  // A tag out on its leader in front of a facade slides along it clear of the strings' extension lines.
  const tags = placed.filter((d) => d.shape.type !== 'dimension' && link(d));
  const moves = clearTags(plan, tags, [...rectsOf(placed.filter((d) => d.shape.type !== 'text' || !d.shape.leader)), ...inputs.obstacles], settings.textHeight, reader);
  const moved = moves.size ? placed.map((d) => (moves.has(d.id) ? { ...d, shape: moves.get(d.id)! } : d)) : placed;
  // The rooms of the plan, from the model's spaces: each gets its clear width and depth, placed clear of everything the view carries (its own earlier room dimensions are what is being redrawn).
  const others = moved.filter((d) => !isRoomDim(d));
  const pieces = symbolPieces(others, reader);
  const rooms = planRoomChains(inputs.parts, inputs.rooms.map((r) => ({ id: r.guid, ring: [...r.ring] })), {
    textHeight: settings.textHeight,
    measure: reader.measure,
    // The drawing's own lines and the cut lines of the section marks: a figure keeps clear of them, a dimension line may cross them.
    lines: [...(inputs.lines ?? []), ...pieces.filter((p) => p.kind === 'cut').map((p) => ({ a: p.a, b: p.b }))],
    obstacles: [
      ...rectsOf(others),
      ...pieceRects(pieces.filter((p) => p.kind === 'head'), settings.textHeight * 0.2),
      ...inputs.obstacles.map(({ dashed, ...r }) => ({ ...r, ...(dashed ? { crossable: true } : {}) })),
    ],
  });
  if (plan.strings.length === 0 && rooms.chains.length === 0) {
    return { add: [], update: none, messages: [{ key: 'drafting.msg.dimAllNone' }, ...(rooms.noRooms ? [{ key: 'drafting.msg.dimAllNoRooms' as const }] : [])] };
  }
  const target = {
    viewId: inputs.viewId, layerId: inputs.layerId, textHeight: settings.textHeight, textStyle: settings.textStyle, dimStyle: settings.dimStyle,
    newId: inputs.newId, book: inputs.book, paperUnit: inputs.paperUnit, reader,
    ...(inputs.guidOf ? { guidOf: inputs.guidOf } : {}),
    clear: rectsOf(moved.filter((d) => d.shape.type !== 'dimension' && link(d))),
  };
  const add = [...dimensionDrafts(plan, target, placed.filter(isDimAll), placed), ...roomDrafts(rooms, target, placed.filter(isDimAll))];
  if (add.length === 0) return { add, update: none, messages: [{ key: 'drafting.msg.dimAllHave' }] };
  const crossed = stringsThroughHeads(plan.strings, symbolPieces(placed, reader), settings.textHeight);
  const left = plan.droppedStrings + rooms.dropped;
  const messages: DimAllMessage[] = [{ key: 'drafting.msg.dimAllDone', params: { count: add.length, strings: plan.strings.length + rooms.chains.length, skipped: plan.skippedFacades } }];
  if (left > 0) messages.push({ key: 'drafting.msg.dimAllDropped', params: { count: left } });
  if (moves.size > 0) messages.push({ key: 'drafting.msg.dimAllTagsMoved', params: { count: moves.size } });
  if (rooms.noRooms) messages.push({ key: 'drafting.msg.dimAllNoRooms' });
  if (plan.droppedOpenings > 0) messages.push({ key: 'drafting.msg.dimAllOpenings', params: { count: plan.droppedOpenings } });
  if (crossed > 0) messages.push({ key: 'drafting.msg.dimAllHeads', params: { count: crossed } });
  return { add, update: moves, messages };
}
