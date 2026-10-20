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

/**
 * `globalIdOf` is how a renderer id becomes the key the project file keeps: each text records its ceiling's GlobalId
 * as `ceilingOf`, so a second run skips ceilings tagged under another renderer id (re-export, other load order).
 */
export function ceilTag(
  ctx: DraftContext,
  isCeiling: (renderId: number) => boolean = isCeilingCovering,
  globalIdOf: (renderId: number) => string | null = renderIdGlobalId,
): void {
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
  const done = new Set(ctx.entities().flatMap((d) => (typeof d.params.ceilingOf === 'string' ? [d.params.ceilingOf] : [])));
  // A ceiling with no GlobalId cannot be recognised on the next run, so it is not tagged.
  const keyed = tags.flatMap((t) => { const guid = globalIdOf(t.renderId); return guid ? [{ ...t, guid }] : []; });
  const todo = keyed.filter((t) => !done.has(t.guid));
  const height = ctx.settings.textHeight;
  const drafts = todo.map((t) => newDraft(ctx.viewId, ctx.layerId, {
    type: 'text' as const, p: centredAnchor(t.at, t.text, height, undefined, annotationScreenUp()), text: t.text, height, rotation: 0,
  }, { ...styledParams(ctx.viewId, { type: 'text', p: t.at, text: t.text, height, rotation: 0 }, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), ceilingOf: t.guid }));
  if (drafts.length) editDrafts({ add: drafts });
  ctx.say(drafts.length ? 'drafting.msg.ceilTagDone' : 'drafting.msg.ceilTagNone', { count: drafts.length, already: keyed.length - drafts.length });
}

export const ceilTagCommand: DraftCommandDef = {
  id: 'ceiltag',
  aliases: ['CEILTAG', 'CLT'],
  labelKey: 'drafting.cmd.ceilTag',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.ceilTag' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run: (ctx) => ceilTag(ctx),
};
