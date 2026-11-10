/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan square to the building, the app against the engine, on the engine's `rotated-site.ifc` (four walls round a
 * 4 x 2 m box in a site turned 48 degrees about Z). The app's real path (`viewDrawing`: `sectionPlaneForView` with the
 * site's rotation, the `useDrawingGeneration` hook) and the engine's (`generateViewDrawings`) both turn the plan by the
 * rotation reduced to a quarter turn (-42 degrees): the walls run along the drawing's axes, and both draw the same cut
 * faces at the same places. A plan saved without `orientation` stays on true north in both, and the app's work plane
 * for drafting on the plan (`viewPlaneConfig`) maps a drawing point to the same world point as the engine's frame.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { drawingToWorld, generateDefaultSet, turnOf, unturnedPoint } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { TYPE_VISIBILITY_SEMANTIC_DEFAULTS } from '@/store/constants';
import { useViewerStore } from '@/store';
import { buildDxfExportTransform } from '@/hooks/dxfExportGeoref';
import { turnAnnotations } from '@/hooks/symbolic-turn';
import { projectScanPoint } from '@/hooks/scanSectionMath';
import { useProjectStore } from './project-store';
import { applyDrawingView } from './open-view';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { PlanProjectView, ProjectLevel } from './types';

const ROTATED = new URL('../../../../packages/ifcsheet/src/__fixtures__/rotated-site.ifc', import.meta.url);
const DEG = Math.PI / 180;

/** The cut faces, each ring's points rounded to 0.1 mm, sorted: where the walls are, whatever order a side makes them in. */
const faces = (d: Drawing2D) => d.cutPolygons
  .map((p) => p.polygon.outer.map((q) => `${Math.round(q.x * 1e4) / 1e4},${Math.round(q.y * 1e4) / 1e4}`).sort().join(' '))
  .sort();

/** The directions, degrees in [0, 180), of every cut edge longer than 5 cm. */
const angles = (d: Drawing2D) => d.cutPolygons.flatMap((p) => p.polygon.outer.flatMap((a, i, r) => {
  const b = r[(i + 1) % r.length];
  return Math.hypot(b.x - a.x, b.y - a.y) < 0.05 ? [] : [(((Math.atan2(b.y - a.y, b.x - a.x) / DEG) % 180) + 180) % 180];
}));
const offStep = (deg: number, step: number) => Math.abs(deg - Math.round(deg / step) * step);

