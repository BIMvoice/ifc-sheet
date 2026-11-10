/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LINESTYLE (#189): draw a line of the generated drawing in another pen, for this view only, without editing the model and without
 * replacing the line by a drafted one. Type the pen first (a weight `heavy` `medium` `light` `hairline`, a line type `solid` `dashed`
 * `hidden` `centre`, a colour `#rrggbb`; any number of them), then click lines; `RESET` makes the next clicks give lines back their
 * category's pen. The view keeps it by the line's key (`setLineStyle`), so it holds when the drawing is rebuilt. One undo step per click.
 */

import type { LineStyleOverride, LineStyleType } from '@bimvoice/ifcsheet';
import { resetLineStyle, setLineStyle } from '@/project/element-graphics-actions';
import type { DraftCommandDef } from './types';

const WEIGHTS = ['heavy', 'medium', 'light', 'hairline'] as const;
const TYPES: readonly LineStyleType[] = ['solid', 'dashed', 'hidden', 'centre'];

export const lineStyleCommand: DraftCommandDef = {
  id: 'linestyle',
  aliases: ['LINESTYLE', 'LS'],
  labelKey: 'drafting.cmd.linestyle',
  create(ctx) {
    let pen: LineStyleOverride = {};
    let reset = false;
    return {
      prompt: () => ({ key: reset ? 'drafting.prompt.linestyleReset' : 'drafting.prompt.linestyle' }),
      input: () => 'pick',
      basePoint: () => null,
      onKeyword(word) {
        const w = word.trim().toLowerCase();
        if (w === 'reset') {
          reset = true;
          pen = {};
          return 'continue';
        }
        const weight = WEIGHTS.find((x) => x === w);
        const type = TYPES.find((x) => x === w);
        const color = /^#[0-9a-f]{6}$/.test(w) ? w : undefined;
        if (!weight && !type && !color) return undefined;
        reset = false;
        pen = { ...pen, ...(weight ? { weight } : {}), ...(type ? { type } : {}), ...(color ? { color } : {}) };
        return 'continue';
      },
      onPick: () => 'continue',
      onPickModelLine(line) {
        const ends = { start: line.a, end: line.b };
        if (reset) {
          resetLineStyle(ctx.viewId, line.globalId, ends);
          ctx.say('drafting.msg.linestyleReset');
        } else if (Object.keys(pen).length === 0) ctx.say('drafting.msg.linestyleNoPen');
        else {
          setLineStyle(ctx.viewId, line.globalId, ends, pen);
          ctx.say('drafting.msg.linestyleSet');
        }
        return 'continue';
      },
      onEnter: () => 'done',
    };
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [lineStyleCommand];
