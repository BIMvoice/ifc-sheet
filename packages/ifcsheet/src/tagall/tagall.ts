/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL as a pure function (#707): the labels a plan, a section or an
 * elevation still needs, planned from plain inputs, with what the run says as
 * translation keys and numbers. The app's command reads the stores, calls this
 * and applies the result (one undo step); the command line and MCP call it with
 * their own inputs. A second run adds only what is missing.
 */

import type { DraftEntity, EntityShape } from '../draft-types.js';
import { tagAllDrafts, type TagAllDrafts } from './plan.js';
import type { TagAllSummary } from './types.js';

export type TagAllInputs = TagAllDrafts & {
  /** The view is a plan: it tags doors, windows and rooms; a section or an elevation tags the rooms its plane cuts (#677). */
  onPlan: boolean;
};

/** The keys TAGALL says things with; the app's catalogue has them (`drafting.msg.tagAll*`). */
export type TagAllKey =
  | 'drafting.msg.tagAllDone' | 'drafting.msg.tagAllHave' | 'drafting.msg.tagAllNumbered' | 'drafting.msg.tagAllAreas'
  | 'drafting.msg.tagAllTooSmall' | 'drafting.msg.tagAllOverLines' | 'drafting.msg.tagAllNoRooms' | 'drafting.msg.tagAllNoRoomsCut';

export interface TagAllMessage {
  key: TagAllKey;
  params?: Record<string, number>;
}

export interface TagAllResult {
  /** The labels to add. */
  add: DraftEntity[];
  /** What TAGALL changes of the drafts already there, by draft id: nothing yet; present so it applies like DIMALL. */
  update: Map<string, EntityShape>;
  messages: TagAllMessage[];
  summary: TagAllSummary;
}

/** What a run of TAGALL adds and says. */
export function planTagAll(inputs: TagAllInputs): TagAllResult {
  const { onPlan } = inputs;
  const { drafts, summary } = tagAllDrafts({
    ...inputs,
    parts: onPlan ? inputs.parts : { doors: false, windows: false, rooms: inputs.parts?.rooms ?? true },
    obstacles: onPlan ? inputs.obstacles : [],
  });
  const messages: TagAllMessage[] = [{ key: drafts.length ? 'drafting.msg.tagAllDone' : 'drafting.msg.tagAllHave', params: { marks: summary.marks, rooms: summary.rooms, already: summary.already } }];
  if (summary.numbered > 0) messages.push({ key: 'drafting.msg.tagAllNumbered', params: { count: summary.numbered } });
  if (summary.rooms > 0) messages.push({ key: 'drafting.msg.tagAllAreas', params: { model: summary.areaFromModel, footprint: summary.areaFromFootprint } });
  if (summary.roomsTooSmall > 0) messages.push({ key: 'drafting.msg.tagAllTooSmall', params: { count: summary.roomsTooSmall } });
  if (summary.roomsOverLines > 0) messages.push({ key: 'drafting.msg.tagAllOverLines', params: { count: summary.roomsOverLines } });
  if (summary.noRooms) messages.push({ key: onPlan ? 'drafting.msg.tagAllNoRooms' : 'drafting.msg.tagAllNoRoomsCut' });
  return { add: drafts, update: new Map(), messages, summary };
}
