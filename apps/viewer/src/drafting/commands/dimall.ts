/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL: the dimension strings an architect draws around a building, in one
 * action, on the plan in front (`dimall/plan.ts`). They are ordinary
 * dimensions, one undo step, and a second run adds only what is missing.
 */

import { dimensionDrafts, isDimAll } from '@/dimall/apply';
import { isRoomDim, roomDrafts } from '@/dimall/apply-rooms';
import { planRoomChains } from '@/dimall/rooms';
import { clearTags } from '@/dimall/tag-clear';
import { pieceRects, stringsThroughHeads, symbolPieces } from '@/dimall/avoid';
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
    // A tag out on its leader in front of a facade slides along it clear of the strings' extension lines.
    const tags = placed.filter((d) => d.shape.type !== 'dimension' && sectionLink(d) === null);
    const moves = clearTags(plan, tags, [...rectsOf(placed.filter((d) => d.shape.type !== 'text' || !d.shape.leader)), ...ctx.planObstacles()], ctx.settings.textHeight);
    const moved = moves.size ? placed.map((d) => (moves.has(d.id) ? { ...d, shape: moves.get(d.id)! } : d)) : placed;
    // The rooms of the plan, from the model's spaces: each gets its clear width and depth, placed clear of everything the view carries (its own earlier room dimensions are what is being redrawn).
    const others = moved.filter((d) => !isRoomDim(d));
    const rooms = planRoomChains(ctx.planParts(), ctx.rooms().map((r) => ({ id: r.guid, ring: r.ring })), {
      textHeight: ctx.settings.textHeight,
      // The drawing's own lines and the cut lines of the section marks: a figure keeps clear of them, a dimension line may cross them.
      lines: [...(ctx.planLines?.() ?? []), ...symbolPieces(others).filter((p) => p.kind === 'cut').map((p) => ({ a: p.a, b: p.b }))],
      obstacles: [
        ...rectsOf(others),
        ...pieceRects(symbolPieces(others).filter((p) => p.kind === 'head'), ctx.settings.textHeight * 0.2),
        ...ctx.planObstacles().map(({ dashed, ...r }) => ({ ...r, ...(dashed ? { crossable: true } : {}) })),
      ],
    });
    if (plan.strings.length === 0 && rooms.chains.length === 0) {
      ctx.say('drafting.msg.dimAllNone');
      if (rooms.noRooms) ctx.say('drafting.msg.dimAllNoRooms');
      return;
    }
    const here = placed;
    const target = { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, guidOf: renderIdGlobalId, clear: rectsOf(moved.filter((d) => d.shape.type !== 'dimension' && sectionLink(d) === null)) };
    const drafts = [...dimensionDrafts(plan, target, here.filter(isDimAll), here), ...roomDrafts(rooms, target, here.filter(isDimAll))];
    if (drafts.length === 0) {
      ctx.say('drafting.msg.dimAllHave');
      return;
    }
    editDrafts({ add: drafts, update: moves });
    const crossed = stringsThroughHeads(plan.strings, symbolPieces(here), ctx.settings.textHeight);
    ctx.say('drafting.msg.dimAllDone', { count: drafts.length, strings: plan.strings.length + rooms.chains.length, skipped: plan.skippedFacades });
    const left = plan.droppedStrings + rooms.dropped;
    if (left > 0) ctx.say('drafting.msg.dimAllDropped', { count: left });
    if (moves.size > 0) ctx.say('drafting.msg.dimAllTagsMoved', { count: moves.size });
    if (rooms.noRooms) ctx.say('drafting.msg.dimAllNoRooms');
    if (plan.droppedOpenings > 0) ctx.say('drafting.msg.dimAllOpenings', { count: plan.droppedOpenings });
    if (crossed > 0) ctx.say('drafting.msg.dimAllHeads', { count: crossed });
  },
};
