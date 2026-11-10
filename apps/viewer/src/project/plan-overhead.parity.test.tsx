/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #490, the app against the engine on a plan's overhead range: the app's real path (`viewDrawing`: the
 * `useDrawingGeneration` hook, with the parsed spatial hierarchy) and the engine's sheets (`generateViewDrawings`) draw
 * the same overhead lines, by default (up to the floor above), with a height of the view's own and switched off. Both
 * read the range through `viewOverheadHeight` and `planProjectionBands`.
 *
 * Fixture (`packages/ifcsheet/src/__fixtures__/overhead-plan.ifc`): a ground floor room with a beam at 2.6 m, the first
 * floor's slab at 3.0 m past the room on the east and a roof slab at 6.5 m.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateDefaultSet, storeyFloorsOf } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { TYPE_VISIBILITY_SEMANTIC_DEFAULTS } from '@/store/constants';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { PlanProjectView, ProjectLevel } from './types';

const FIXTURE = new URL('../../../../packages/ifcsheet/src/__fixtures__/overhead-plan.ifc', import.meta.url);

const counts = (d: Drawing2D) => ({
  lines: d.lines.length,
  cut: d.lines.filter((l) => l.category === 'cut').length,
  overhead: d.lines.filter((l) => l.category === 'projection' && l.visibility === 'hidden').length,
  beam: d.lines.filter((l) => l.ifcType === 'IfcBeam').length,
  slab: d.lines.filter((l) => l.ifcType === 'IfcSlab').length,
  cutPolygons: d.cutPolygons.length,
});

describe('a plan\'s overhead range, app against engine (#490)', () => {
  let geometry: GeometryResult | null = null;
  let model: OpenedModel;
  let levels: readonly ProjectLevel[] = [];
  let plans: PlanProjectView[] = [];
  before(async () => {
    geometry = await meshFile(FIXTURE);
    if (!geometry) return;
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model);
    assert.ok(set, 'a default set');
    levels = set.levels;
    plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
  });

  async function both(view: PlanProjectView) {
    const hierarchy = model.dataStore.spatialHierarchy;
    const app = await viewDrawing(view, geometry!, hierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
    assert.ok(app, 'the app drew nothing');
    const floors = storeyFloorsOf(model.buildingMeshes, hierarchy);
    const engine = (await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!, undefined, undefined, floors)).get(view.id);
    assert.ok(engine, 'the engine drew nothing');
    return { app: counts(app), engine: counts(engine) };
  }
  const named = (name: string, overheadHeight?: number | null): PlanProjectView => {
    const v = plans.find((p) => p.name === name);
    assert.ok(v, `the plan ${name}`);
    return { ...v, id: `${name}-${overheadHeight}`, ...(overheadHeight === undefined ? {} : { overheadHeight }) };
  };

  const ROWS: [string, () => PlanProjectView, (c: ReturnType<typeof counts>) => void][] = [
    ['the ground plan, by default: the beam and the slab edge dashed', () => named('Ground floor'), (c) => { assert.ok(c.beam >= 4, 'the beam'); assert.ok(c.slab >= 4, 'the slab edge'); assert.equal(c.overhead, c.beam + c.slab, 'all of it overhead'); }],
    ['the ground plan, switched off: nothing overhead', () => named('Ground floor', 0), (c) => { assert.equal(c.overhead, 0); assert.equal(c.beam + c.slab, 0); assert.ok(c.cut > 0, 'the walls are still cut'); }],
    ['the ground plan, 1.5 m: the beam, not the slab', () => named('Ground floor', 1.5), (c) => { assert.ok(c.beam >= 4, 'the beam'); assert.equal(c.slab, 0, 'no slab'); }],
    ['the first-floor plan: the roof dashed', () => named('First floor'), (c) => { assert.ok(c.overhead >= 4, 'the roof'); }],
  ];
  for (const [name, view, expectOf] of ROWS) {
    it(name, async (t) => {
      if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
      const { app, engine } = await both(view());
      expectOf(app);
      assert.deepEqual(engine, app);
    });
  }
});
