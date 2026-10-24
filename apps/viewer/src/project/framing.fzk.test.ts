/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The app and the engine frame a model alike (#268). The FZK-Haus with a
 * survey cube 80 m west goes through the app's own reads (`buildingFraming`,
 * `setExtent`, the readiness facts) and through `@bimvoice/ifcsheet`'s
 * `openModel`, which share one rule (`frameEntities`). The two must leave out
 * the same element at the same distance, measure the same building, and both
 * go back to the old extent with the project setting.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FAR_MARKER_NAME, fzkWithFarMarker } from '@/test/far-marker-fixture';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { currentModelFacts } from '@/check/readiness-read';
import { describeMissing } from '@/check/readiness-say';
import { modelReadiness } from '@/check/readiness';
import { modelMeshes, setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { buildingFraming } from './model-rooms';
import { resetProject, setIncludeFarElements, useProjectStore } from './project-store';

const near = (a: number, b: number, what: string): void => assert.ok(Math.abs(a - b) < 1e-6, `${what}: app ${a}, engine ${b}`);
const AXES = ['x', 'y', 'z'] as const;

describe('the app frames the FZK-Haus with a survey cube like the engine does', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let engineAll: OpenedModel;
  let plain: OpenedModel;

  before(async () => {
    const path = fzkWithFarMarker(80);
    await loadPlanModel(path); // first: it makes the wasm readable from disk, for the engine too
    engine = await openModel(new Uint8Array(readFileSync(path)));
    engineAll = await openModel(new Uint8Array(readFileSync(path)), { includeFarElements: true });
    plain = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
  });

  beforeEach(() => {
    const { levels } = useProjectStore.getState();
    resetProject();
    useProjectStore.setState({ levels });
  });

  const app = (includeFar: boolean) => buildingFraming(useProjectStore.getState().levels, modelMeshes(), includeFar);

  it('leaves out the same element, named the same, at the same distance', () => {
    assert.equal(engine.farElements.length, 1);
    const { far } = app(false);
    assert.deepEqual(far.map((f) => f.label), [FAR_MARKER_NAME]);
    assert.deepEqual(far.map((f) => f.label), engine.farElements.map((f) => f.label));
    near(far[0].distance, engine.farElements[0].distance, 'distance');
    assert.ok(far[0].distance > 75);
  });

  it('measures the building the engine measures, which is the FZK-Haus without the cube', () => {
    const { extent } = app(false);
    assert.ok(extent && engine.extent && plain.extent);
    for (const end of ['min', 'max'] as const) for (const axis of AXES) {
      near(extent[end][axis], engine.extent[end][axis], `${end}.${axis} against the engine`);
      near(extent[end][axis], plain.extent[end][axis], `${end}.${axis} against the plain model`);
    }
  });

  it('measures everything, as before, with the setting, in the app and the engine alike', () => {
    const { extent, far } = app(true);
    assert.deepEqual(far, []);
    assert.ok(extent && engineAll.extent);
    for (const end of ['min', 'max'] as const) for (const axis of AXES) near(extent[end][axis], engineAll.extent[end][axis], `${end}.${axis}`);
    assert.ok(extent.max.x - extent.min.x > 90, 'the cube is in the frame');
  });

  it('sizes the draft set from the setting the project holds', () => {
    const { models, geometryResult } = useViewerStore.getState();
    const widthOf = () => {
      const { extent } = setExtent(useProjectStore.getState().levels, modelMeshes(), mergedSectionBounds(models, geometryResult));
      assert.ok(extent);
      return extent.max.x - extent.min.x;
    };
    const narrow = widthOf();
    assert.ok(narrow < 20, `the house alone (${narrow} m)`);
    setIncludeFarElements(true);
    assert.ok(widthOf() > 90, 'with the setting, the cube too');
    setIncludeFarElements(false);
    assert.equal(widthOf(), narrow);
  });

  it('says in the readiness which element and how far, and says nothing with the setting', () => {
    const facts = currentModelFacts();
    assert.deepEqual(facts.farElements?.map((f) => f.label), [FAR_MARKER_NAME]);
    const finding = modelReadiness(facts).find((f) => f.kind === 'farElements');
    assert.ok(finding);
    assert.match(describeMissing(finding), /^1 elements lie up to \d+ m from the building: 'NUS - 0,0 - Kake' \(\d+ m\)\.$/);
    setIncludeFarElements(true);
    assert.equal(currentModelFacts().farElements, undefined);
  });

  it('keeps the cube in the model: its mesh is still there', () => {
    assert.ok(modelMeshes().some((m) => useViewerStore.getState().models.get('m')?.ifcDataStore?.entities.getName(m.expressId) === FAR_MARKER_NAME));
  });
});
