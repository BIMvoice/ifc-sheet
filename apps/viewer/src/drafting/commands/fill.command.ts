/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * FILL [colour] (#681): makes the selected closed shapes (a closed polyline, a rectangle, a circle) a masking fill, in white or the
 * colour typed. The fill is an opaque solid hatch over the shape's loops (`@bimvoice/ifcsheet` `fill-mask.ts`), drawn through the
 * one hatch path of the screen, the sheet, the PDF and the DXF, and stored last, so it covers what was drawn before it; "Send to back"
 * or a layer's order moves it. A shape already filled by FILL takes the new colour instead of getting a second fill.
 */

import { fillColourOf, fillLoopsOf, maskingFill } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { commitDrafts, newDraft } from '../draft-store';
import type { DraftEntity, Pt } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

const same = (a: Pt[][], b: Pt[][]) => JSON.stringify(a) === JSON.stringify(b);

function fill(ctx: DraftContext, colour: string): number {
  const ids = ctx.selection();
  const { drafts } = useProjectStore.getState();
  const onView = drafts.filter((d) => d.viewId === ctx.viewId);
  const made: DraftEntity[] = [];
  const recoloured = new Map<string, DraftEntity>();
  for (const e of onView) {
    if (!ids.has(e.id) || e.shape.type === 'hatch') continue;
    const loops = e.shape.type === 'polyline' || e.shape.type === 'circle' ? fillLoopsOf(e.shape) : null;
    if (!loops) continue;
    const old = onView.find((d) => d.shape.type === 'hatch' && d.shape.opaque === true && same(d.shape.loops, loops));
    if (old && old.shape.type === 'hatch') recoloured.set(old.id, { ...old, shape: { ...old.shape, fill: colour } });
    else made.push(newDraft(ctx.viewId, e.layerId, maskingFill(loops, colour)));
  }
  if (made.length + recoloured.size === 0) return 0;
  commitDrafts([...drafts.map((d) => recoloured.get(d.id) ?? d), ...made]);
  return made.length + recoloured.size;
}

export const fillCommand: DraftCommandDef = {
  id: 'fill',
  aliases: ['FILL', 'MASK'],
  labelKey: 'drafting.cmd.fill',
  needsSelection: true,
  takesArgs: true,
  create: () => ({ prompt: () => ({ key: 'drafting.prompt.idle' as const }), input: () => 'point' as const, basePoint: () => null }),
  run(ctx, args) {
    const colour = fillColourOf(args);
    if (!colour) { ctx.say('drafting.msg.fillColour'); return; }
    const count = fill(ctx, colour);
    if (count === 0) ctx.say('drafting.msg.fillNone');
    else ctx.say('drafting.msg.filled', { count, colour });
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [fillCommand];
