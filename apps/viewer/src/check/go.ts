/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Click-to-go for a finding: open the sheet or the view, select the annotation; and run the one-action fix on the view. */

import { draftCommandByName } from '@/drafting/commands/registry';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import { activateDocumentTab } from '@/project/open-view';
import { useViewDrawings } from '@/project/view-drawings';
import type { Finding } from './types';

/** Opens the place a finding is about: its view, else its sheet. Returns false when there is nothing to open. */
export function goTo(f: Finding): boolean {
  const id = f.viewId ?? f.sheetId;
  if (!id || activateDocumentTab(id) === 'missing') return false;
  if (f.draftId) useDraftingSession.setState({ selection: new Set([f.draftId]) });
  return true;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Opens the finding's view, waits until it is drawn and in front, and runs the finding's fix command there. */
export async function runFix(f: Finding): Promise<boolean> {
  if (!f.fix || !f.viewId || activateDocumentTab(f.viewId) === 'missing') return false;
  for (let i = 0; i < 80; i++) {
    const ready = useViewDrawings.getState().byView[f.viewId]?.status === 'ready';
    if (ready && useDraftingSession.getState().viewId === f.viewId) {
      await wait(500);
      // Started, not typed: a typed name is read by the running command (LINE takes it as a coordinate), a start cancels it first.
      const def = draftCommandByName(f.fix);
      return def !== undefined && startDraftCommand(def.id);
    }
    await wait(250);
  }
  return false;
}
