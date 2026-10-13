/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Boxes on a uniform grid, so "which boxes overlap this one" looks at the few
 * boxes near it, not at all of them. Label placement asks that question for
 * every candidate place of every label against every line the plan draws
 * (`drafting/plan-obstacles.ts`): against a flat list that is labels x places
 * x lines. A box that spans many cells (a floor slab's bounds) is kept in a
 * short list every query also reads. Pure.
 */

import { rectsOverlap, type Rect } from './label-geometry';

/** A box spanning more cells than this (per side) is read from the short list instead of every cell it covers. */
const SPAN_LIMIT = 8;

export class RectIndex<T = undefined> {
  private readonly cells = new Map<number, { r: Rect; tag: T; seen: number }[]>();
  private readonly wide: { r: Rect; tag: T; seen: number }[] = [];
  private stamp = 0;

  /** `cell`: the grid step, the size of the boxes asked about (a label) is a good one. */
  constructor(private readonly cell: number) {
    if (!(cell > 0) || !Number.isFinite(cell)) throw new Error('RectIndex needs a positive cell size');
  }

  private key(ix: number, iy: number): number {
    return ix * 4194304 + iy;
  }

  add(r: Rect, tag: T = undefined as T): void {
    const entry = { r, tag, seen: 0 };
    const [x0, y0, x1, y1] = [Math.floor(r.x0 / this.cell), Math.floor(r.y0 / this.cell), Math.floor(r.x1 / this.cell), Math.floor(r.y1 / this.cell)];
    if (x1 - x0 > SPAN_LIMIT || y1 - y0 > SPAN_LIMIT) { this.wide.push(entry); return; }
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const k = this.key(ix, iy);
      const list = this.cells.get(k);
      if (list) list.push(entry); else this.cells.set(k, [entry]);
    }
  }

  /** Calls `visit` for each box overlapping `r` (once each); a visit returning true stops the walk. */
  query(r: Rect, visit: (box: Rect, tag: T) => boolean | void): void {
    const stamp = ++this.stamp;
    const check = (e: { r: Rect; tag: T; seen: number }): boolean => {
      if (e.seen === stamp) return false;
      e.seen = stamp;
      return rectsOverlap(r, e.r) && visit(e.r, e.tag) === true;
    };
    for (const e of this.wide) if (check(e)) return;
    const [x0, y0, x1, y1] = [Math.floor(r.x0 / this.cell), Math.floor(r.y0 / this.cell), Math.floor(r.x1 / this.cell), Math.floor(r.y1 / this.cell)];
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const list = this.cells.get(this.key(ix, iy));
      if (list) for (const e of list) if (check(e)) return;
    }
  }

  /** How many boxes overlap `r`. */
  count(r: Rect): number {
    let n = 0;
    this.query(r, () => { n++; });
    return n;
  }

  any(r: Rect): boolean {
    let hit = false;
    this.query(r, () => (hit = true));
    return hit;
  }
}
