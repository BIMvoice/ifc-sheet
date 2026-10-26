/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The main-thread cost of annotating a large set (#333), on the school building (Skolebygg), which is not in the repository:
 * set `SKOLEBYGG_IFC` to its path to run this. The drawings are made first (in the app they come from the generation worker, off
 * the page); what is measured is the batch itself, the part that runs on the page: the longest stretch it holds the page for
 * (the event loop's longest delay while it runs) and the longest it goes between two yields.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setExtent } from '@/draft-set/body';
import { clearDraftHistory } from '@/drafting/draft-store';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startSet } from '@/set-template/start';
import { useViewerStore } from '@/store';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { annotateSet, targetViews } from './annotate-set';
import { ALL_CHOICES } from './choices';

const SKOLEBYGG = process.env.SKOLEBYGG_IFC ?? '';

describe('annotating the school building', { skip: SKOLEBYGG === '' ? 'SKOLEBYGG_IFC is not set' : planModelMissing(SKOLEBYGG) }, () => {
  before(() => { resetProject(); clearDraftHistory(); });

  it('holds the page for short stretches only', { timeout: 1_800_000 }, async () => {
    const model = await loadPlanModel(SKOLEBYGG);
    const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    publishDrawingRuntime({ geometryResult: [...useViewerStore.getState().models.values()][0].geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startSet(meshes, extent));
    const views = targetViews(ALL_CHOICES);
    const drawings = new Map(await Promise.all(views.map(async (v) => [v.id, await model.planOf(v)] as const)));

    const lag = monitorEventLoopDelay({ resolution: 1 });
    lag.enable();
    const t0 = performance.now();
    const summary = await annotateSet({
      choices: ALL_CHOICES, mode: 'undoable',
      drawingOf: async (view) => ({ drawing: drawings.get(view.id)! }),
    });
    const total = performance.now() - t0;
    lag.disable();
    console.log(JSON.stringify({ views: views.length, added: summary.added, totalMs: Math.round(total), longestLagMs: Math.round(lag.max / 1e6), longestCommandMs: Math.round(Math.max(...summary.views.flatMap((v) => v.results.map((r) => r.ms)))), perViewMs: Math.round(total / views.length) }));
    console.log(JSON.stringify(summary.views.map((v) => [v.name, v.kind, v.results.map((r) => [r.command, r.added, Math.round(r.ms)])])));
    assert.ok(summary.added > 0);
    // Before DIMALL's outline looked only at the shapes near each cell, one plan held the page for 18 s.
    assert.ok(lag.max / 1e6 < 3_000, 'no single stretch holds the page for seconds');
  });
});
