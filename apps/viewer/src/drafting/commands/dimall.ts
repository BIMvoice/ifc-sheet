/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL: the dimension strings an architect draws around a building, in one
 * action, on the plan in front (`dimall/plan.ts`). They are ordinary
 * dimensions, one undo step, and a second run adds only what is missing.
 */

import { dimStyleOf, planDimAll, type DimAllInputs } from '@bimvoice/ifcsheet';
import { draftReader } from '@/dimall/reader';
import { rectsOf } from '@/labels/label-annotations';
import { renderIdGlobalId } from '@/project/element-guid';
import { paperUnitOf, styleBook } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { draftsOfView, editDrafts } from '../draft-store';
import type { DraftEntity } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

/** DIMALL's complete inputs on the plan `ctx` is on; `placed` is the view's drafts when the caller keeps them (default: the store's). */
export function dimAllInputs(ctx: DraftContext, newId: () => string, placed?: readonly DraftEntity[]): DimAllInputs {
  const book = styleBook();
  return {
    viewId: ctx.viewId,
    layerId: ctx.layerId,
    placed: placed ?? draftsOfView(ctx.viewId, useProjectStore.getState().drafts),
    parts: ctx.planParts(),
    rooms: ctx.rooms(),
    obstacles: ctx.planObstacles(),
    lines: ctx.planLines?.() ?? [],
    newId,
    book,
    paperUnit: paperUnitOf(ctx.viewId),
    firstMm: dimStyleOf(book, ctx.settings.currentDimStyle).allOffset,
    settings: { textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle },
    guidOf: renderIdGlobalId,
    reader: draftReader(),
    rectsOf,
  };
}

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
    const result = planDimAll(dimAllInputs(ctx, () => freshProjectId('draft')));
    if (result.add.length > 0) editDrafts({ add: result.add, update: result.update });
    for (const m of result.messages) ctx.say(m.key, m.params);
  },
};
