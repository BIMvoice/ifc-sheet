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
const drawing = (viewId: string) => useViewDrawings.getState().byView[viewId]?.status;

/** How a wait for a view ended: ready, the drawing failed (it will not become ready), or time ran out. */
export type ViewWait = 'ready' | 'error' | 'timeout';

/**
 * Resolves `ready` once the session is on `viewId` (and, with `drawn`, its drawing is made and the view has
 * settled), `error` as soon as the drawing fails, `timeout` after `WAIT_MS`.
 */
export async function waitForView(viewId: string, drawn: boolean): Promise<ViewWait> {
  for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
    if (drawn && drawing(viewId) === 'error') return 'error';
    if (attached(viewId) && (!drawn || drawing(viewId) === 'ready')) {
      if (!drawn) return 'ready';
      await sleep(SETTLE_MS);
      return attached(viewId) ? 'ready' : 'timeout';
    }
    await sleep(POLL_MS);
  }
  return 'timeout';
}

/** True once the session is on `viewId` (and, with `drawn`, its drawing is made); false when the drawing failed or time ran out. */
export async function whenInView(viewId: string, drawn: boolean): Promise<boolean> {
  return (await waitForView(viewId, drawn)) === 'ready';
}

/** Opens the place a finding is about and selects its annotation. False when there is nothing to open. */
export function goToFinding(f: Finding, nav: FindingNav): boolean {
  if (!nav.open(f)) return false;
  const { viewId, draftId } = f;
  if (viewId && !draftId && f.guids?.length) requestFocus(viewId, f.guids);
  if (viewId && draftId) void whenInView(viewId, false).then((ok) => ok && useDraftingSession.setState({ selection: new Set([draftId]) }));
  return true;
}

/** What came of a fix: done, or why not (each has its message, `check.fix.<outcome>`). */
export type FixOutcome = 'done' | 'noFix' | 'noPlace' | 'drawingFailed' | 'drawingLate' | 'notStarted';

/**
 * Opens the finding's drawing and starts its fix command there. The command is started, not typed: text typed at the
 * command line goes to the command that is running (LINE reads a name as a coordinate), a start cancels it first.
 */
export async function fixOutcome(f: Finding, nav: FindingNav): Promise<FixOutcome> {
  const { viewId, fix } = f;
  if (!fix || !viewId) return 'noFix';
  if (!nav.open(f)) return 'noPlace';
  const waited = await waitForView(viewId, true);
  if (waited !== 'ready') return waited === 'error' ? 'drawingFailed' : 'drawingLate';
  const def = draftCommandByName(fix);
  return def !== undefined && startDraftCommand(def.id) ? 'done' : 'notStarted';
}

/** True only when the fix command started. */
export async function fixFinding(f: Finding, nav: FindingNav): Promise<boolean> {
  return (await fixOutcome(f, nav)) === 'done';
}
