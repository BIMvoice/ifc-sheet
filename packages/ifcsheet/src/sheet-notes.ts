/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The notes a sheet prints on itself (`ProjectSheet.notes`), and where. A set template's rules write one when they had to
 * leave the paper or the scale they asked for (`set-template-apply.ts`); the text is fixed then, in the language of the
 * person who laid the set out. The layout is one function: the app's sheet (SVG) and the engine's (`sheetGraphic`, so the PDF
 * and DXF) both draw these very lines, so the two cannot print different notes or put them in different places.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectSheet } from './document.js';
import { frameOf, frameRect } from './sheet-frame.js';
import { paperOf } from './viewport-fit.js';

/** Text height of a sheet note, paper mm. */
export const SHEET_NOTE_SIZE = 3;
/** Distance between two note baselines, paper mm. */
const LINE_MM = 4.5;
/** Clear space between the frame line and a note, paper mm. */
const INSET_MM = 3;

/** One line of a note, ready to draw: `at` is the left end of the baseline. */
export interface SheetNoteLine {
  at: Point2D;
  text: string;
  size: number;
}

const isRo = (locale: string | undefined): boolean => (locale ?? 'en').toLowerCase().startsWith('ro');

/** "Format A2: the plan does not fit A3 at 1:50." The paper the layout asked for, the paper it moved to, and the scale kept. */
export function steppedUpNote(locale: string | undefined, from: string, to: string, scale: number): string {
  return isRo(locale)
    ? `Format ${to}: desenul nu încape pe ${from} la 1:${scale}.`
    : `Format ${to}: the drawing does not fit ${from} at 1:${scale}.`;
}

/** "Scale 1:75: does not fit A1 at 1:50." */
export function rescaledNote(locale: string | undefined, paper: string, wanted: number, used: number): string {
  return isRo(locale)
    ? `Scara 1:${used}: desenul nu încape pe ${paper} la 1:${wanted}.`
    : `Scale 1:${used}: the drawing does not fit ${paper} at 1:${wanted}.`;
}

/**
 * The note lines of `sheet`, in the frame's bottom-left corner: the last line on the bottom, the others above it. With the
 * title block across the bottom right (the default) that strip of the frame is free of drawings, which stop above the title
 * block; a title block as a strip down the right leaves the corner free as well.
 */
export function sheetNoteLines(sheet: Pick<ProjectSheet, 'notes' | 'paper' | 'orientation' | 'frame'>): SheetNoteLine[] {
  const notes = (sheet.notes ?? []).filter((n) => n.trim() !== '');
  if (notes.length === 0) return [];
  const f = frameRect(paperOf(sheet as ProjectSheet), frameOf(sheet));
  const last = f.y + f.h - INSET_MM;
  return notes.map((text, i) => ({ at: { x: f.x + INSET_MM, y: last - (notes.length - 1 - i) * LINE_MM }, text, size: SHEET_NOTE_SIZE }));
}
