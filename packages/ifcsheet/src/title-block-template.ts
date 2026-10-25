/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's layout as data (#143): lines, rectangles, text and the
 * logo's frame, in millimetres from the block's top-left corner. Text reads
 * the sheet's parameters by `{Name}`. The app builds the standard and the
 * Romanian layouts and edits them; the project keeps the edited one
 * (`ProjectDocument.titleBlockTemplate`), and the app's sheet and this
 * package's PDF and DXF both print it (`title-block-print.ts`).
 */

import { textWidthEm, truncateToWidth } from './text-width.js';

interface ItemBase {
  id: string;
}
export interface TemplateLine extends ItemBase { kind: 'line'; x1: number; y1: number; x2: number; y2: number; weight: number }
export interface TemplateRect extends ItemBase { kind: 'rect'; x: number; y: number; w: number; h: number; weight: number }
export interface TemplateText extends ItemBase {
  kind: 'text'; x: number; y: number;
  /** Letter height, mm. */
  size: number;
  /** Words and `{Name}` parameters. */
  text: string;
  bold?: boolean;
  /** Drawn in the grey of a caption rather than black. */
  muted?: boolean;
  /** Shrunk so the printed text is at most this wide (mm), down to {@link TEXT_FIT_MIN}. */
  fit?: number;
}
export interface TemplateLogo extends ItemBase { kind: 'logo'; x: number; y: number; w: number; h: number }
export type TemplateItem = TemplateLine | TemplateRect | TemplateText | TemplateLogo;

export interface TitleBlockTemplate {
  items: TemplateItem[];
}

/** The smallest letter height a fitted text shrinks to, mm: the graphic standard's smallest caption. */
export const TEXT_FIT_MIN = 2;

/**
 * What a text prints as: its own height and words, or, with `fit`, a height
 * smaller (down to {@link TEXT_FIT_MIN}) so the measured width (`textWidthEm`)
 * is at most `fit` millimetres and, only when even the smallest height is too
 * wide, the words cut short with an ellipsis. Never wider than `fit`.
 */
export function fitText(item: Pick<TemplateText, 'size' | 'fit' | 'bold'>, shown: string): { size: number; text: string } {
  if (!item.fit) return { size: item.size, text: shown };
  const em = textWidthEm(shown, item.bold);
  const size = Math.min(item.size, item.fit / Math.max(em, 1e-9));
  if (size >= TEXT_FIT_MIN) return { size, text: shown };
  return { size: TEXT_FIT_MIN, text: truncateToWidth(shown, item.fit / TEXT_FIT_MIN, item.bold) };
}

export const ITEM_KINDS = ['line', 'rect', 'text', 'logo'] as const;
