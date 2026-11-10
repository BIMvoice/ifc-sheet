/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The host-wall rule (#586), app against engine, on a small hand-written model (`packages/ifcsheet/src/__fixtures__/host-wall-window.ifc`):
 * Level 0 (cut 1.2 m) holds a 3 m wall with a window in it over 1.5 to 2.1 m (hosted through an opening), and a window of the same
 * height standing free. The app (`viewOpeningSymbols` over the loaded meshes) and the engine (`planOpeningSymbols` over `openModel`'s)
 * must draw the hosted window, and neither the unhosted one. The engine's own test is `packages/ifcsheet/src/opening-hosts.test.ts`.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDefaultSet, planOpeningSymbols, type PlanProjectView, type ProjectLevel } from '@bimvoice/ifcsheet';
import { openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewOpeningSymbols } from './view-symbols';

const FIXTURE = fileURLToPath(new URL('../../../../packages/ifcsheet/src/__fixtures__/host-wall-window.ifc', import.meta.url));
const HOSTED = 75, FREE = 83;

describe('the app and the engine draw a window in a wall the plan cuts, and not a free one above the cut (#586)', { skip: planModelMissing(FIXTURE) }, () => {
  let engine: OpenedModel;
  let plane: SectionPlaneConfig;
  let level: ProjectLevel;

  before(async () => {
    resetProject();
    await loadPlanModel(FIXTURE);
    engine = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    const view = set.document.views.find((v) => v.kind === 'plan' && v.name === 'Level 0');
    assert.ok(view, 'a plan for Level 0');
    plane = sectionConfigFor(view, set.levels, engine.extent)!.plane;
    level = (view as PlanProjectView).level;
  });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = () => viewOpeningSymbols(appMeshes(), plane, useProjectStore.getState().symbolFlips, new Set(), 'fine', level);
  const eng = () => {
    const { joineryTypes, joineryMapping, symbolFlips } = useProjectStore.getState();
    return planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips } }, undefined, level);
  };
  const shapes = (list: ReturnType<typeof app>) => JSON.parse(JSON.stringify([...list].sort((a, b) => a.id - b.id), (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));

  it('the hosted window is drawn, the same shapes in both', () => {
    const a = app().filter((s) => s.id === HOSTED), e = eng().filter((s) => s.id === HOSTED);
    assert.equal(e.length, 1, 'the engine draws the hosted window');
    assert.equal(a.length, 1, 'the app draws the hosted window');
    assert.ok(e[0].shapes.length > 0, 'a symbol, not an empty mark');
    assert.deepEqual(shapes(a), shapes(e));
  });

  it('the unhosted window above the cut is drawn by neither', () => {
    assert.ok(!app().some((s) => s.id === FREE), 'the app leaves it out');
    assert.ok(!eng().some((s) => s.id === FREE), 'the engine leaves it out');
    assert.deepEqual(app().map((s) => s.id), [HOSTED]);
  });
});

const TWO = fileURLToPath(new URL('../../../../packages/ifcsheet/src/__fixtures__/host-wall-two-storeys.ifc', import.meta.url));
const LOWER_DOOR = 75, UPPER_WINDOW = 93;

describe('the app and the engine draw a door on its own storey only, though the wall also crosses the other plan (#586)', { skip: planModelMissing(TWO) }, () => {
  let engine: OpenedModel;
  const planes = new Map<string, { plane: SectionPlaneConfig; level: ProjectLevel }>();

  before(async () => {
    resetProject();
    await loadPlanModel(TWO);
    engine = await openModel(new Uint8Array(readFileSync(TWO)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    for (const name of ['Level 0', 'Level 1']) {
      const view: PlanProjectView | undefined = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === name);
      assert.ok(view, `a plan for ${name}`);
      planes.set(name, { plane: sectionConfigFor(view, set.levels, engine.extent)!.plane, level: view.level });
    }
  });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = (name: string) => { const { plane, level } = planes.get(name)!; return viewOpeningSymbols(appMeshes(), plane, undefined, new Set(), 'fine', level); };
  const eng = (name: string) => {
    const { plane, level } = planes.get(name)!;
    const { joineryTypes, joineryMapping, symbolFlips } = useProjectStore.getState();
    return planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips } }, undefined, level);
  };

  it('Level 0 draws the lower door only, in both', () => {
    assert.deepEqual(eng('Level 0').map((s) => s.id), [LOWER_DOOR]);
    assert.deepEqual(app('Level 0').map((s) => s.id), [LOWER_DOOR]);
  });

  it('Level 1 draws the upper window only, and never the lower door, in both', () => {
    assert.deepEqual(eng('Level 1').map((s) => s.id), [UPPER_WINDOW]);
    assert.deepEqual(app('Level 1').map((s) => s.id), [UPPER_WINDOW]);
  });
});
