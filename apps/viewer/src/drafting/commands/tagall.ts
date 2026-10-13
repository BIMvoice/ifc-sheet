/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL: every door, window and room of the plan in front gets its label in
 * one action (`tagall/plan.ts`), one undo step; a second run adds only what is
 * missing. The two label types it draws with are added to the project's
 * annotation types when they are not there (and used as they stand when the
 * office has changed them).
 */

import { labelTargets } from '@/labels/label-all';
import type { ElementReader } from '@/labels/label-all';
import { labelElementByGlobalId } from '@/labels/label-element';
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { planTagAll } from '@/tagall/plan';
import { MARK_TYPE_ID, ROOM_TYPE_ID, TAGALL_TYPES } from '@/tagall/types';
import { editDrafts } from '../draft-store';
import type { DraftEntity } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

/** The kind and code of every door and window mark in the project, so one kind has one code on every plan. */
function knownCodes(drafts: readonly DraftEntity[]): Map<string, string> {
  return new Map(drafts.flatMap((d): [string, string][] => (typeof d.params.markKey === 'string' && typeof d.params.markCode === 'string' ? [[d.params.markKey, d.params.markCode]] : [])));
}

/** The types TAGALL draws with, adding any that the project does not have. */
function tagAllTypes() {
  const have = useProjectStore.getState().annotationTypes ?? [];
  const missing = TAGALL_TYPES.filter((t) => !have.some((h) => h.id === t.id));
  if (missing.length) useProjectStore.setState({ annotationTypes: [...have, ...missing.map((t) => structuredClone(t))], dirty: true });
  const all = useProjectStore.getState().annotationTypes ?? [];
  return { mark: all.find((t) => t.id === MARK_TYPE_ID), room: all.find((t) => t.id === ROOM_TYPE_ID) };
}

/** TAGALL on the plan `ctx` is on, labels read through `read`. */
export function tagAll(ctx: DraftContext, read: ElementReader): void {
  if (ctx.viewKind() !== 'plan') {
    ctx.say('drafting.msg.tagAllPlanOnly');
    return;
  }
  const types = tagAllTypes();
  if (!types.mark?.label || !types.room?.label) {
    ctx.say('drafting.msg.tagAllNeedsTypes');
    return;
  }
  const elements = ctx.viewElements();
  const { drafts, summary } = planTagAll({
    elements,
    targets: labelTargets(elements),
    rooms: ctx.rooms(),
    existing: ctx.entities(),
    placement: { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, paperUnit: paperUnitOf(ctx.viewId) },
    types: { mark: types.mark, room: types.room },
    read,
    crop: ctx.view()?.detail,
    obstacles: ctx.obstacles(ctx.settings.textHeight),
    knownCodes: knownCodes(useProjectStore.getState().drafts),
    reservedMarks: (useProjectStore.getState().joineryTypes ?? []).map((t) => t.mark),
  });
  if (drafts.length) editDrafts({ add: drafts });
  ctx.say(drafts.length ? 'drafting.msg.tagAllDone' : 'drafting.msg.tagAllHave', { marks: summary.marks, rooms: summary.rooms, already: summary.already });
  if (summary.coded > 0) ctx.say('drafting.msg.tagAllCoded', { count: summary.coded, kinds: summary.kinds });
  if (summary.rooms > 0) ctx.say('drafting.msg.tagAllAreas', { model: summary.areaFromModel, footprint: summary.areaFromFootprint });
  if (summary.roomsTooSmall > 0) ctx.say('drafting.msg.tagAllTooSmall', { count: summary.roomsTooSmall });
  if (summary.noRooms) ctx.say('drafting.msg.tagAllNoRooms');
}

export const tagAllCommand: DraftCommandDef = {
  id: 'tagall',
  aliases: ['TAGALL', 'TGA'],
  labelKey: 'drafting.cmd.tagAll',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.tagAll' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run: (ctx) => tagAll(ctx, labelElementByGlobalId),
};
