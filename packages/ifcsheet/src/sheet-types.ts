/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Types of a sheet's paper, frame and templates (re-exported by `document.ts`). */

import type { PaperSize } from './document.js';

/** An elongated ISO 5457 format: `base` with its long side extended by `factor` (A3×3 is 420 × 891 mm). Only the sizes ISO 5457 lists exist (`paper.ts`). */
export interface ElongatedPaper {
  kind: 'elongated';
  base: PaperSize;
  factor: number;
}

/** Any sheet size in millimetres (`paper.ts` bounds it). */
export interface CustomPaper {
  kind: 'custom';
  widthMm: number;
  heightMm: number;
}

/**
 * The paper of a sheet: a plain ISO A-series name (`'A1'`, which is also what
 * every project file saved before elongated and custom sizes holds), an
 * elongated format or a custom size. The orientation decides which side is the width.
 */
export type Paper = PaperSize | ElongatedPaper | CustomPaper;

/** Where a sheet's title block sits: the bottom-right corner (180 × 50 mm, reading across), or a strip down the right (50 × 180 mm, reading upwards). */
export type TitleBlockPosition = 'bottom-right' | 'right';

/** The frame of a sheet: the margins between the paper edge and the frame line, mm, and where the title block sits inside it. */
export interface SheetFrame {
  margins: { top: number; right: number; bottom: number; left: number };
  titleBlock: TitleBlockPosition;
}

/** The series of sheets a template can be the start of: the starting set's groups, and details. */
export type TemplateSeries = 'plans' | 'elevations' | 'sections' | 'interiors' | 'schedules' | 'details';

/** What a new sheet starts from: its paper, orientation, frame margins and title block position. */
export interface SheetTemplate {
  id: string;
  name: string;
  paper: Paper;
  orientation: 'landscape' | 'portrait';
  frame: SheetFrame;
}
