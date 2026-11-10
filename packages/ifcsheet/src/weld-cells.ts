/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The weld grid's cells (`measured-quantities.ts`): a map from a cell's three
 * whole numbers to a point id, as a `Map` keyed by "i,j,k" is, without making a
 * string for each of the 27 cells a new point looks in (#611). Open addressing;
 * a slot matches only on all three numbers, so two cells never share an entry.
 */
export class WeldCells {
  private cap = 64;
  private size = 0;
  /** Three per slot. */
  private cell = new Float64Array(this.cap * 3);
  /** The id plus one per slot; 0 is an empty slot. */
  private ids = new Int32Array(this.cap);

  private slot(i: number, j: number, k: number): number {
    const mask = this.cap - 1, cell = this.cell, ids = this.ids;
    let h = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & mask;
    while (ids[h] !== 0 && !(cell[h * 3] === i && cell[h * 3 + 1] === j && cell[h * 3 + 2] === k)) h = (h + 1) & mask;
    return h;
  }

  /** The id in this cell, or undefined. */
  get(i: number, j: number, k: number): number | undefined {
    const v = this.ids[this.slot(i, j, k)];
    return v === 0 ? undefined : v - 1;
  }

  set(i: number, j: number, k: number, id: number): void {
    if ((this.size + 1) * 2 > this.cap) this.grow();
    const h = this.slot(i, j, k);
    if (this.ids[h] === 0) this.size++;
    this.cell[h * 3] = i;
    this.cell[h * 3 + 1] = j;
    this.cell[h * 3 + 2] = k;
    this.ids[h] = id + 1;
  }

  private grow(): void {
    const { cap, cell, ids } = this;
    this.cap = cap * 2;
    this.cell = new Float64Array(this.cap * 3);
    this.ids = new Int32Array(this.cap);
    for (let h = 0; h < cap; h++) {
      if (ids[h] === 0) continue;
      const to = this.slot(cell[h * 3], cell[h * 3 + 1], cell[h * 3 + 2]);
      this.cell[to * 3] = cell[h * 3];
      this.cell[to * 3 + 1] = cell[h * 3 + 1];
      this.cell[to * 3 + 2] = cell[h * 3 + 2];
      this.ids[to] = ids[h];
    }
  }
}
