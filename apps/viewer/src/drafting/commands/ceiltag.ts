/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CEILTAG: every ceiling covering of the reflected ceiling plan in front gets
 * its height above the level as a text, one undo step; a second run adds only
 * what is missing (`rcp/ceiling-tags.ts`).
 */

import { annotationScreenUp } from '@/drafting/annotation';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { labelElementByGlobalId } from '@/labels/label-element';
import { centredAnchor } from '@/labels/label-place';
import { renderIdGlobalId } from '@/project/element-guid';
import { styledParams } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { resolvePlanLevel } from '@/project/view-defaults';
import { ceilingPlanTags, loadedDataStores } from '@/rcp/ceiling-floor';
import { editDrafts, newDraft } from '../draft-store';
import type { DraftCommandDef, DraftContext } from './types';

const isCeilingCovering = (renderId: number): boolean => {
  const guid = renderIdGlobalId(renderId);
  return (guid ? labelElementByGlobalId(guid)?.attribute('PredefinedType') : undefined) === 'CEILING';
};

export function ceilTag(ctx: DraftContext, isCeiling: (renderId: number) => boolean = isCeilingCovering): void {
  const view = ctx.view();
  if (view?.kind !== 'plan' || !view.reflected) {
    ctx.say('drafting.msg.ceilTagCeilingPlanOnly');
    return;
  }
  const geometry = currentDrawingRuntime().geometryResult;
  const { levels } = useProjectStore.getState();
  // The soffit is read off the meshes, so the floors are taken in their frame, not from the Elevation attribute;
  // only this storey's ceilings (above the cut, below the next level) are tagged.
  const plan = { level: resolvePlanLevel(view, levels) ?? view.level, cutHeight: view.cutHeight };
  const tags = ceilingPlanTags(geometry?.meshes ?? [], plan, levels, loadedDataStores(), geometry?.coordinateInfo, isCeiling);
  const done = new Set(ctx.entities().flatMap((d) => (typeof d.params.ceilingOf === 'number' ? [d.params.ceilingOf] : [])));
  const todo = tags.filter((t) => !done.has(t.renderId));
  const height = ctx.settings.textHeight;
  const drafts = todo.map((t) => newDraft(ctx.viewId, ctx.layerId, {
    type: 'text' as const, p: centredAnchor(t.at, t.text, height, undefined, annotationScreenUp()), text: t.text, height, rotation: 0,
  }, { ...styledParams(ctx.viewId, { type: 'text', p: t.at, text: t.text, height, rotation: 0 }, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), ceilingOf: t.renderId }));
  if (drafts.length) editDrafts({ add: drafts });
  ctx.say(drafts.length ? 'drafting.msg.ceilTagDone' : 'drafting.msg.ceilTagNone', { count: drafts.length, already: tags.length - drafts.length });
}

export const ceilTagCommand: DraftCommandDef = {
  id: 'ceiltag',
  aliases: ['CEILTAG', 'CLT'],
  labelKey: 'drafting.cmd.ceilTag',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.ceilTag' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run: (ctx) => ceilTag(ctx),
};
