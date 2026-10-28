/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one table engine behind every column schedule (#186): the material
 * takeoff, the room finishes, the quantities by type and the urban indicators.
 * A schedule is a list of items (ruled tables, gaps, text lines); given a
 * `maxHeight` (the viewport's) the lines that do not fit continue on the next
 * page, with each table's header repeated, so a table never runs off the paper
 * and is never shrunk. Without one everything is on one page. A page, once
 * laid out, is what `fit` in `schedule-fit` places, clips and counts.
 */

import type { ScheduleLayout, SchedulePrim } from './schedule-prim.js';

export const ROW = 6;
export const TEXT = 2.5;
export const PAD = 1.5;
export const TITLE_H = 10;
export const PEN = { frame: 0.35, grid: 0.18 } as const;
/** The average width of a character as a fraction of its size: what a text run's width is estimated by (the line wrapping and the tests). */
export const TEXT_EM = 0.55;

/** The width (mm) a run of `text` at `size` is estimated to take. */
export const textWidth = (text: string, size: number): number => [...text].length * size * TEXT_EM;

/** `text` broken at spaces into lines that fit `width` (mm) at `size`; a word longer than a line stays whole. */
function wrapToWidth(text: string, size: number, width: number): string[] {
  const chars = Math.max(1, Math.floor(width / (size * TEXT_EM)));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && [...line].length + 1 + [...word].length > chars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

export interface TableRow {
  cells: readonly string[];
  bold?: boolean;
  /** The pen of the rule under the row; 0 draws none. */
  rule: number;
}

export interface TableBlock {
  columns: readonly number[];
  /** A bold first row repeated at the top of each page the table continues on. */
  header?: readonly string[];
  rows: readonly TableRow[];
  /** Whether column `c` holds figures (right-aligned). */
  numeric: (c: number) => boolean;
  /** Leave a blank cell undrawn. */
  skipEmpty?: boolean;
}

/** A note broken at spaces into lines of about `chars` characters (2 mm text); about 120 fill a line across the table. */
export function wrapNote(note: string, chars = 120): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of note.split(' ')) {
    if (line && line.length + 1 + word.length > chars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export type TableItem =
  | { kind: 'table'; block: TableBlock }
  | { kind: 'gap'; h: number }
  /** A line of text `h` tall whose baseline is `dy` below its top. */
  | { kind: 'text'; h: number; dy: number; size: number; text: string; bold?: boolean };

/**
 * A table's title over `pages` pages: the title alone on one page, else with its page counter, and `continued` (the language's
 * word for it) on every page after the first: "Doors (continued, 2/3)". Without that word the counter alone, as before.
 */
export function pageTitle(title: string, page: number, pages: number, continued?: string): string {
  if (pages <= 1) return title;
  return `${title} (${page > 0 && continued ? `${continued}, ` : ''}${page + 1}/${pages})`;
}

export interface PagedOptions {
  /** The word for "continued" in the user's language, written in the title of every page after the first. */
  continued?: string;
  /** A page holds the lines that fit this height (mm); at least one row is kept per page. Absent: all on one page. */
  maxHeight?: number;
  /** The page to lay out, from 0. */
  page?: number;
  /** Room under the last line (mm) the page reserves. */
  tail?: number;
}

type Line =
  | { kind: 'row'; block: TableBlock; row: TableRow; header: boolean; last: boolean }
  | { kind: 'gap'; h: number }
  | { kind: 'text'; h: number; dy: number; size: number; text: string; bold?: boolean };

const heightOf = (l: Line): number => (l.kind === 'row' ? ROW : l.h);

function flatten(items: readonly TableItem[], width: number): Line[] {
  return items.flatMap((item): Line[] => {
    // A line of text is kept inside the table's width, inset like the cells: a longer one wraps, never runs past the clip.
    if (item.kind === 'text') return wrapToWidth(item.text, item.size, width - 2 * PAD).map((text) => ({ ...item, text }));
    if (item.kind !== 'table') return [item];
    const { block } = item;
    const head: Line[] = block.header ? [{ kind: 'row', block, row: { cells: block.header, bold: true, rule: PEN.frame }, header: true, last: false }] : [];
    return [...head, ...block.rows.map((row, i): Line => ({ kind: 'row', block, row, header: false, last: i === block.rows.length - 1 }))];
  });
}

/** The lines on each page: a table that continues starts its next page with its header again. */
function paginate(lines: readonly Line[], maxHeight: number | undefined, tail: number): Line[][] {
  if (maxHeight === undefined) return [[...lines]];
  const limit = maxHeight - tail;
  const pages: Line[][] = [[]];
  let y = TITLE_H;
  let body = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A header is kept with the row under it.
    const need = line.kind === 'row' && line.header ? ROW * 2 : heightOf(line);
    if (body && line.kind !== 'gap' && y + need > limit) {
      const prev = pages[pages.length - 1];
      const tailRow = prev[prev.length - 1];
      pages.push([]);
      y = TITLE_H;
      body = false;
      // A note is kept with the row above it: that row comes over, with its header, rather than leave the note alone on a page.
      if (line.kind === 'text' && tailRow?.kind === 'row' && !tailRow.header && prev.filter((l) => l.kind === 'row' && !l.header).length > 1) {
        prev.pop();
        const next = pages[pages.length - 1];
        if (tailRow.block.header) { next.push({ kind: 'row', block: tailRow.block, row: { cells: tailRow.block.header, bold: true, rule: PEN.frame }, header: true, last: false }); y += ROW; }
        next.push(tailRow);
        y += ROW;
        body = true;
      }
    }
    const page = pages[pages.length - 1];
    if (!body && line.kind === 'gap') continue;
    if (page.length === 0 && line.kind === 'row' && !line.header && line.block.header) {
      page.push({ kind: 'row', block: line.block, row: { cells: line.block.header, bold: true, rule: PEN.frame }, header: true, last: false });
      y += ROW;
    }
    page.push(line);
    y += heightOf(line);
    if (line.kind !== 'gap' && !(line.kind === 'row' && line.header)) body = true;
  }
  return pages;
}

function widthOf(items: readonly TableItem[]): number {
  return Math.max(0, ...items.flatMap((i) => (i.kind === 'table' ? [i.block.columns.reduce((a, b) => a + b, 0)] : [])));
}

/** The smallest box one page needs: the table's width, and the title, a header, one row and the note that travels with the last (a line that cannot split is never cut). */
export function tableMinBox(items: readonly TableItem[], tail = 0): { width: number; height: number } {
  return { width: widthOf(items), height: TITLE_H + ROW * 2 + Math.max(0, ...items.flatMap((i) => (i.kind === 'text' ? [i.h] : []))) + tail };
}

export function layoutPagedTable(title: string, titleSize: number, items: readonly TableItem[], options: PagedOptions = {}): ScheduleLayout {
  const tail = options.tail ?? 0;
  const width = widthOf(items);
  const pages = paginate(flatten(items, width), options.maxHeight, tail);
  const page = Math.min(Math.max(0, options.page ?? 0), pages.length - 1);
  const lines = pages[page];
  const prims: SchedulePrim[] = [{
    kind: 'text', x: PAD, y: TITLE_H - 3, text: pageTitle(title, page, pages.length, options.continued), size: titleSize, anchor: 'start', bold: true,
  }];
  let y = TITLE_H;
  let segment: { block: TableBlock; top: number } | null = null;
  const close = (bottom: number) => {
    if (!segment) return;
    const lefts = segment.block.columns.map((_, i) => segment!.block.columns.slice(0, i).reduce((a, b) => a + b, 0));
    const right = segment.block.columns.reduce((a, b) => a + b, 0);
    prims.push({ kind: 'line', x1: 0, y1: segment.top, x2: right, y2: segment.top, w: PEN.frame });
    for (const x of [...lefts, right]) prims.push({ kind: 'line', x1: x, y1: segment.top, x2: x, y2: bottom, w: x === 0 || x === right ? PEN.frame : PEN.grid });
    segment = null;
  };
  lines.forEach((line, i) => {
    if (line.kind === 'row') {
      const { block, row } = line;
      if (segment?.block !== block) { close(y); segment = { block, top: y }; }
      const lefts = block.columns.map((_, c) => block.columns.slice(0, c).reduce((a, b) => a + b, 0));
      row.cells.forEach((text, c) => {
        if (block.skipEmpty && !text) return;
        const figure = block.numeric(c);
        prims.push({ kind: 'text', x: figure ? lefts[c] + block.columns[c] - PAD : lefts[c] + PAD, y: y + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: figure ? 'end' : 'start', bold: !!row.bold });
      });
      // The last row on a page that is not the table's last is closed with the frame pen, like the table's own bottom.
      const next = lines[i + 1];
      const cut = !line.last && !(next?.kind === 'row' && next.block === block);
      prims.push({ kind: 'line', x1: 0, y1: y + ROW, x2: block.columns.reduce((a, b) => a + b, 0), y2: y + ROW, w: cut ? Math.max(row.rule, PEN.frame) : row.rule });
      y += ROW;
      return;
    }
    close(y);
    if (line.kind === 'text') prims.push({ kind: 'text', x: PAD, y: y + line.dy, text: line.text, size: line.size, anchor: 'start', bold: line.bold });
    y += line.h;
  });
  close(y);
  return {
    width, height: y + (lines.some((l) => l.kind === 'text') ? tail : 0), prims: prims.filter((p) => p.kind !== 'line' || p.w > 0), pages: pages.length,
    minBox: tableMinBox(items, tail),
  };
}
