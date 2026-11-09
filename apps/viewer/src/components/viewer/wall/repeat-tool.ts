/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Repeat last tool" (#168). A stepped-in sheet registers how it starts a tool from the
 * rail, so a repeat lights the rail, shows the tool card and its Done, exactly as a click on the
 * tool does. With no sheet in front the drafting session starts the command itself.
 */

import { startDraftCommand, useDraftingSession } from '@/drafting/session';

let railStart: ((command: string) => void) | null = null;

/** The sheet's own tool start; returns what to call on unmount. */
export function registerRailStart(start: (command: string) => void): () => void {
  railStart = start;
  return () => { if (railStart === start) railStart = null; };
}

/** Start the last tool again, through the rail when a sheet is in front. Does nothing while a tool runs. */
export function repeatLastTool(): void {
  const { lastCommandId, commandId, selecting } = useDraftingSession.getState();
  if (!lastCommandId || commandId || selecting) return;
  if (railStart) railStart(lastCommandId); else startDraftCommand(lastCommandId);
}
