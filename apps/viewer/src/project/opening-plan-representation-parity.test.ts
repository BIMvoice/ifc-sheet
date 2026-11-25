/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: the app draws a door's or window's own plan representation in place of its generated symbol exactly as the engine does. The
 * Bonsai-shaped fixture (`packages/ifcsheet/src/__fixtures__/bonsai-door-symbols.ifc`: four types each mapping a Plan / Body / PLAN_VIEW
 * symbol, one of them 5 m off its window) is loaded into the app's stores and opened by the engine; on its plan the app's symbols
 * (`viewOpeningSymbols`) must be the engine's (`planOpeningSymbols`), with the view's "Use plan symbols from the model" on and off.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, planOpeningSymbols, type OpeningSymbol } from '@bimvoice/ifcsheet';
import { openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { loadPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewOpeningSymbols } from './view-symbols';

const FIXTURE = fileURLToPath(new URL('../../../../packages/ifcsheet/src/__fixtures__/bonsai-door-symbols.ifc', import.meta.url));

const shape = (s: OpeningSymbol) => JSON.parse(JSON.stringify({ id: s.id, kind: s.kind, shapes: s.shapes, heavy: s.heavy ?? [], dashed: s.dashed ?? [] }, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x)));
const sorted = (list: readonly OpeningSymbol[]) => [...list].sort((a, b) => a.id - b.id).map(shape);

describe('the app draws the doors\' and windows\' own plan representations as the engine does (#831)', () => {
  let engine: OpenedModel;
  let plane: SectionPlaneConfig;
  let level: Parameters<typeof planOpeningSymbols>[4];

  before(async () => {
    resetProject();
    await loadPlanModel(FIXTURE);
    engine = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    const [view] = set.document.views.filter((v) => v.kind === 'plan');
    plane = sectionConfigFor(view, set.levels, engine.extent)!.plane;
    level = view.level;
  });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const eng = (usePlanSymbols: boolean) => {
    const { joineryTypes, joineryMapping } = useProjectStore.getState();
    const project = { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping! };
    return planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project, frame: engine.coordinateInfo }, usePlanSymbols ? undefined : { usePlanSymbols: false }, level);
  };
  const app = (usePlanSymbols: boolean) => viewOpeningSymbols(appMeshes(), plane, undefined, new Set(), 'fine', level, usePlanSymbols);

  it('draws three from their representations and the same as the engine', () => {
    const a = app(true), e = eng(true);
    assert.equal(a.length, 4, 'two doors and two windows');
    assert.equal(a.filter((s) => [...s.shapes, ...(s.heavy ?? [])].every((x) => x.type === 'polyline')).length, 3, 'three drawn from the model, the broken one generated');
    assert.deepEqual(sorted(a), sorted(e));
  });

  it('draws the generated symbols in both when the view does not use the model\'s plan symbols', () => {
    const a = app(false), e = eng(false);
    assert.equal(a.filter((s) => s.kind === 'door' && (s.heavy?.length ?? 0) > 0).length, 2, 'both doors\' generated leaves');
    assert.deepEqual(sorted(a), sorted(e));
  });
});
