/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #623, the app against the engine on plans of a model with two or more storeys, and on a reflected plan: the app's real
 * path (`viewDrawing`: the `useDrawingGeneration` hook, with the parsed spatial hierarchy) and the engine's sheets
 * (`generateViewDrawings`, floors from `storeyFloorsOf`) draw the same meshes, and the two drawings hold the same
 * lines per category and the same faces. Both take their bands from `planProjectionBands`; a side that stops calling it
 * draws no projection, and every row asks for some.
 *
 * Fixtures: AC20-FZK-Haus (two storeys), bloc-p4 (five), `plan-cut-above-top.ifc` (one level: walls 0 to 3.0 m, a slab
 * 3.0 to 3.3 m).
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

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const BLOC = new URL('../../public/samples/bloc-p4.ifc', import.meta.url);
const ONE_LEVEL = new URL('./__fixtures__/plan-cut-above-top.ifc', import.meta.url);

/** Every line, hidden ones too: both sides classify them (the app shows them dashed, the sheet leaves them out). */
const counts = (d: Drawing2D) => {
  const lines = d.lines;
  return {
    lines: lines.length,
    cut: lines.filter((l) => l.category === 'cut').length,
    projection: lines.filter((l) => l.category === 'projection').length,
    seenProjection: lines.filter((l) => l.category === 'projection' && l.visibility !== 'hidden').length,
    hidden: lines.filter((l) => l.visibility === 'hidden').length,
    cutPolygons: d.cutPolygons.length,
    projectionPolygons: d.projectionPolygons.length,
  };
};

const GROUND: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: [] };

interface Loaded { geometry: GeometryResult; model: OpenedModel; levels: readonly ProjectLevel[]; plans: PlanProjectView[] }

async function load(file: URL): Promise<Loaded | null> {
  const geometry = await meshFile(file);
  if (!geometry) return null;
  const model = await openModel(new Uint8Array(readFileSync(file)));
  const set = generateDefaultSet(model);
  assert.ok(set, 'a default set');
  return { geometry, model, levels: set.levels, plans: set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan') };
}

/** Both sides draw `view`; the rows say how much projection it has to have. */
async function both(l: Loaded, view: PlanProjectView) {
  const hierarchy = l.model.dataStore.spatialHierarchy;
  const app = await viewDrawing(view, l.geometry, hierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
  assert.ok(app, 'the app drew nothing');
  // The engine's own inputs (`sheetGraphics`): the building's meshes, which leave out the spaces, openings and type
  // library the app's class filter drops, and the extent measured on them.
  const floors = storeyFloorsOf(l.model.buildingMeshes, hierarchy);
  const engine = (await generateViewDrawings([view], l.model.buildingMeshes, l.levels, l.model.extent!, undefined, undefined, floors)).get(view.id);
  assert.ok(engine, 'the engine drew nothing');
  return { app: counts(app), engine: counts(engine) };
}

describe('plans of a model with two or more storeys, and reflected plans, app against engine (#623)', () => {
  let fzk: Loaded | null = null;
  let bloc: Loaded | null = null;
  let one: Loaded | null = null;
  // One at a time: the wasm runtime is single-threaded and panics on a second meshing in flight.
  before(async () => { fzk = await load(FZK); bloc = await load(BLOC); one = await load(ONE_LEVEL); });

  /** `minProjection`: the projection lines the plan has to draw, so that a side that stops projecting fails whatever the other does. */
  async function row(t: { skip: (m: string) => void }, pick: () => [Loaded | null, PlanProjectView | undefined], minProjection: number) {
    const [l, view] = pick();
    if (!l) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    assert.ok(view, 'the plan exists');
    const { app, engine } = await both(l, view);
    assert.ok(app.lines > 0, 'an empty drawing proves nothing');
    assert.ok(app.seenProjection >= minProjection, `the app draws at least ${minProjection} projection lines it shows (drew ${app.seenProjection})`);
    assert.deepEqual(engine, app);
  }
  const named = (l: Loaded | null, name: RegExp) => l?.plans.find((p) => name.test(p.name));

  // 1.1 m, not the default 1.2: the ground floor's slab top sits exactly 1.2 m under the default cut, and the app's cut
  // position (a percentage of the extent) is 1.2000000000000002, which puts that slab's edges one rounding error outside
  // a 1.2 m band the engine's exact 1.2 keeps them in.
  const ground = (extra: Partial<PlanProjectView> = {}) => named(fzk, /Erdgeschoss/) && { ...named(fzk, /Erdgeschoss/)!, id: `fzk-eg-${JSON.stringify(extra)}`, cutHeight: 1.1, ...extra };
  it('FZK Erdgeschoss', (t) => row(t, () => [fzk, ground()], 100));
  it('FZK Dachgeschoss', (t) => row(t, () => [fzk, named(fzk, /Dachgeschoss/)], 100));
  it('FZK Erdgeschoss, depth 0 (the cut only)', (t) => row(t, () => [fzk, ground({ viewDepth: 0 })], 0));
  it('FZK Erdgeschoss, depth 1', (t) => row(t, () => [fzk, ground({ viewDepth: 1 })], 20));
  it('FZK Erdgeschoss, reflected', (t) => row(t, () => [fzk, ground({ reflected: true })], 1));
  it('FZK Dachgeschoss, reflected, depth 1', (t) => row(t, () => [fzk, named(fzk, /Dachgeschoss/) && { ...named(fzk, /Dachgeschoss/)!, id: 'fzk-refl-d1', reflected: true, viewDepth: 1 }], 1));
  it('bloc-p4, the first plan', (t) => row(t, () => [bloc, bloc?.plans[0]], 100));
  it('bloc-p4, a middle plan', (t) => row(t, () => [bloc, bloc?.plans[2]], 100));

  const flat = (cutHeight: number, extra: Partial<PlanProjectView> = {}): [Loaded | null, PlanProjectView | undefined] =>
    [one && { ...one, levels: [GROUND] }, { id: `one-${cutHeight}-${JSON.stringify(extra)}`, name: 'plan', createdAt: 0, kind: 'plan', level: GROUND, cutHeight, ...extra }];
  it('a one-level plan', (t) => row(t, () => flat(1.2), 10));
  it('a one-level reflected plan', (t) => row(t, () => flat(1.2, { reflected: true }), 10));
  it('a one-level reflected plan, depth 1', (t) => row(t, () => flat(1.2, { reflected: true, viewDepth: 1 }), 10));
});
