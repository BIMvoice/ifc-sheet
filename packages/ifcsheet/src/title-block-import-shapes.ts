/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the title block importers share: the error, and the shapes a source gives before they are laid on the block. */

export class TitleBlockImportError extends Error {}

/** A segment or a text in millimetres, y as the source has it. */
export interface RawSegment { x1: number; y1: number; x2: number; y2: number; weightMm: number }
export interface RawText { x: number; y: number; height: number; text: string; align: 'left' | 'center' | 'right'; valign: 'baseline' | 'bottom' | 'middle' | 'top' }
export interface RawShapes { segments: RawSegment[]; texts: RawText[]; notes: string[] }

