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
  /**
   * With {@link TemplateText.top}: the text may wrap to this many lines (at most {@link MAX_CELL_LINES}) before it is shrunk
   * below what two lines hold, see {@link fitCell}. Absent: one line, as {@link fitText}.
   */
  lines?: number;
  /** The highest the tops of the letters may reach, mm from the block's top: just under the caption of the cell. Read with `lines`. */
  top?: number;
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

/** The most lines a cell's value wraps to. */
export const MAX_CELL_LINES = 2;
/** Wrapped lines are this many letter heights apart. */
const LINE_PITCH = 1.1;
/** The height of a capital, as a share of the letter height. */
const CAP_SHARE = 0.72;
/** A wrapped text's last line sits this much lower than the baseline of a single line (the cell has room below it). */
const WRAPPED_DROP = 0.6;
/** A single line is kept while it needs at least this share of the item's own height. */
const ONE_LINE_SHARE = 0.75;
/** The steps the letter height shrinks by while a wrapped text is fitted, mm. */
const SIZE_STEP = 0.1;

/** One printed line of a fitted cell: its words and how far below the item's `y` its baseline sits. */
export interface CellLine { text: string; dy: number }
export interface FittedCell {
  size: number;
  lines: CellLine[];
  /** False when even the smallest height and every line were not enough and the words were cut with an ellipsis. */
  fits: boolean;
}

/** A piece of a value a line may end after: a word, or the part of a hyphenated or slashed one up to and including its "-" or "/". `space`: a blank goes before it. */
interface Piece { text: string; space: boolean }

function pieces(shown: string, breakInWords: boolean): Piece[] {
  const out: Piece[] = [];
  for (const word of shown.split(/\s+/).filter(Boolean)) {
    (breakInWords ? word.split(/(?<=[-/])(?=[^-/])/) : [word]).forEach((text, i) => out.push({ text, space: i === 0 && out.length > 0 }));
  }
  return out;
}

const join = (ps: readonly Piece[]): string => ps.reduce((acc, p, i) => acc + (p.space && i > 0 ? ' ' : '') + p.text, '');

/** The pieces of `shown` set greedily in lines of at most `maxEm` ems; null when a single piece is wider than a line. */
function wrapWords(shown: string, maxEm: number, bold: boolean, breakInWords: boolean): string[] | null {
  const lines: string[] = [];
  let line: Piece[] = [];
  for (const piece of pieces(shown, breakInWords)) {
    if (textWidthEm(join([...line, piece]), bold) <= maxEm) { line.push(piece); continue; }
    if (line.length === 0 || textWidthEm(piece.text, bold) > maxEm) return null;
    lines.push(join(line));
    line = [{ ...piece, space: false }];
  }
  if (line.length > 0) lines.push(join(line));
  return lines;
}

/** `texts` as lines with the baseline offsets they print at, letter height `size`: the last line where a single one sits, the others above it. */
function placed(texts: string[], size: number): CellLine[] {
  const n = texts.length;
  return texts.map((text, i) => ({ text, dy: n === 1 ? 0 : (i - (n - 1)) * LINE_PITCH * size + WRAPPED_DROP }));
}

/**
 * What a cell's value prints as, in this order: one line at the item's own height (shrunk, but not below what a
 * wrapped line would be or a quarter under the item's height); else wrapped to up to {@link MAX_CELL_LINES} lines inside the cell, the height reduced
 * step by step from what the cell's height holds down to {@link TEXT_FIT_MIN}; only when that does not hold it
 * either, the words cut with an ellipsis at the smallest height and `fits` false, so the caller can say so.
 * An item without `lines` and `top` is {@link fitText}. Widths are measured with {@link textWidthEm}, the one
 * measure the app and the PDF share, so they wrap alike.
 */
export function fitCell(item: Pick<TemplateText, 'size' | 'fit' | 'bold' | 'lines' | 'top' | 'y'>, shown: string): FittedCell {
  const single = (): FittedCell => {
    const { size, text } = fitText(item, shown);
    return { size, lines: [{ text, dy: 0 }], fits: text === shown };
  };
  const maxLines = Math.min(item.lines ?? 1, MAX_CELL_LINES);
  if (!item.fit || maxLines < 2 || item.top === undefined) return single();
  const bold = item.bold === true;
  // The tallest letters two lines can have between the caption and the cell's lower edge.
  const wrapCap = Math.min(item.size, (item.y + WRAPPED_DROP - item.top) / (CAP_SHARE + LINE_PITCH));
  if (wrapCap < TEXT_FIT_MIN) return single();
  const oneLine = Math.min(item.size, item.fit / Math.max(textWidthEm(shown, bold), 1e-9));
  // One line, slightly smaller, reads better than two: a value is wrapped once one line would be smaller than two lines can be, or a quarter below the item's height.
  if (oneLine >= Math.min(wrapCap, item.size * ONE_LINE_SHARE)) return { size: oneLine, lines: [{ text: shown, dy: 0 }], fits: true };
  // Between words, shrinking step by step; only when a word alone is wider than the cell at every height, after its "-" or "/" too.
  for (const breakInWords of [false, true]) {
    for (let size = wrapCap; size >= TEXT_FIT_MIN - 1e-9; size = Math.round((size - SIZE_STEP) * 1e6) / 1e6) {
      const lines = wrapWords(shown, item.fit / size, bold, breakInWords);
      if (lines && lines.length <= maxLines) return { size, lines: placed(lines, size), fits: true };
    }
  }
  // Not even the smallest height holds it: the lines as full as they go, the rest of the words cut after the last.
  const size = TEXT_FIT_MIN;
  const em = item.fit / size;
  let rest = pieces(shown, true);
  const out: string[] = [];
  for (let i = 0; i < maxLines && rest.length > 0; i++) {
    let take = 0;
    while (take < rest.length && textWidthEm(join(rest.slice(0, take + 1)), bold) <= em) take++;
    if (i === maxLines - 1 || take === 0 || take === rest.length) {
      out.push(take === rest.length ? join(rest) : truncateToWidth(join(rest), em, bold));
      break;
    }
    out.push(join(rest.slice(0, take)));
    rest = rest.slice(take).map((p, k) => (k === 0 ? { ...p, space: false } : p));
  }
  return { size, lines: placed(out, size), fits: false };
}

/** The longest text an item of the layout holds (the file reader cuts a longer one; an edit refuses it). */
export const MAX_TEXT = 200;

export const ITEM_KINDS = ['line', 'rect', 'text', 'logo'] as const;
