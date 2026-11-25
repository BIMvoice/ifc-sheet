/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One symbol per wall gap when no door in it is hosted (`door-loose-pieces.ts`), app against engine, on
 * `packages/ifcsheet/src/__fixtures__/door-loose-pieces.ifc`: a lift door as six IfcDoors, a double door as two leaves, a door stating its
 * size with a frame round it, and a door with a lining aggregated under it, all hosted in no wall. The app (`viewOpeningSymbols` over the
 * loaded meshes, reading the store by renderer id) and the engine (`planOpeningSymbols`) must draw the same five doors with the same
 * shapes. The engine's own test is `packages/ifcsheet/src/door-loose-pieces.test.ts`.
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

const FIXTURE = fileURLToPath(new URL('../../../../packages/ifcsheet/src/__fixtures__/door-loose-pieces.ifc', import.meta.url));

describe('the app and the engine draw one door per gap of doors hosted in nothing, not their pieces', { skip: planModelMissing(FIXTURE) }, () => {
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
  const names = (list: ReturnType<typeof app>) => list.filter((s) => s.kind === 'door').map((s) => engine.dataStore.entities.getName(s.id)).sort();
  const shapes = (list: ReturnType<typeof app>) => JSON.parse(JSON.stringify([...list].sort((a, b) => a.id - b.id), (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));

  it('draws the same five doors in both: the lift door once, both leaves, the door that states its size, the whole a lining is part of', () => {
    const expected = ['Door P', 'Door S', 'Leaf 1', 'Leaf 2', 'liftdeur'];
    assert.deepEqual(names(eng()), expected, 'the engine');
    assert.deepEqual(names(app()), expected, 'the app');
  });

  it('with the same shapes', () => {
    assert.deepEqual(shapes(app()), shapes(eng()));
  });
});
