/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Going to a finding and fixing it, for every surface that lists them (the
 * sheet panel's tabs, the Wall). A surface supplies only how it opens a place
 * (`FindingNav`); what follows is the same everywhere: wait until the drafting
 * session is on the finding's view with its drawing made, then select the
 * annotation it is about, or start the one-action command that fixes it.
 */

import { requestFocus } from './focus';
import { draftCommandByName } from '@/drafting/commands/registry';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import { activateDocumentTab } from '@/project/open-view';
import { useViewDrawings } from '@/project/view-drawings';
import type { Finding } from './types';

/** How a surface brings a finding's place in front. False when there is nothing to open. */
export interface FindingNav {
  open(f: Finding): boolean;
}

/** The sheet panel's: the view's tab, else the sheet's. */
export const tabsNav: FindingNav = {
  open(f) {
    const id = f.viewId ?? f.sheetId;
    return !!id && activateDocumentTab(id) !== 'missing';
  },
};

const WAIT_MS = 20_000;
const POLL_MS = 100;
/** After the drawing is made the view's effects install what the commands read (the plan's parts, the rooms); they run a render later. */
const SETTLE_MS = 500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const attached = (viewId: string) => useDraftingSession.getState().viewId === viewId;
const drawn = (viewId: string) => useViewDrawings.getState().byView[viewId]?.status === 'ready';

/**
 * Resolves true once the session is on `viewId` (and, with `drawing`, its drawing is made and the view has
 * settled), false after `WAIT_MS`.
 */
export async function whenInView(viewId: string, drawing: boolean): Promise<boolean> {
  for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
    if (attached(viewId) && (!drawing || drawn(viewId))) {
      if (!drawing) return true;
      await sleep(SETTLE_MS);
      return attached(viewId);
    }
    await sleep(POLL_MS);
  }
  return false;
}

/** Opens the place a finding is about and selects its annotation. False when there is nothing to open. */
export function goToFinding(f: Finding, nav: FindingNav): boolean {
  if (!nav.open(f)) return false;
  const { viewId, draftId } = f;
  if (viewId && !draftId && f.guids?.length) requestFocus(viewId, f.guids);
  if (viewId && draftId) void whenInView(viewId, false).then((ok) => ok && useDraftingSession.setState({ selection: new Set([draftId]) }));
  return true;
}

/**
 * Opens the finding's drawing and starts its fix command there; true only when the command started. The command is
 * started, not typed: text typed at the command line goes to the command that is running (LINE reads a name as a
 * coordinate), a start cancels it first.
 */
export async function fixFinding(f: Finding, nav: FindingNav): Promise<boolean> {
  const { viewId, fix } = f;
  if (!fix || !viewId || !nav.open(f)) return false;
  if (!(await whenInView(viewId, true))) return false;
  const def = draftCommandByName(fix);
  return def !== undefined && startDraftCommand(def.id);
}
