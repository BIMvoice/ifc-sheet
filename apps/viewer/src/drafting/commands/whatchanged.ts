/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED [CLEAR | ACCEPT]: what a new version of the model changed, sheet by sheet
 * (`@/whatchanged/run`). It works on the project, not on the drawing in front, so it needs no view.
 * The comparison is loaded when the command runs, not with the drafting commands.
 */

import { resolve } from '@/i18n/registry';
import type { DraftCommandDef, DraftContext } from './types';

const line = (ctx: DraftContext) => (text: string) => ctx.say('whatchanged.msg.line', { text });

export const whatChangedCommand: DraftCommandDef = {
  id: 'whatchanged',
  aliases: ['WHATCHANGED', 'WC'],
  labelKey: 'whatchanged.cmd',
  takesArgs: true,
  projectWide: true,
  // A one-action command is never begun; `create` is the contract's, and it ends at once.
  create: () => ({ prompt: () => ({ key: 'whatchanged.cmd' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run(ctx, args) {
    const say = line(ctx);
    void import('@/whatchanged/run').then(({ parseMode, runGuarded }) => {
      const mode = parseMode(args);
      return mode ? runGuarded(mode, say) : say(resolve('whatchanged.usage', { arg: args }));
    }).catch((err: unknown) => {
      console.warn('[whatchanged] could not start', err);
      say(resolve('whatchanged.failed', { reason: err instanceof Error ? err.message : String(err) }));
    });
  },
};
