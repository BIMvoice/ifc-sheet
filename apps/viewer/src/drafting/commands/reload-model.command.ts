/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * RELOADMODEL (#922): the IFC model the project is drawn from is read again, as saved by its authoring tool, and the
 * project stays (`@/whatchanged/reload`). It works on the project, not on the drawing in front, so it needs no view.
 * It asks the screen for the file (`requestModelReload`): re-read through the handle it was opened with, else picked
 * again, inside the key press that ran the command.
 */

import { requestModelReload } from '@/whatchanged/reload-event';
import type { DraftCommandDef } from './types';

export const reloadModelCommand: DraftCommandDef = {
  id: 'reloadmodel',
  aliases: ['RELOADMODEL', 'RELOAD'],
  labelKey: 'modelReload.cmd',
  projectWide: true,
  // A one-action command is never begun; `create` is the contract's, and it ends at once.
  create: () => ({ prompt: () => ({ key: 'modelReload.cmd' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run() {
    requestModelReload();
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [reloadModelCommand];
