/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How the Wall opens the place a finding is about: step into the sheet that
 * holds its drawing and bring the drawing forward (the Wall has no tabs). Going
 * there and fixing are `check/go.ts`, the same as on the sheet panel.
 */

import type { FindingNav } from '@/check/go';
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

export const wallNav: FindingNav = {
  open(f) {
    const sheet = sheetOf(f);
    if (!sheet) return false;
    stepInto(sheet, f.viewId ?? null);
    return true;
  },
};
