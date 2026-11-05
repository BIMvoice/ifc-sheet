/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #646: two faces that pass through each other are each painted last where they are the nearer. */

import { describe, expect, it } from 'vitest';
import { depthAt, paintOrder, type PaintItem } from './paint-order.js';

const item = (colour: string, corners: PaintItem['corners'], depths: PaintItem['depths']): PaintItem => ({
  layer: Math.round(((depths[0] + depths[1] + depths[2]) / 3) / 0.01), colour, corners, depths,
});

/** The colour painted last at `p`, and the colour of the nearest face there. */
function lastAndNearest(order: readonly PaintItem[], p: { x: number; y: number }): [string, string] {
  const covers = order.filter((t) => t.corners.every((a, k) => {
    const b = t.corners[(k + 1) % 3];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
  }));
  const nearest = covers.reduce((best, t) => (depthAt(t, p) < depthAt(best, p) ? t : best));
  return [covers[covers.length - 1].colour, nearest.colour];
}

describe('paintOrder with faces that cross (#646)', () => {
  // Both cover (0,0)-(4,0)-(0,4)-ish; `a` is deep at the left and near at the right, `b` the other way round, so they cross at x = 2.
  const a = item('#aa0000', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], [4, 0, 4]);
  const b = item('#0000aa', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], [0, 4, 0]);

  it('paints the nearer face last on both sides of the crossing', () => {
    const order = paintOrder([a, b]);
    expect(order.length).toBeGreaterThan(2);
    for (const p of [{ x: 0.5, y: 0.5 }, { x: 0.3, y: 2 }, { x: 3, y: 0.4 }, { x: 3.4, y: 0.2 }]) {
      const [last, nearest] = lastAndNearest(order, p);
      expect(last, `${p.x},${p.y}`).toBe(nearest);
    }
  });

  it('leaves faces that do not cross whole', () => {
    const far = item('#00aa00', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], [5, 5, 5]);
    expect(paintOrder([a, far]).length).toBe(2);
  });
});
