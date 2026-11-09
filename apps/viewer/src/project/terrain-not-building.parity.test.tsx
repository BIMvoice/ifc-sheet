/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #683, the app against the engine on a model whose storey contains a terrain block (Bonsai writes it so): a wall 4 m wide,
 * a 20 x 20 x 3 m IfcGeographicElement TERRAIN, a VEGETATION tree and a tree whose VEGETATION is its type object's. The engine
 * leaves the terrain out of the building it cuts. The app does the same in a plan, and in a section or an elevation it keeps
 * the terrain for the ground drawing (`ground.ts`): the earth cut and the ground line, while the building's own cut is the wall
 * and the trees. A model of a terrain alone still draws its plan.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { EARTH_TONE } from './ground';
import type { PlanProjectView, ProjectLevel, ProjectView, SectionProjectView } from './types';

const IFC = new URL('../../../../packages/ifcsheet/test-support/terrain-in-storey.ifc', import.meta.url);

const TERRAIN = 59;

/** The widest the building's cut faces reach along x (the terrain's own cut left out), metres. */
const cutWidth = (d: Drawing2D): number => {
  const xs = d.cutPolygons.filter((p) => p.entityId !== TERRAIN).flatMap((p) => p.polygon.outer.map((pt) => pt.x));
  return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs);
};

describe('a terrain in a storey is not the building for the app or the engine (#683)', () => {
  let l: { geometry: GeometryResult; model: OpenedModel; levels: readonly ProjectLevel[] } | null = null;
  before(async () => {
    const geometry = await meshFile(IFC);
    if (!geometry) return;
    const model = await openModel(new Uint8Array(readFileSync(IFC)));
    const set = generateDefaultSet(model);
    l = { geometry, model, levels: set?.levels ?? [] };
  });

  const section: SectionProjectView = { id: 'sec', name: 'section', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -0.1, flipped: false } };

  it('a section: the building cut is the wall and the trees as the engine\'s, and the terrain is the earth cut (D1)', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const app = await viewDrawing(section, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    const engine = (await generateViewDrawings([section], l.model.buildingMeshes, l.levels, boundsOf(l.geometry)!)).get(section.id);
    assert.ok(app && engine, 'both drew a section');
    // The wall (x 0 to 4) and the tree (x 5.75 to 6.25) are cut: 6.25 m.
    assert.ok(Math.abs(cutWidth(engine) - 6.25) < 0.1, `the engine cut width ${cutWidth(engine)}`);
    assert.ok(Math.abs(cutWidth(app) - 6.25) < 0.1, `the app's building cut width ${cutWidth(app)}`);
    const earth = app.cutPolygons.filter((p) => p.entityId === TERRAIN);
    assert.ok(earth.length > 0, 'the section keeps the ground cut');
    assert.deepEqual(earth[0].color, EARTH_TONE, 'in the earth tone of the ground drawing');
  });

  it('a facade elevation keeps a ground line (D1)', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const view: ProjectView = { id: 'elev', name: 'south', kind: 'elevation', direction: 'south', createdAt: 0 };
    const app = await viewDrawing(view, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    assert.ok(app, 'the app drew an elevation');
    assert.ok(app.lines.some((ln) => ln.entityId === TERRAIN), 'the ground line is drawn');
  });

  it('a plan below the building cuts no terrain, as the engine\'s does not', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const view: PlanProjectView = { id: 'plan', name: 'plan', createdAt: 0, kind: 'plan', level: l.levels[0], cutHeight: -1.5 };
    const app = await viewDrawing(view, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    assert.ok(app, 'the app drew a plan');
    assert.equal(app.cutPolygons.filter((p) => p.entityId === TERRAIN).length, 0, 'no terrain cut');
  });

  it('a model of a terrain alone still draws its plan (D2)', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const alone: GeometryResult = { ...l.geometry, meshes: l.geometry.meshes.filter((m) => m.expressId === TERRAIN) };
    assert.equal(alone.meshes.length, 1, 'the terrain mesh');
    const view: PlanProjectView = { id: 'plan', name: 'plan', createdAt: 0, kind: 'plan', level: l.levels[0], cutHeight: -1.5 };
    const app = await viewDrawing(view, alone, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    assert.ok(app, 'the plan is drawn');
    assert.ok(app.cutPolygons.some((p) => p.entityId === TERRAIN), 'the terrain is what it cuts');
  });
});
