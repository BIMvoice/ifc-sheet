/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * BRINGTOFRONT and SENDTOBACK (#682): act at once on the selection, as one undoable step, and put it above everything else drafted
 * on the view or below it. The order is the stored order of the drafts (`@bimvoice/ifcsheet` `draw-order.ts`), so the screen, the
 * sheet, the PDF and the DXF all follow it; a layer's own order (the layer manager) still comes first.
 */

import { movedInOrder } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { commitDrafts } from '../draft-store';
import type { DraftCommandDef, DraftContext } from './types';

/** Move the selection to the front or back of the drafts; the number moved (0: it was there already, or nothing was selected). */
function move(ctx: DraftContext, to: 'front' | 'back'): number {
  const ids = ctx.selection();
  const { drafts } = useProjectStore.getState();
  const next = movedInOrder(drafts, ids, to);
  if (next === drafts) return 0;
  commitDrafts([...next]);
  return drafts.filter((d) => ids.has(d.id)).length;
}

const idle = () => ({ prompt: () => ({ key: 'drafting.prompt.idle' as const }), input: () => 'point' as const, basePoint: () => null });

export const bringToFrontCommand: DraftCommandDef = {
  id: 'bringtofront',
  aliases: ['BRINGTOFRONT', 'FRONT'],
  labelKey: 'drafting.cmd.bringToFront',
  needsSelection: true,
  create: idle,
  run(ctx) {
    const count = move(ctx, 'front');
    ctx.say(count > 0 ? 'drafting.msg.orderFront' : 'drafting.msg.orderKept', { count });
  },
};

export const sendToBackCommand: DraftCommandDef = {
  id: 'sendtoback',
  aliases: ['SENDTOBACK', 'BACK'],
  labelKey: 'drafting.cmd.sendToBack',
  needsSelection: true,
  create: idle,
  run(ctx) {
    const count = move(ctx, 'back');
    ctx.say(count > 0 ? 'drafting.msg.orderBack' : 'drafting.msg.orderKept', { count });
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [bringToFrontCommand, sendToBackCommand];
