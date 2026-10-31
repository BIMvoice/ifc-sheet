/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL: the dimension strings an architect draws around a building, in one
 * action, on the plan in front (`dimall/plan.ts`). They are ordinary
 * dimensions, one undo step, and a second run adds only what is missing.
 */

import { dimensionDrafts, isDimAll } from '@/dimall/apply';
import { stringsThroughHeads, symbolPieces } from '@/dimall/avoid';
import { planDimensions } from '@/dimall/plan';
import { sectionLink } from '@/drafting/section-symbol';
import { rectsOf } from '@/labels/label-annotations';
import { renderIdGlobalId } from '@/project/element-guid';
import { paperUnitOf, styleBook } from '@/project/drafting-standards';
import { dimStyleOf } from '../styles';
import { useProjectStore } from '@/project/project-store';
import { draftsOfView, editDrafts } from '../draft-store';
import type { DraftCommandDef } from './types';

export const dimAllCommand: DraftCommandDef = {
  id: 'dimall',
  aliases: ['DIMALL', 'DIMA'],
  labelKey: 'drafting.cmd.dimAll',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.dimAll' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run(ctx) {
    if (ctx.viewKind() !== 'plan') {
      ctx.say('drafting.msg.dimAllPlanOnly');
      return;
    }
    // The strings are drawn round the building's outline from the walls the plan cuts; a detail cuts those walls at its crop, so its outline is the crop's edge, not a facade.
    if (ctx.view()?.detail) {
      ctx.say('drafting.msg.dimAllNotOnDetail');
      return;
    }
    const placed = draftsOfView(ctx.viewId, useProjectStore.getState().drafts);
    // Tags, notes and labels already on the plan (TAGALL runs first): the strings stand beyond the ones in front of a facade. A section symbol is its own case (`stringsThroughHeads`), dimensions are what is being drawn.
    const clear = rectsOf(placed.filter((d) => d.shape.type !== 'dimension' && sectionLink(d) === null));
    const plan = planDimensions(ctx.planParts(), { paperUnit: paperUnitOf(ctx.viewId), textHeight: ctx.settings.textHeight, firstMm: dimStyleOf(styleBook(), ctx.settings.currentDimStyle).allOffset, clear });
    if (plan.strings.length === 0) {
      ctx.say('drafting.msg.dimAllNone');
      return;
    }
    const here = placed;
    const drafts = dimensionDrafts(plan, { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, guidOf: renderIdGlobalId, clear }, here.filter(isDimAll), here);
    if (drafts.length === 0) {
      ctx.say('drafting.msg.dimAllHave');
      return;
    }
    editDrafts({ add: drafts });
    const crossed = stringsThroughHeads(plan.strings, symbolPieces(here), ctx.settings.textHeight);
    ctx.say('drafting.msg.dimAllDone', { count: drafts.length, strings: plan.strings.length, skipped: plan.skippedFacades });
    if (plan.droppedStrings > 0) ctx.say('drafting.msg.dimAllDropped', { count: plan.droppedStrings });
    if (crossed > 0) ctx.say('drafting.msg.dimAllHeads', { count: crossed });
  },
};
