/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * HIDELINE (#189): click a line of the generated drawing to hide it in this view. The model is not edited; the view keeps the line
 * in its `hiddenLines` (the entry "Hide a line" on the drawing's bar writes, #33), so it stays hidden when the drawing is rebuilt.
 * It repeats until Enter or Escape; one undo step per click.
 */

import { hideLine } from '@/project/element-graphics-actions';
import type { DraftCommandDef } from './types';

export const hideLineCommand: DraftCommandDef = {
  id: 'hideline',
  aliases: ['HIDELINE', 'HL'],
  labelKey: 'drafting.cmd.hideline',
  create(ctx) {
    return {
      prompt: () => ({ key: 'drafting.prompt.hideline' }),
      input: () => 'pick',
      basePoint: () => null,
      onPick() {
        ctx.say('drafting.msg.hidelineDrawn');
        return 'continue';
      },
      onPickModelLine(line) {
        hideLine(ctx.viewId, line.globalId, { start: line.a, end: line.b });
        ctx.say('drafting.msg.hidelineDone');
        return 'continue';
      },
      onEnter: () => 'done',
    };
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [hideLineCommand];
