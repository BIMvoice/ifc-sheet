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
import { clearTagSpot, tagObstacles } from '@/rcp/ceiling-tag-spot';
import { stackedGroups } from '@/rcp/ceiling-tags';
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
  // A tag is for its ceiling and for the ceilings that share it (`ceilingShared`), so a covering met later is not tagged again.
  const done = new Set(ctx.entities().flatMap((d) => [...(typeof d.params.ceilingOf === 'string' ? [d.params.ceilingOf] : []), ...(typeof d.params.ceilingShared === 'string' ? d.params.ceilingShared.split(',') : [])]));
  // A ceiling with no GlobalId cannot be recognised on the next run, so it is not tagged.
  const keyed = tags.flatMap((t) => { const guid = globalIdOf(t.renderId); return guid ? [{ ...t, guid }] : []; });
  // Ceilings that would print the same text at the same spot (two coverings with one face) share one tag; a group is done when any of its ceilings is.
  const groups = stackedGroups(keyed);
  const todo = groups.filter((g) => !g.some((t) => done.has(t.guid))).map((g) => ({ ...g[0], shared: g.map((t) => t.guid) }));
  const height = ctx.settings.textHeight;
  const up = annotationScreenUp();
  // A tag stands at the centroid of its ceiling unless the plan draws a door leaf or swing (or a drafted line) there.
  const { symbolFlips } = useProjectStore.getState();
  const obstacles = todo.length ? tagObstacles(view, levels, geometry?.meshes ?? [], symbolFlips, ctx.entities()) : [];
  const drafts = todo.map((t) => {
    const at = clearTagSpot(t.at, t.extent, t.text, height, up, obstacles);
    return newDraft(ctx.viewId, ctx.layerId, {
      type: 'text' as const, p: centredAnchor(at, t.text, height, undefined, up), text: t.text, height, rotation: 0,
    }, { ...styledParams(ctx.viewId, { type: 'text', p: at, text: t.text, height, rotation: 0 }, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), ceilingOf: t.guid, ...(t.shared.length > 1 ? { ceilingShared: t.shared.slice(1).join(',') } : {}) });
  });
  if (drafts.length) editDrafts({ add: drafts });
  ctx.say(drafts.length ? 'drafting.msg.ceilTagDone' : 'drafting.msg.ceilTagNone', { count: drafts.length, already: groups.length - drafts.length });
  const stacked = keyed.length - groups.length;
  if (stacked > 0) ctx.say('drafting.msg.ceilTagStacked', { stacked, tags: groups.length });
}

export const ceilTagCommand: DraftCommandDef = {
  id: 'ceiltag',
  aliases: ['CEILTAG', 'CLT'],
  labelKey: 'drafting.cmd.ceilTag',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.ceilTag' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run: (ctx) => ceilTag(ctx),
};
