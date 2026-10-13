/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the app offers the planner: its papers, scales, frame and title block. */

import { FRAME_MARGIN_MM, PAPER_MM, SHEET_SCALES, TITLE_BLOCK_MM } from '@/project/sheets';
import type { PaperSize } from '@/project/types';
import type { SheetSpec } from './types';

export function appSheetSpec(): SheetSpec {
  const papers = (Object.keys(PAPER_MM) as PaperSize[])
    .map((name) => ({ name, ...PAPER_MM[name] }))
    .sort((a, b) => a.w * a.h - b.w * b.h);
  return { papers, scales: SHEET_SCALES, frameMarginMm: FRAME_MARGIN_MM, titleBlockMm: TITLE_BLOCK_MM, viewportMarginMm: 10 };
}
