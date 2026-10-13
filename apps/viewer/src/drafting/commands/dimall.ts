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
import { paperUnitOf } from '@/project/drafting-standards';
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
    const plan = planDimensions(ctx.planParts(), { paperUnit: paperUnitOf(ctx.viewId), textHeight: ctx.settings.textHeight });
    if (plan.strings.length === 0) {
      ctx.say('drafting.msg.dimAllNone');
      return;
    }
    const here = draftsOfView(ctx.viewId, useProjectStore.getState().drafts);
    const drafts = dimensionDrafts(plan, { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }, here.filter(isDimAll), here, ctx.obstacles(ctx.settings.textHeight).drawn);
    if (drafts.length === 0) {
      ctx.say('drafting.msg.dimAllHave');
      return;
    }
    editDrafts({ add: drafts });
    const crossed = stringsThroughHeads(plan.strings, symbolPieces(here), ctx.settings.textHeight);
    ctx.say('drafting.msg.dimAllDone', { count: drafts.length, strings: plan.strings.length, skipped: plan.skippedFacades });
    if (crossed > 0) ctx.say('drafting.msg.dimAllHeads', { count: crossed });
  },
};
