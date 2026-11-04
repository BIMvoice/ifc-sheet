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
import { planTagAllInApp } from '@/tagall/plan';
import { getLocale } from '@/i18n';
import { MARK_TYPE_ID, ROOM_TYPE_ID, TAGALL_TYPES, type TagParts } from '@bimvoice/ifcsheet';
import { editDrafts } from '../draft-store';
import type { DraftCommandDef, DraftContext } from './types';
import { currentSheetLocale } from '@/project/units-and-numbers';

/** The types TAGALL draws with, adding any that the project does not have. */
function tagAllTypes() {
  const have = useProjectStore.getState().annotationTypes ?? [];
  const missing = TAGALL_TYPES.filter((t) => !have.some((h) => h.id === t.id));
  if (missing.length) useProjectStore.setState({ annotationTypes: [...have, ...missing.map((t) => structuredClone(t))], dirty: true });
  const all = useProjectStore.getState().annotationTypes ?? [];
  return { mark: all.find((t) => t.id === MARK_TYPE_ID), room: all.find((t) => t.id === ROOM_TYPE_ID) };
}

/** TAGALL on the plan `ctx` is on, labels read through `read`; `parts` limits it to some kinds (an annotation preset, #497). */
export function tagAll(ctx: DraftContext, read: ElementReader, parts?: TagParts): void {
  const kind = ctx.viewKind();
  if (kind === null) {
    ctx.say('drafting.msg.tagAllPlanOnly');
    return;
  }
  // A section or an elevation tags the rooms its plane cuts (#677); doors and windows are tagged on plans.
  const onPlan = kind === 'plan';
  const types = tagAllTypes();
  if (!types.mark?.label || !types.room?.label) {
    ctx.say('drafting.msg.tagAllNeedsTypes');
    return;
  }
  const elements = onPlan ? ctx.viewElements() : [];
  const result = planTagAllInApp({
    onPlan,
    elements,
    targets: labelTargets(elements),
    rooms: ctx.rooms(),
    existing: ctx.entities(),
    placement: { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, paperUnit: paperUnitOf(ctx.viewId), locale: currentSheetLocale(getLocale()) },
    types: { mark: types.mark, room: types.room },
    read,
    parts,
    crop: ctx.view()?.detail,
    obstacles: onPlan ? ctx.planObstacles() : [],
  });
  if (result.add.length) editDrafts({ add: result.add });
  for (const m of result.messages) ctx.say(m.key, m.params);
}

export const tagAllCommand: DraftCommandDef = {
  id: 'tagall',
  aliases: ['TAGALL', 'TGA'],
  labelKey: 'drafting.cmd.tagAll',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.tagAll' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run: (ctx) => tagAll(ctx, labelElementByGlobalId),
};
