/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One value for a title-block field that is the same on every sheet (project,
 * drawn by, date): it fills the sheets where the field is empty, and it is kept
 * as the project's default so a sheet made later takes it. A sheet that already
 * has its own value keeps it. Pure over the sheets and the defaults.
 */

import type { ProjectSheet } from '@/project/types';
import type { ProjectWideField } from './types';

export interface TitleBlockFill {
  sheets: ProjectSheet[];
  defaults: Record<string, string>;
  /** Sheets that took the value. */
  filled: number;
}

export function fillTitleBlock(sheets: readonly ProjectSheet[], defaults: Readonly<Record<string, string>>, field: ProjectWideField, value: string): TitleBlockFill {
  const v = value.trim();
  if (v === '') return { sheets: [...sheets], defaults: { ...defaults }, filled: 0 };
  let filled = 0;
  const next = sheets.map((s) => {
    if ((s.titleBlock?.[field] ?? '').trim() !== '') return s;
    filled++;
    return { ...s, titleBlock: { ...s.titleBlock, [field]: v } };
  });
  return { sheets: next, defaults: { ...defaults, [field]: v }, filled };
}
