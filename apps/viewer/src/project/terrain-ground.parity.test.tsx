/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #683, one ground drawing for the app and the engine: on the model whose storey contains a terrain block, the engine's
 * section has the earth cut (the terrain's own entity, in the earth tone) and its south elevation the ground line, and both
 * lie where the app's do for the same view, to a millimetre. Before, the engine left the terrain out of every drawing, so the
 * CLI's and the MCP's sections and elevations had no ground while the app showed it.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D, DrawingLine, Point2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { EARTH_TONE, generateDefaultSet, terrainMeshesOf } from '@bimvoice/ifcsheet';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { ProjectLevel, ProjectView, SectionProjectView } from './types';

const IFC = new URL('../../../../packages/ifcsheet/test-support/terrain-in-storey.ifc', import.meta.url);
const TERRAIN = 59;
const MM = 1e-3;

const near = (a: Point2D, b: Point2D) => Math.abs(a.x - b.x) <= MM && Math.abs(a.y - b.y) <= MM;
const order = (a: Point2D, b: Point2D) => a.x - b.x || a.y - b.y;
/** A ring as a start-independent, sorted list of points. */
const points = (ring: readonly Point2D[]) => [...ring].sort(order);
const ends = (l: DrawingLine) => [l.line.start, l.line.end].sort(order);
const segments = (d: Drawing2D) => d.lines.filter((l) => l.entityId === TERRAIN).map(ends).sort((a, b) => order(a[0], b[0]) || order(a[1], b[1]));

describe('the ground in the engine\'s sections and elevations is the app\'s (#683)', () => {
  let l: { geometry: GeometryResult; model: OpenedModel; levels: readonly ProjectLevel[] } | null = null;
  before(async () => {
    const geometry = await meshFile(IFC);
    if (!geometry) return;
    const model = await openModel(new Uint8Array(readFileSync(IFC)));
    l = { geometry, model, levels: generateDefaultSet(model)?.levels ?? [] };
  });

  const engineDrawing = async (view: ProjectView): Promise<Drawing2D | undefined> => {
    const { model, levels } = l!;
    const drawings = await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!, undefined, undefined, null, terrainMeshesOf(model.meshes, model.dataStore));
    return drawings.get(view.id);
  };

  it('a section: the terrain\'s cut in the earth tone, the same polygon as the app\'s', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const view: SectionProjectView = { id: 'sec', name: 'section', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -0.1, flipped: false } };
    const app = await viewDrawing(view, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    const engine = await engineDrawing(view);
    assert.ok(app && engine, 'both drew the section');
    const earth = engine.cutPolygons.filter((p) => p.entityId === TERRAIN);
    const appEarth = app.cutPolygons.filter((p) => p.entityId === TERRAIN);
    assert.ok(earth.length > 0, 'the engine\'s section has the earth cut');
    assert.deepEqual(earth[0].color, EARTH_TONE);
    assert.equal(earth.length, appEarth.length);
    const [a, b] = [points(earth[0].polygon.outer), points(appEarth[0].polygon.outer)];
    assert.equal(a.length, b.length, 'the same corners');
    a.forEach((p, i) => assert.ok(near(p, b[i]), `corner ${i}: ${JSON.stringify(p)} against ${JSON.stringify(b[i])}`));
  });

  it('the south elevation: the ground line, the same segments as the app\'s', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    // The same plane for both: the app frames an elevation on the whole model (the terrain's 20 m), the engine on the building, so their default south planes differ.
    const view: ProjectView = { id: 'elev', name: 'south', kind: 'elevation', direction: 'south', createdAt: 0, planeOffset: l.model.extent!.max.z };
    const app = await viewDrawing(view, l.geometry, l.model.dataStore.spatialHierarchy, undefined, {}, l.model.dataStore);
    const engine = await engineDrawing(view);
    assert.ok(app && engine, 'both drew the elevation');
    const [a, b] = [segments(engine), segments(app)];
    assert.ok(a.length > 0, 'the engine\'s elevation has a ground line');
    assert.equal(a.length, b.length, 'the same number of ground segments ' + JSON.stringify([a, b]));
    a.forEach((s, i) => assert.ok(near(s[0], b[i][0]) && near(s[1], b[i][1]), `segment ${i}: ${JSON.stringify(s)} against ${JSON.stringify(b[i])}`));
  });

  it('the building\'s cut still leaves the terrain out: the engine\'s drawing without terrain has no ground', async (t) => {
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const view: SectionProjectView = { id: 'sec', name: 'section', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -0.1, flipped: false } };
    const bare = (await generateViewDrawings([view], l.model.buildingMeshes, l.levels, l.model.extent!))?.get(view.id);
    assert.ok(bare && bare.cutPolygons.every((p) => p.entityId !== TERRAIN));
  });
});
