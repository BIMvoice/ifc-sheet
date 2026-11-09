/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557: Section A-A of AC20-FZK-Haus looks into the spiral stair. The handrail of the gallery railing (IfcRailing 49831)
 * and the stair's centre column (in IfcStair 14502) are tubes: their outline runs along smooth mesh edges, which the
 * section's silhouette left out, and what was left of the column was hidden by the column itself. The section showed
 * three loose railing posts and floating treads, with no handrail and no column.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { generateDefaultSet } from './index.js';
import { generateViewDrawings, openModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus stair section test: ${missing}`);

const RAILING = 49831;
const STAIR = 14502;

const length = (l: DrawingLine) => Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y);
/** Whether (x, y) is inside the ring (even-odd). */
const inside = (ring: readonly { x: number; y: number }[], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if ((a.y > y) !== (b.y > y) && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) hit = !hit;
  }
  return hit;
};
const visibleOf = (d: Drawing2D, id: number) => d.lines.filter((l) => l.entityId === id && l.visibility === 'visible');

describe.skipIf(missing !== null)('the spiral stair in Section A-A of AC20-FZK-Haus (#557)', () => {
  let sectionA: Drawing2D;

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, { now: Date.UTC(2026, 10, 8) });
    if (!set) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v) => v.kind === 'section' && v.name === 'Section A-A');
    if (!view) throw new Error('no Section A-A in the default set');
    const drawings = await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent!);
    sectionA = drawings.get(view.id)!;
  }, 300_000);

  it('draws the gallery railing handrail along its whole 2 m length', () => {
    const horizontal = visibleOf(sectionA, RAILING).filter((l) => Math.abs(l.line.end.y - l.line.start.y) < 1e-3);
    expect(Math.max(0, ...horizontal.map(length))).toBeGreaterThan(1.9);
  });

  it('draws the stair column from the floor to its top, not hidden by itself', () => {
    const vertical = visibleOf(sectionA, STAIR).filter((l) => Math.abs(l.line.end.x - l.line.start.x) < 1e-3);
    // One side of the column, its pieces bottom to top. The upper floor slab is cut solid in front of the column (#749: a cut
    // face hides what lies behind it), so the column is broken there and only there: every gap lies inside a cut slab.
    const xs = [...new Set(vertical.map((l) => Math.round(l.line.start.x * 1000)))];
    const sides = xs.map((x) => vertical.filter((l) => Math.round(l.line.start.x * 1000) === x)
      .map((l) => [Math.min(l.line.start.y, l.line.end.y), Math.max(l.line.start.y, l.line.end.y)]).sort((a, b) => a[0] - b[0]));
    const drawn = (pieces: number[][]) => pieces.reduce((sum, [lo, hi]) => sum + hi - lo, 0);
    const side = sides.reduce((a, b) => (drawn(b) > drawn(a) ? b : a), [] as number[][]);
    expect(drawn(side)).toBeGreaterThan(3);
    const x = xs[sides.indexOf(side)] / 1000;
    for (let k = 1; k < side.length; k++) {
      const y = (side[k - 1][1] + side[k][0]) / 2;
      expect(side[k][0] - side[k - 1][1]).toBeLessThan(0.5);
      expect(sectionA.cutPolygons.some((q) => q.ifcType === 'IfcSlab' && inside(q.polygon.outer, x, y)), `the gap at y ${y.toFixed(2)} lies inside a cut slab`).toBe(true);
    }
  });
});
