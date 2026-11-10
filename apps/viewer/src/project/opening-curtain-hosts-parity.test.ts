/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The host-wall rule on curtain walls (#586), app against engine, on `packages/ifcsheet/src/__fixtures__/host-curtain-wall.ifc`: a door
 * above the cut in a curtain wall through an opening (#75) and one aggregated into a body-less curtain wall (#85). Both draw, the same
 * shapes in both. On `host-curtain-wall-above.ifc` (the walls wholly above the cut) neither does. The engine's own test is
 * `packages/ifcsheet/src/opening-curtain-hosts.test.ts`.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDefaultSet, planOpeningSymbols, type PlanProjectView } from '@bimvoice/ifcsheet';
import { openModel, sectionConfigFor } from '@bimvoice/ifcsheet/headless';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewOpeningSymbols } from './view-symbols';

const path = (name: string) => fileURLToPath(new URL(`../../../../packages/ifcsheet/src/__fixtures__/${name}`, import.meta.url));
const OPENING_DOOR = 75, PART_DOOR = 85;

async function both(name: string) {
  resetProject();
  await loadPlanModel(path(name));
  const engine = await openModel(new Uint8Array(readFileSync(path(name))));
  const set = generateDefaultSet(engine);
  assert.ok(set && engine.extent, 'the engine lays out a set');
  const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0');
  assert.ok(view, 'a plan for Level 0');
  const plane = sectionConfigFor(view, set.levels, engine.extent)!.plane;
  const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const { joineryTypes, joineryMapping, symbolFlips } = useProjectStore.getState();
  return {
    app: viewOpeningSymbols(meshes, plane, symbolFlips, new Set(), 'fine', view.level),
    eng: planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips } }, undefined, view.level),
  };
}
const shapes = (list: { id: number }[]) => JSON.parse(JSON.stringify([...list].sort((a, b) => a.id - b.id), (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));

describe('the app and the engine draw a door in a curtain wall the plan cuts (#586)', { skip: planModelMissing(path('host-curtain-wall.ifc')) }, () => {
  it('both doors above the cut are drawn, the same shapes in both', async () => {
    const { app, eng } = await both('host-curtain-wall.ifc');
    assert.deepEqual(eng.map((s) => s.id).sort(), [OPENING_DOOR, PART_DOOR]);
    assert.deepEqual(app.map((s) => s.id).sort(), [OPENING_DOOR, PART_DOOR]);
    assert.ok(eng.every((s) => s.shapes.length > 0), 'symbols, not empty marks');
    assert.deepEqual(shapes(app), shapes(eng));
  });
});

describe('the app and the engine leave out a door in a curtain wall the plan does not cut (#586)', { skip: planModelMissing(path('host-curtain-wall-above.ifc')) }, () => {
  it('neither draws a door when the curtain walls are wholly above the cut', async () => {
    const { app, eng } = await both('host-curtain-wall-above.ifc');
    assert.deepEqual(eng, []);
    assert.deepEqual(app, []);
  });
});
