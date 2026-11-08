/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #683, the app against the engine on a section of a model whose storey contains a terrain block (Bonsai writes it so): a
 * wall 4 m wide, a 20 x 20 x 3 m IfcGeographicElement TERRAIN and a VEGETATION tree, all in one storey. The engine leaves the
 * terrain out of the building it cuts; the app cuts every mesh of the model, so its section drew the ground as a block the
 * engine's did not. Both must now cut the wall and the tree, and the terrain in neither.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { ProjectLevel, SectionProjectView } from './types';

const IFC = new URL('../../../../packages/ifcsheet/test-support/terrain-in-storey.ifc', import.meta.url);

/** The widest the cut faces reach along x, metres. */
const cutWidth = (d: Drawing2D): number => {
  const xs = d.cutPolygons.flatMap((p) => p.polygon.outer.map((pt) => pt.x));
  return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs);
};

describe('a terrain in a storey is not cut by the app or the engine (#683)', () => {
  let l: { geometry: GeometryResult; model: OpenedModel; levels: readonly ProjectLevel[] } | null = null;
  before(async () => {
    const geometry = await meshFile(IFC);
    if (!geometry) return;
    const model = await openModel(new Uint8Array(readFileSync(IFC)));
    const set = generateDefaultSet(model);
    l = { geometry, model, levels: set?.levels ?? [] };
  });

  it('a section across the wall', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const b = boundsOf(l.geometry)!;
    const view: SectionProjectView = { id: 'sec', name: 'section', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -0.1, flipped: false } };
    const app = await viewDrawing(view, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    const engine = (await generateViewDrawings([view], l.model.buildingMeshes, l.levels, b)).get(view.id);
    assert.ok(app, 'the app drew a section');
    assert.ok(engine, 'the engine drew a section');
    // The wall (x 0 to 4) and the tree (x 5.75 to 6.25) are cut: 6.25 m. The terrain block would make it 20.
    assert.ok(Math.abs(cutWidth(engine) - 6.25) < 0.1, `the engine cut width ${cutWidth(engine)} is the wall and the tree`);
    assert.ok(Math.abs(cutWidth(app) - 6.25) < 0.1, `the app cut width ${cutWidth(app)} is the wall and the tree, not the terrain block`);
  });
});
