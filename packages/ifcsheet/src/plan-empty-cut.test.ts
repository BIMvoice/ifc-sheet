/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #615: a plan whose cut meets nothing came out blank in the engine (PDF, DXF) while the app drew it: the app also
 * draws the overhead side of the cut over the whole extent when the model has one level. The bands come from
 * `boundedProjectionBands`, which the app's hook calls too; the app against the engine, on the same meshes, is
 * `apps/viewer/src/project/plan-empty-cut.parity.test.tsx`.
 *
 * The fixture (as `plan-cut-outside-extent.test.ts`): walls from 0 to 3.0 m, a slab to 3.3 m. A single level at -3 m
 * puts the 1.2 m cut at -1.8 m, below the whole model, like a bridge deck above a storey at 0.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView, ProjectLevel, ProjectView } from './document.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { boundedProjectionBands, viewProjection } from './plan-projection.js';

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-cut-above-top.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-cut-above-top.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the plan-empty-cut test: ${missing}`);

const BELOW: ProjectLevel = { name: 'Below', elevation: -3, storeyGlobalIds: [] };
const GROUND: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: [] };
const UP: ProjectLevel = { name: 'Up', elevation: 3, storeyGlobalIds: [] };
const plan = (id: string, level: ProjectLevel, cutHeight: number): PlanProjectView => ({ id, name: id, createdAt: 0, kind: 'plan', level, cutHeight });

describe.skipIf(missing !== null)('a plan whose cut meets nothing, in the engine (#615)', () => {
  let model: OpenedModel;
  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
  }, 120_000);

  const engine = async (views: PlanProjectView[], levels: ProjectLevel[], onEmpty: (v: ProjectView) => void = () => {}) =>
    generateViewDrawings(views, model.buildingMeshes, levels, model.extent!, () => {}, onEmpty);

  it('draws the model above a cut below it, with one level', async () => {
    const drawing = (await engine([plan('p', BELOW, 1.2)], [BELOW])).get('p')!;
    expect(drawing.cutPolygons).toHaveLength(0);
    expect(drawing.lines.length).toBeGreaterThan(8);
  });

  it('adds what is overhead to a cut that meets the walls, with one level (the slab above it), and keeps the cut', async () => {
    const drawing = (await engine([plan('mid', GROUND, 1.2)], [GROUND])).get('mid')!;
    expect(drawing.cutPolygons.length).toBeGreaterThanOrEqual(4);
    expect(drawing.lines.filter((l) => l.category === 'projection').length).toBeGreaterThan(0);
  });

  it('a depth of 0 shows the cut only, with one level', async () => {
    const drawing = (await engine([{ ...plan('flat', GROUND, 1.2), viewDepth: 0 }], [GROUND])).get('flat')!;
    expect(drawing.cutPolygons.length).toBeGreaterThanOrEqual(4);
    expect(drawing.lines.filter((l) => l.category === 'projection')).toHaveLength(0);
  });

  it('keeps the cut empty with two levels, as the app scopes the bands to the storey, and says so', async () => {
    const empty: ProjectView[] = [];
    const drawing = (await engine([plan('two', BELOW, 1.2)], [BELOW, GROUND, UP], (v) => empty.push(v))).get('two')!;
    expect(drawing.lines).toHaveLength(0);
    expect(drawing.cutPolygons).toHaveLength(0);
    expect(empty.map((v) => v.id)).toEqual(['two']);
  });

  it('says nothing for a plan that drew something', async () => {
    const empty: ProjectView[] = [];
    await engine([plan('p', BELOW, 1.2), plan('mid', GROUND, 1.2)], [BELOW], (v) => empty.push(v));
    expect(empty).toHaveLength(0);
  });
});

describe('the projection bands both paths take (#615)', () => {
  const full = { below: 13.5, above: 13.5 };
  it.each([
    ['a plan, depth 1.2 under the model top: both sides', { depth: 1.2, position: 1.2, axisMax: 17, down: true, plainPlan: true }, { below: 1.2, above: 13.5 }],
    ['a plan, cut above the model: the depth runs from the model top (#226)', { depth: 1, position: 5, axisMax: 3.3, down: true, plainPlan: true }, { below: 2.7, above: 13.5 }],
    ['a plan with depth 0: the cut only', { depth: 0, position: 1.2, axisMax: 17, down: true, plainPlan: true }, { below: 0, above: 0 }],
    ['a section: its depth, nothing behind the plane', { depth: 4, position: 1, axisMax: 17, down: false, plainPlan: false }, { below: 4, above: 0 }],
    ['a flipped plan: its depth as given', { depth: 2, position: 5, axisMax: 3.3, down: true, plainPlan: false }, { below: 2, above: 13.5 }],
  ])('%s', (_name, input, expected) => {
    expect(boundedProjectionBands(full, input)).toEqual(expected);
  });

  it.each([
    ['a plan with no depth: as deep as its cut is high', { kind: 'plan' as const, cutHeight: 1.2 }, { showConstructionProjection: true, constructionProjectionDepth: 1.2 }],
    ['a plan with a depth of 0', { kind: 'plan' as const, cutHeight: 1.2, viewDepth: 0 }, { showConstructionProjection: false, constructionProjectionDepth: 0 }],
    ['a reflected plan with no depth: the automatic bands', { kind: 'plan' as const, cutHeight: 1.2, reflected: true }, { showConstructionProjection: true, constructionProjectionDepth: null }],
    ['a section with no depth: the automatic bands', { kind: 'section' as const }, { showConstructionProjection: true, constructionProjectionDepth: null }],
  ])('%s', (_name, view, expected) => {
    expect(viewProjection(view)).toEqual(expected);
  });
});
