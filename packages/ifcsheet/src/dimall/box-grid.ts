/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A uniform grid over boxes, for the "does anything here stand in the way" tests DIMALL makes thousands of times a plan
 * (#829): a test asks only the cells its box covers, not every line and symbol the drawing carries. A drawing of two
 * models carries tens of thousands of lines; scanning all of them for every place a room figure is tried blocked the
 * app for seconds on a small pair and for minutes on a large model.
 *
 * `some` is exact, not approximate: it answers what `items.some(test)` answers for every item whose box overlaps the
 * query box (edges touching count), so a test that can only be true where the boxes meet gives the same result as a
 * scan of the whole list. An item too large for the grid (a long line round the site) is kept in a list every query reads.
 */

import type { Box } from './outline.js';

/** An item covering more cells than this is not put in the grid but read by every query. */
const MAX_CELLS = 256;

export class BoxGrid<T> {
  private readonly cells = new Map<number, T[]>();
  private readonly big: T[] = [];

  constructor(private readonly cell: number) {}

  private span(b: Box): [number, number, number, number] {
    const c = this.cell;
    return [Math.floor(b.x0 / c), Math.floor(b.y0 / c), Math.floor(b.x1 / c), Math.floor(b.y1 / c)];
  }

  /** The cell keys a box covers, packed into one number (cells within ±2^20 of the origin; outside that range an item is `big`). */
  private static key(i: number, j: number): number {
    return (i + 0x100000) * 0x200000 + (j + 0x100000);
  }

  add(box: Box, item: T): void {
    const [i0, j0, i1, j1] = this.span(box);
    const inRange = [i0, j0, i1, j1].every((v) => Number.isFinite(v) && Math.abs(v) < 0x100000);
    if (!inRange || (i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS) {
      this.big.push(item);
      return;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = BoxGrid.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    }
  }

  /** The items whose boxes may meet `box`, each once: every item whose box does, and perhaps some whose box does not. */
  near(box: Box): Set<T> {
    const out = new Set<T>(this.big);
    const [i0, j0, i1, j1] = this.span(box);
    if (!((i1 - i0 + 1) * (j1 - j0 + 1) <= this.cells.size)) {
      for (const list of this.cells.values()) for (const item of list) out.add(item);
      return out;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(BoxGrid.key(i, j));
        if (list) for (const item of list) out.add(item);
      }
    }
    return out;
  }

  /** Whether `test` holds for an item whose box may overlap `box` (an item can be tested more than once). */
  some(box: Box, test: (item: T) => boolean): boolean {
    if (this.big.some(test)) return true;
    const [i0, j0, i1, j1] = this.span(box);
    // A query wider than the grid holds reads the cells it has instead of the ones it covers.
    if (!((i1 - i0 + 1) * (j1 - j0 + 1) <= this.cells.size)) {
      for (const list of this.cells.values()) if (list.some(test)) return true;
      return false;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(BoxGrid.key(i, j));
        if (list && list.some(test)) return true;
      }
    }
    return false;
  }
}
