/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Types of a sheet's paper, frame and templates (re-exported by `types.ts`). */

import type { PaperSize } from './types';

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
export type TemplateSeries = 'plans' | 'elevations' | 'sections' | 'schedules' | 'details';

/** What a new sheet starts from: its paper, orientation, frame margins and title block position. */
export interface SheetTemplate {
  id: string;
  name: string;
  paper: Paper;
  orientation: 'landscape' | 'portrait';
  frame: SheetFrame;
}

/** The groups of sheets a numbering scheme numbers apart: `other` is details and whatever fits no series. */
export type NumberGroup = 'general' | 'plans' | 'elevations' | 'sections' | 'interiors' | 'details' | 'schedules' | 'other';

/** How one group's numbers are written: `<discipline><prefix><separator><n padded to digits>`, `n` running from `start` by `step`. */
export interface GroupPattern {
  prefix: string;
  separator: string;
  start: number;
  digits: number;
  step: number;
}

/** The project's sheet numbering (`numbering.ts`). */
export interface NumberingScheme {
  /** Printed first on every number: `A` for architecture. */
  discipline: string;
  /** One running sequence through the whole set (A01, A02, …) instead of one per group; the plans pattern then numbers every sheet. */
  continuous: boolean;
  groups: Record<NumberGroup, GroupPattern>;
}
