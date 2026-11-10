/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557: the ground an elevation or a section draws (the ground line, the earth block) lies inside the viewport's frame, so
 * nothing of it is cut by the box the sheet clips to. The app frames on all its geometry; the engine framed on the building.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { viewCentre, viewExtent } from './drawing-set.js';
import { placer } from './sheet-graphic.js';
import { EARTH_TONE } from './ground.js';
import { terrainMeshesOf } from './view-drawings.js';

const IFC = fileURLToPath(new URL('../test-support/terrain-in-storey.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(IFC) ? 'terrain-in-storey.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the ground frame test: ${missing}`);

describe.skipIf(missing !== null)('the ground inside the viewport frame of terrain-in-storey (#557)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(IFC)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    const terrain = terrainMeshesOf(model.meshes, model.dataStore);
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!, undefined, undefined, null, terrain);
  }, 300_000);

  it('every ground line and earth polygon of each elevation and section is inside its frame', () => {
    const tol = 0.01; // paper mm
    let checked = 0;
    let groundShapes = 0;
    for (const sheet of set.document.sheets) {
      for (const vp of sheet.viewports ?? []) {
        const view = set.document.views.find((v) => v.id === vp.viewId);
        const drawing = drawings.get(vp.viewId);
        if (!view || !drawing || (view.kind !== 'elevation' && view.kind !== 'section') || (view.kind === 'elevation' && view.interior)) continue;
        const size = viewExtent(view, model.extent!);
        const k = 1000 / vp.scale;
        const box = { x0: vp.x - (size.w * k) / 2, x1: vp.x + (size.w * k) / 2, y0: vp.y - (size.h * k) / 2, y1: vp.y + (size.h * k) / 2 };
        const at = placer(drawing, vp, viewCentre(view, model.extent!));
        const points = [
          ...drawing.lines.filter((l) => l.ifcType.toUpperCase() === 'IFCSITE' || l.ifcType.toUpperCase() === 'IFCGEOGRAPHICELEMENT').flatMap((l) => [l.line.start, l.line.end]),
          ...drawing.cutPolygons.filter((p) => p.color?.every((c, i) => c === EARTH_TONE[i])).flatMap((p) => p.polygon.outer),
        ];
        groundShapes += points.length;
        for (const p of points) {
          const q = at(p);
          expect(q.x, `${view.name} x`).toBeGreaterThanOrEqual(box.x0 - tol);
          expect(q.x, `${view.name} x`).toBeLessThanOrEqual(box.x1 + tol);
          expect(q.y, `${view.name} y`).toBeGreaterThanOrEqual(box.y0 - tol);
          expect(q.y, `${view.name} y`).toBeLessThanOrEqual(box.y1 + tol);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
    expect(groundShapes).toBeGreaterThan(0);
  });
});
