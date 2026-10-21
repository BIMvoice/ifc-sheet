/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the command line does with a submitted line. With AutoCAD mode off
 * (the default) it is exactly the drafting session's `submitCommandLine`.
 *
 * With it on (#168), an idle line may name a registry action by its AutoCAD
 * alias (`lib/commands/autocad-aliases.ts`:
 * Z fits, U undoes, PLOT prints…), which runs through the same function as
 * the action's key (`run-action.ts`). An empty line (Enter, or Space) repeats
 * the last command, the alias's action included. Everything else (command
 * names, typed coordinates and distances, keywords) is the session's.
 */

import { echoLine, runningCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';
import type { Pt } from '@/drafting/types';
import type { WallActionId } from '@/lib/commands/action-registry';
import { autocadAliasAction } from '@/lib/commands/autocad-aliases';
import { autocadModeOn } from '@/lib/commands/autocad-mode';
import { actionLabelKey, actionOnOffer, runRegistryAction } from './run-action';

/** The last command run by an alias, while no drafting command has started since. */
let lastAlias: { readonly alias: string; readonly action: WallActionId } | null = null;

// A drafting command started after the alias (typed, from the rail or a key) is the one Enter repeats.
useDraftingSession.subscribe((s, prev) => {
  if ((s.commandId !== null && s.commandId !== prev.commandId) || s.lastCommandId !== prev.lastCommandId) lastAlias = null;
});

function runAlias(alias: string, action: WallActionId): void {
  if (!actionOnOffer(action)) {
    echoLine('wall.keys.autocad.unavailable', { name: alias });
    return;
  }
  echoLine(actionLabelKey(action));
  runRegistryAction(action);
  lastAlias = { alias, action };
}

export function submitTypedLine(text: string, cursor: Pt | null): void {
  if (autocadModeOn() && !runningCommand() && !useDraftingSession.getState().selecting) {
    const word = text.trim().toUpperCase();
    if (word === '' && lastAlias) {
      runAlias(lastAlias.alias, lastAlias.action);
      return;
    }
    // No alias is a drafting command's name (a test holds the table to that), so the order cannot matter.
    const action = autocadAliasAction(word);
    if (action) {
      runAlias(word, action);
      return;
    }
  }
  submitCommandLine(text, cursor);
}
