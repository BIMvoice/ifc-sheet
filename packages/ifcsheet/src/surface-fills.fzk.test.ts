/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #499: an elevation of AC20-FZK-Haus in the coloured style shows the colours of the facade's materials, under the linework; the
 * plain style is unchanged, and the switch off takes the fills away again. #646: at every point of the elevation the colour painted
 * last is the colour of the face nearest the viewer.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { sheetGraphics } from './set-sheets.js';
import { depthAt } from './paint-order.js';
import { paintedSurfaces, surfaceFills, type PaintedSurface } from './surface-fills.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus coloured-surfaces test: ${missing}`);

/** The colour the model authors for a class, `#rrggbb`, read from the meshes by their own channels (not through `surfaceColourOf`). */
const authored = (model: OpenedModel, ifcType: string): string[] => [...new Set(model.buildingMeshes.filter((m) => m.ifcType === ifcType && m.color[3] >= 0.999)
  .map((m) => `#${[0, 1, 2].map((i) => Math.round(m.color[i] * 255).toString(16).padStart(2, '0')).join('')}`))];

/**
 * The points of a grid (`step` metres) over the drawing where the triangle painted last is not the colour of the nearest triangle there
 * (by more than `tolerance` metres): what a viewer sees wrong in the painter's order (#646).
 */
function misPainted(painted: readonly PaintedSurface[], step: number, tolerance: number): { points: number; wrong: number } {
  const CELL = 0.5;
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  painted.forEach((t, n) => {
    const xs = t.corners.map((p) => p.x);
    const ys = t.corners.map((p) => p.y);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++) {
        const list = cells.get(key(i, j)) ?? [];
        list.push(n);
        cells.set(key(i, j), list);
      }
  });
  const inside = (t: PaintedSurface, p: { x: number; y: number }) => t.corners.every((a, k) => {
    const b = t.corners[(k + 1) % 3];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
  });
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of painted.flatMap((t) => t.corners)) [x0, x1, y0, y1] = [Math.min(x0, p.x), Math.max(x1, p.x), Math.min(y0, p.y), Math.max(y1, p.y)];
  let points = 0;
  let wrong = 0;
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let y = y0 + step / 2; y < y1; y += step) {
      const p = { x, y };
      let top = -1;
      let near = -1;
      for (const n of cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
        if (!inside(painted[n], p)) continue;
        top = Math.max(top, n);
        if (near < 0 || depthAt(painted[n], p) < depthAt(painted[near], p)) near = n;
      }
      if (top < 0) continue;
      points++;
      if (painted[top].colour !== painted[near].colour && depthAt(painted[top], p) - depthAt(painted[near], p) > tolerance) wrong++;
    }
  return { points, wrong };
}

describe.skipIf(missing !== null)('the coloured elevations of AC20-FZK-Haus (#499)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 27) })!;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!);
  }, 300_000);

  const south = () => set.document.views.find((v) => v.kind === 'elevation' && v.direction === 'south')!;
  const coloured = (on: boolean): DefaultSet => ({ ...set, document: { ...set.document, views: set.document.views.map((v) => (v.id === south().id ? { ...v, graphics: { ...v.graphics, colouredSurfaces: on } } : v)) } });

  it('the south elevation shows the colours of the facade materials', () => {
    const fills = surfaceFills(model.buildingMeshes, drawings.get(south().id)!.config);
    expect(fills.length).toBeGreaterThan(0);
    const shown = new Set(fills.map((f) => f.surfaceColour));
    const wall = authored(model, 'IfcWallStandardCase');
    expect(wall).toHaveLength(1);
    expect(shown.has(wall[0])).toBe(true);
    // The windows' frames and the roof beams are on the facade too.
    expect(authored(model, 'IfcWindow').length).toBeGreaterThan(0);
    for (const colour of authored(model, 'IfcWindow')) expect(shown.has(colour), colour).toBe(true);
  });

  it('the sheet carries the fills in the coloured style, and none in the plain style or with the switch off', async () => {
    const wall = authored(model, 'IfcWallStandardCase')[0];
    const on = await sheetGraphics(coloured(true), model);
    const sheetOf = (sheets: typeof on) => sheets.find((s) => s.viewports.some((v) => v.viewId === south().id))!;
    expect(sheetOf(on).fills.some((f) => f.colour === wall)).toBe(true);
    const off = await sheetGraphics(coloured(false), model);
    expect(sheetOf(off).fills).toHaveLength(0);
    const plain = await sheetGraphics(set, model);
    expect(sheetOf(plain).fills).toHaveLength(0);
    expect(sheetOf(plain).lines).toEqual(sheetOf(on).lines);
    expect(sheetOf(plain).pens).toEqual(sheetOf(on).pens);
  });

  it('paints the face nearest the viewer last at every point of each elevation (#646)', () => {
    for (const view of set.document.views.filter((v) => v.kind === 'elevation')) {
      // Faces closer than a layer (1 cm) are ordered by colour inside it on purpose (the runs of one colour), so the check allows 1.5 cm.
      const { points, wrong } = misPainted(paintedSurfaces(model.buildingMeshes, drawings.get(view.id)!.config), 0.05, 0.015);
      expect(points, view.name).toBeGreaterThan(1000);
      expect(wrong, view.name).toBe(0);
    }
  });
});
