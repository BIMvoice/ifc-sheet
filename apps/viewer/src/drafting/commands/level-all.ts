/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALL: a level mark at each storey level a section or elevation shows and
 * at the top of the building, aligned on one vertical line outside the
 * building (`levelall/plan.ts`). The marks keep their references, so they
 * follow the model; one undo step; a second run adds only what is missing.
 */

import { rectsOf } from '@/labels/label-annotations';
import { ringBounds } from '@/labels/label-geometry';
import { planLevels } from '@/levelall/plan';
import { paperUnitOf, styledParams } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { newDraft, editDrafts } from '../draft-store';
import type { LevelShape } from '../level-mark';
import type { DraftCommandDef } from './types';

export const levelAllCommand: DraftCommandDef = {
  id: 'levelall',
  aliases: ['LEVELALL', 'LVL'],
  labelKey: 'drafting.cmd.levelAll',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.levelAll' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run(ctx) {
    const kind = ctx.viewKind();
    if (kind !== 'section' && kind !== 'elevation') {
      ctx.say('drafting.msg.levelAllViewOnly');
      return;
    }
    const rings = ctx.viewElements().map((e) => ringBounds(e.ring));
    if (rings.length === 0) {
      ctx.say('drafting.msg.levelAllEmpty');
      return;
    }
    const bounds = { x0: Math.min(...rings.map((r) => r.x0)), y0: Math.min(...rings.map((r) => r.y0)), x1: Math.max(...rings.map((r) => r.x1)), y1: Math.max(...rings.map((r) => r.y1)) };
    const here = ctx.entities();
    const plan = planLevels({
      levels: useProjectStore.getState().levels,
      bounds,
      existing: here.flatMap((d) => (d.shape.type === 'level' ? [d.shape as LevelShape] : [])),
      taken: rectsOf(here.filter((d) => d.shape.type !== 'level')),
      textHeight: ctx.settings.textHeight,
      paperUnit: paperUnitOf(ctx.viewId),
    });
    if (plan.marks.length === 0) {
      ctx.say('drafting.msg.levelAllHave', { count: plan.already });
      return;
    }
    const drafts = plan.marks.map((m) => newDraft(ctx.viewId, ctx.layerId, m.shape, { ...styledParams(ctx.viewId, m.shape, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), levelAll: m.key }));
    editDrafts({ add: drafts });
    ctx.say(plan.side === 'left' ? 'drafting.msg.levelAllDoneLeft' : 'drafting.msg.levelAllDoneRight', { count: drafts.length, already: plan.already });
  },
};