describe('a plan square to a building its site turns 48 degrees, app against engine (rotated-site.ifc)', () => {
  let geometry: GeometryResult | null = null;
  let model: OpenedModel;
  let levels: readonly ProjectLevel[] = [];
  let plan: PlanProjectView;
  before(async () => {
    geometry = await meshFile(ROTATED);
    if (!geometry) return;
    model = await openModel(new Uint8Array(readFileSync(ROTATED)));
    const set = generateDefaultSet(model);
    assert.ok(set, 'a default set');
    levels = set.levels;
    plan = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && !v.site)!;
  });

  async function both(view: PlanProjectView): Promise<{ app: Drawing2D; engine: Drawing2D }> {
    const app = await viewDrawing(view, geometry!, model.dataStore.spatialHierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
    assert.ok(app, 'the app drew nothing');
    const engine = (await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!)).get(view.id);
    assert.ok(engine, 'the engine drew nothing');
    return { app, engine };
  }

  it('both turn a new plan by -42 degrees: the walls along the axes, the same faces in the same places', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    assert.equal(plan.orientation, 'building');
    const { app, engine } = await both(plan);
    assert.ok(app.cutPolygons.length >= 4, 'the four walls are cut');
    for (const a of angles(app)) assert.ok(offStep(a, 90) < 1e-4, `an app edge at ${a} degrees`);
    assert.deepEqual(faces(app), faces(engine));
    assert.ok(Math.abs(((app.config.plane as { turn?: number }).turn ?? 0) + 42 * DEG) < 1e-9, 'the app plane carries the turn');
  });

  it('both keep a plan saved without the field on true north, the walls at 48 degrees', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const { orientation: _left, ...saved } = { ...plan, id: 'saved' };
    const { app, engine } = await both(saved);
    assert.ok(angles(app).some((a) => offStep(a, 90) > 10), 'the walls are not along the axes');
    assert.deepEqual(faces(app), faces(engine));
  });

  it('the app\'s drafting plane on the plan maps a drawing point to the world point the engine\'s frame gives', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const { engine } = await both(plan);
    const { publishDrawingRuntime } = await import('@/lib/drawing/drawing-runtime');
    publishDrawingRuntime({ geometryResult: geometry, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    const { viewPlaneConfig } = await import('./view-plane-config');
    const work = viewPlaneConfig(plan, levels, null);
    assert.ok(work, 'the plan has a work plane');
    const p = { x: 1.25, y: -0.75 };
    const a = drawingToWorld(work, p), b = drawingToWorld(engine.config.plane, p);
    publishDrawingRuntime(null);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-9, `app (${a.x}, ${a.z}) against engine (${b.x}, ${b.z})`);
  });

  it('the Drawing panel\'s live drawing, from the store\'s plane, is the engine\'s turned plan, and what reads it turns back with it', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const { engine } = await both(plan);
    const { publishDrawingRuntime } = await import('@/lib/drawing/drawing-runtime');
    publishDrawingRuntime({ geometryResult: geometry, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    useViewerStore.setState({ geometryResult: geometry });
    useProjectStore.setState({ levels: [...levels] });
    assert.equal(applyDrawingView(plan), true, 'the view points the store\'s plane');
    const store = useViewerStore.getState().sectionPlane;
    publishDrawingRuntime(null);
    assert.ok(Math.abs((store.turn ?? 0) + 42 * DEG) < 1e-9, 'the store\'s plane carries the turn');

    // The panel generates from the store's plane alone.
    const panel = await viewDrawing(plan, geometry, model.dataStore.spatialHierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false },
      { axis: store.axis, position: store.position, flipped: store.flipped, reflected: store.reflected, turn: store.turn });
    assert.ok(panel, 'the panel drew nothing');
    assert.deepEqual(faces(panel), faces(engine));

    // The 3D overlay lifts drawing points on the world's axes: unturned, the panel's cut is the true-north plan's.
    const { orientation: _o, ...saved } = { ...plan, id: 'saved' };
    const north = await viewDrawing(saved, geometry, model.dataStore.spatialHierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
    assert.ok(north);
    const plane = panel.config.plane;
    assert.notEqual(turnOf(plane), 0);
    const ring = (d: Drawing2D, f: (q: { x: number; y: number }) => { x: number; y: number }) => d.cutPolygons
      .map((p) => p.polygon.outer.map((q) => { const r = f(q); return `${Math.round(r.x * 1e4) / 1e4},${Math.round(r.y * 1e4) / 1e4}`; }).sort().join(' ')).sort();
    assert.deepEqual(ring(panel, (q) => unturnedPoint(plane, q)), ring(north, (q) => q));

    // The panel's DXF export takes a drawing point back to the world's axes: the same point the true-north drawing exports.
    const toExport = buildDxfExportTransform({ coordinateInfo: geometry.coordinateInfo, sectionAxis: 'down', isCustomPlane: false, flipped: false, turn: store.turn });
    const toExportNorth = buildDxfExportTransform({ coordinateInfo: geometry.coordinateInfo, sectionAxis: 'down', isCustomPlane: false, flipped: false });
    const exported = (d: Drawing2D, f: (q: { x: number; y: number }) => { x: number; y: number }) => ring(d, (q) => f(q));
    assert.deepEqual(exported(panel, toExport), exported(north, toExportNorth));

    // The IFC annotation overlay is turned into the drawing with the cut, text direction with it.
    const turned = turnAnnotations({ lines: [{ line: { start: { x: 1, y: 0 }, end: { x: 2, y: 0 } }, category: 'annotation' }], texts: [{ x: 1, y: 0, dirX: 1, dirY: 0, height: 0.1, content: 'T', alignment: 'left', ownerId: 1 }], fills: [] }, store.turn ?? 0);
    const asWorld = drawingToWorld(plane, { x: turned.lines[0].line.start.x, y: turned.lines[0].line.start.y });
    const cardinal = drawingToWorld({ ...plane, turn: 0 }, { x: 1, y: 0 });
    assert.ok(Math.hypot(asWorld.x - cardinal.x, asWorld.z - cardinal.z) < 1e-9, 'an annotation point keeps its place in the model');
    assert.ok(Math.abs(Math.atan2(turned.texts[0].dirY, turned.texts[0].dirX) - store.turn!) < 1e-9, 'its text direction turns with it');

    // A scan's points are projected through the same frame as the cut.
    const w = { x: 1.5, y: 0, z: -0.5 };
    const scan = projectScanPoint(w, { axis: 'y', position: 0, flipped: false, turn: store.turn });
    const frame = drawingToWorld(plane, scan);
    assert.ok(Math.hypot(frame.x - w.x, frame.z - w.z) < 1e-9, 'a scan point lands where the cut puts the same world point');
  });
});
