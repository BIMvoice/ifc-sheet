/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Going to a finding and fixing it from the Wall: step into the sheet that
 * holds its drawing and bring the drawing forward (the Wall has no tabs), then
 * select the annotation it is about, or run the one-action command that fixes it.
 */

import { draftCommandByName } from '@/drafting/commands/registry';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { Finding } from '@/check/types';
import { useProjectStore } from '@/project/project-store';
import { sheetsShowing } from '@/project/sheets';
import { stepInto } from './wall-nav';

/** The sheet a finding is on: its own, else the first that shows its drawing. */
function sheetOf(f: Finding): string | null {
  const { sheets } = useProjectStore.getState();
  if (f.sheetId && sheets.some((s) => s.id === f.sheetId)) return f.sheetId;
  return f.viewId ? sheetsShowing(f.viewId)[0]?.id ?? null : null;
}

/** Resolves once the drafting session is on `viewId` (its drawing is in front), or false after `ms`. */
function whenAttached(viewId: string, ms = 20_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (useDraftingSession.getState().viewId === viewId) return resolve(true);
    const timer = setTimeout(() => { unsubscribe(); resolve(false); }, ms);
    const unsubscribe = useDraftingSession.subscribe((s) => {
      if (s.viewId !== viewId) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

/** Step to the place a finding is about. False when there is nothing to open. */
export function goToFinding(f: Finding): boolean {
  const sheet = sheetOf(f);
  if (!sheet) return false;
  stepInto(sheet, f.viewId ?? null);
  const { viewId, draftId } = f;
  if (viewId && draftId) void whenAttached(viewId).then((ok) => ok && useDraftingSession.setState({ selection: new Set([draftId]) }));
  return true;
}

/** Open the finding's drawing and run its fix command there. */
export async function fixFinding(f: Finding): Promise<boolean> {
  const { viewId, fix } = f;
  if (!fix || !viewId || !goToFinding({ ...f, draftId: undefined })) return false;
  if (!(await whenAttached(viewId))) return false;
  // Started, not typed: a typed name is read by the running command (LINE takes it as a coordinate), a start cancels it first.
  const def = draftCommandByName(fix);
  return def !== undefined && startDraftCommand(def.id);
}
