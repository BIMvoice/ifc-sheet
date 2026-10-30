/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #615: a plan whose cut meets nothing came out blank in the engine (PDF, DXF) while the app drew it: the app also
 * draws the overhead side of the cut over the whole extent when the model has one level (`overheadPlanConfig`).
 *
 * The fixture (as `plan-cut-outside-extent.test.ts`): walls from 0 to 3.0 m, a slab to 3.3 m. A single level at -3 m
 * puts the 1.2 m cut at -1.8 m, below the whole model, like a bridge deck above a storey at 0.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSectionConfig, Drawing2DGenerator, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanProjectView, ProjectLevel, ProjectView } from './document.js';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from './headless.js';
import { planDepthBelowCut } from './view-defaults.js';

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-cut-above-top.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-cut-above-top.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the plan-empty-cut test: ${missing}`);

const BELOW: ProjectLevel = { name: 'Below', elevation: -3, storeyGlobalIds: [] };
const GROUND: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: [] };
const UP: ProjectLevel = { name: 'Up', elevation: 3, storeyGlobalIds: [] };
const plan = (id: string, level: ProjectLevel, cutHeight: number): PlanProjectView => ({ id, name: id, createdAt: 0, kind: 'plan', level, cutHeight });

/** What the app's `useDrawingGeneration` hands the generator for a one-level plan with no depth of its own. */
async function appDrawing(model: OpenedModel, view: PlanProjectView, levels: ProjectLevel[]): Promise<Drawing2D> {
  const config = sectionConfigFor(view, levels, model.extent!)!;
  const full = model.extent!.max.y - model.extent!.min.y;
  const below = planDepthBelowCut(view.cutHeight, config.plane.position, model.extent!.max.y);
  const app = createSectionConfig('y', config.plane.position, { projectionDepth: below, clipProjectionBands: true, projectionBelowDepth: below, projectionAboveDepth: full, includeHiddenLines: false });
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  try {
    return await generator.generate(model.buildingMeshes, app, { includeHiddenLines: false, includeProjection: true, includeEdges: true, mergeLines: true });
  } finally {
    generator.dispose();
  }
}

describe.skipIf(missing !== null)('a plan whose cut meets nothing, engine against app (#615)', () => {
  let model: OpenedModel;
  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
  }, 120_000);

  const engine = async (views: PlanProjectView[], levels: ProjectLevel[], onEmpty: (v: ProjectView) => void = () => {}) =>
    generateViewDrawings(views, model.buildingMeshes, levels, model.extent!, () => {}, onEmpty);

  it('draws the model above a cut below it, the same lines as the app, with one level', async () => {
    const view = plan('p', BELOW, 1.2);
    const drawing = (await engine([view], [BELOW])).get('p')!;
    const app = await appDrawing(model, view, [BELOW]);
    expect(app.lines.length).toBeGreaterThan(8);
    expect(drawing.lines).toHaveLength(app.lines.length);
    expect(drawing.projectionPolygons).toHaveLength(app.projectionPolygons.length);
  });

  it('leaves a plan whose cut meets the model as it was: cut faces, no overhead band', async () => {
    const drawing = (await engine([plan('mid', GROUND, 1.2)], [GROUND])).get('mid')!;
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
