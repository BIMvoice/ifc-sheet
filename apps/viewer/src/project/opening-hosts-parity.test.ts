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
import { generateDefaultSet, planOpeningSymbols } from '@bimvoice/ifcsheet';
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

  before(async () => {
    resetProject();
    await loadPlanModel(FIXTURE);
    engine = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    const view = set.document.views.find((v) => v.kind === 'plan' && v.name === 'Level 0');
    assert.ok(view, 'a plan for Level 0');
    plane = sectionConfigFor(view, set.levels, engine.extent)!.plane;
  });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = () => viewOpeningSymbols(appMeshes(), plane, useProjectStore.getState().symbolFlips, new Set(), 'fine');
  const eng = () => {
    const { joineryTypes, joineryMapping, symbolFlips } = useProjectStore.getState();
    return planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips } }, undefined);
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
