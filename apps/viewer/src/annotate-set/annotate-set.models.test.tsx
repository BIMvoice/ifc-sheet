/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotating the set on the demo block (#333): every plan tagged and
 * dimensioned and every elevation and section level-marked in one action, with
 * no view open. The reference is the command run in the view as it is open: the
 * real hook installs the view's inputs into the session, and TAGALL, DIMALL or
 * LEVELALL is typed on the command line. The batch must leave on every view
 * exactly the drafts the open view gets (same count, same shapes), as one undo
 * step, and a second run must add nothing.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect, useMemo } from 'react';
import { act } from 'react';
import { captureSetTemplate, parseSetTemplate, serializeSetTemplate } from '@bimvoice/ifcsheet';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { useDraftingProviders } from '@/components/viewer/drafting/useDraftingProviders';
import { setExtent } from '@/draft-set/body';
import { clearDraftHistory, draftsOfView, lastDraftStepAt, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { AXIS_NAME } from '@/drafting/frame';
import { attachDraftingView, cancelCommand, submitCommandLine } from '@/drafting/session';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { armTemplate, useSetTemplates } from '@/set-template/store';
import { startSet } from '@/set-template/start';
import { cleanup, render } from '@/test/render.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { DraftEntity } from '@/drafting/types';
import { annotateSet, targetViews, type SetSummary } from './annotate-set';
import { ALL_CHOICES, choicesOfTemplate, type AnnotatedKind } from './choices';
import { contextForView, type AnnotatableView } from './run-view';
import { installedViewInputs } from '@/drafting/session-providers';

const BLOC = fileURLToPath(new URL('../../public/samples/bloc-p4.ifc', import.meta.url));

const COMMAND_LINE: Record<AnnotatedKind, readonly string[]> = { plan: ['TAGALL', 'DIMALL'], elevation: ['LEVELALL'], section: ['LEVELALL'] };

/** What drafts are, apart from their random ids: the shape, the layer and the parameters. */
function signatureOf(drafts: readonly DraftEntity[]): string[] {
  return drafts.map((d) => JSON.stringify({ shape: d.shape, layer: d.layerId, params: d.params })).sort();
}

/** What annotating added to the view: its drafts that were not there at `before`. */
function addedSince(viewId: string, before: ReadonlySet<string>): string[] {
  return signatureOf(draftsOfView(viewId).filter((d) => !before.has(d.id)));
}

/** The view in front, as the drafting view mounts it: the session attached, the hook installing the view's inputs. */
function OpenView({ view, drawing }: { view: AnnotatableView; drawing: Drawing2D }) {
  const drafts = useProjectStore((s) => s.drafts);
  const levels = useProjectStore((s) => s.levels);
  const entities = useMemo(() => draftsOfView(view.id, drafts), [drafts, view.id]);
  const plane = drawing.config.plane;
  useEffect(() => {
    attachDraftingView(view.id, AXIS_NAME[plane.axis], () => [], (view.scale ?? 100) / 100);
  }, [view.id, view.scale, plane]);
  useDraftingProviders({ view, drawing, references: null, entities, plane, levels, scale: 1 });
  return null;
}

/** The demo block (five storeys, rooms and no doors), and the house (doors, windows, a roof: the symbols a tag keeps clear of). */
for (const [name, path] of [['the demo block (bloc-p4)', BLOC], ['AC20-FZK-Haus', FZK_HAUS]] as const) describe(`annotate the set on ${name}`, { skip: planModelMissing(path) }, () => {
  let model: LoadedPlanModel;
  let meshes: ReturnType<typeof modelMeshes>;
  const modelMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const drawings = new Map<string, Drawing2D>();

  /** The set the Wall lays out when the block opens, and the drawing each of its views would hold. */
  async function layOutSet(): Promise<AnnotatableView[]> {
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startSet(meshes, extent), 'the Wall lays out a set');
    const views = targetViews(ALL_CHOICES);
    for (const view of views) await holdDrawing(view);
    return views;
  }

  async function holdDrawing(view: ProjectView): Promise<void> {
    const key = `${view.kind}:${view.name}`;
    let drawing = drawings.get(key);
    if (!drawing) {
      drawing = await model.planOf(view);
      drawings.set(key, drawing);
    }
    useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
  }

  /** Each view annotated by typing its commands in the view while it is open: the signature of what it was given. */
  function openViewResults(views: readonly AnnotatableView[]): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const start = useProjectStore.getState().drafts;
    const there = new Set(start.map((d) => d.id));
    for (const view of views) {
      const drawing = useViewDrawings.getState().byView[view.id].drawing!;
      render(<OpenView view={view} drawing={drawing} />);
      for (const line of COMMAND_LINE[view.kind]) act(() => submitCommandLine(line, null));
      out.set(view.id, addedSince(view.id, there));
      cancelCommand();
      cleanup();
    }
    // The views are annotated one after another in the open-view run, as they are in the batch; start the batch from the same drafts.
    useProjectStore.setState({ drafts: start });
    clearDraftHistory();
    return out;
  }

  const wholeSet = (): Promise<SetSummary> => annotateSet({ choices: ALL_CHOICES, mode: 'undoable' });

  before(async () => {
    model = await loadPlanModel(path);
    meshes = modelMeshes();
    // The geometry the app's drawing host publishes: the rooms of a plan and the symbols a tag keeps clear of are read from it.
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  after(() => publishDrawingRuntime(null));
  beforeEach(() => resetProject());
  afterEach(() => {
    cleanup();
    cancelCommand();
    useViewDrawings.setState({ byView: {} });
  });

  it('leaves on every view the drafts the open view gets: same count, same shapes', async () => {
    const views = await layOutSet();
    const kinds = new Set(views.map((v) => v.kind));
    assert.ok(kinds.has('plan') && kinds.has('elevation'), 'the set has plans and elevations');
    const there = new Set(useProjectStore.getState().drafts.map((d) => d.id));
    const reference = openViewResults(views);
    for (const [id, sig] of reference) if (views.find((v) => v.id === id)?.kind !== 'plan') assert.ok(sig.length > 0, `${views.find((v) => v.id === id)?.name} gets annotations when its commands are typed in it`);
    assert.ok([...reference.values()].filter((s) => s.length > 0).length >= views.length - 1, 'nearly every view gets some');

    const summary = await wholeSet();
    for (const view of views) {
      assert.deepEqual(addedSince(view.id, there), reference.get(view.id), `${view.name} (${view.kind})`);
    }
    assert.equal(summary.added, [...reference.values()].reduce((n, s) => n + s.length, 0));
    assert.ok(summary.views.every((v) => !v.skipped), 'every view had its drawing');
  });

  it('gives a command the inputs the open view gives it: elements, parts, rooms, obstacles, loops, planes and levels', async () => {
    const views = await layOutSet();
    for (const view of views) {
      const drawing = useViewDrawings.getState().byView[view.id].drawing!;
      render(<OpenView view={view} drawing={drawing} />);
      const open = installedViewInputs();
      const batch = contextForView(view, drawing, () => {});
      const at = { x: 1, y: 2 };
      const read = (c: Pick<typeof batch, 'viewElements' | 'planParts' | 'planObstacles' | 'rooms' | 'closedLoops' | 'plane' | 'viewKind' | 'levelAt' | 'levelRefAt'>) => ({
        elements: c.viewElements(), parts: c.planParts(), obstacles: c.planObstacles(), rooms: c.rooms(), loops: c.closedLoops(), plane: c.plane(), kind: c.viewKind(), level: c.levelAt(at), ref: c.levelRefAt(at),
      });
      // Key by key and without a diff: a mismatch of a whole plan's boxes is too big to print.
      const [fromBatch, fromOpen] = [read(batch), read(open)];
      for (const key of Object.keys(fromBatch) as (keyof typeof fromBatch)[]) assert.ok(isDeepStrictEqual(fromBatch[key], fromOpen[key]), `${view.name} (${view.kind}): ${key} differs between the batch and the open view`);
      assert.equal(batch.resolveLevel({ at, storey: undefined }), open.resolveLevel({ at, storey: undefined }));
      if (view.kind === 'plan') {
        assert.ok(batch.rooms().length > 0, `${view.name} reads its rooms`);
        assert.equal(batch.view()?.id, view.id);
      }
      cancelCommand();
      cleanup();
    }
    assert.ok(views.some((v) => v.kind === 'plan' && contextForView(v, useViewDrawings.getState().byView[v.id].drawing!, () => {}).planObstacles().length > 0), 'a plan of this set draws symbols a tag keeps clear of');
  });

  it('tags and dimensions every plan and level-marks every elevation and section', async () => {
    const views = await layOutSet();
    const summary = await wholeSet();
    for (const view of views) {
      const kinds = new Set(draftsOfView(view.id).map((d) => (d.shape.type === 'level' ? 'level' : d.params.atype ? 'tag' : d.shape.type)));
      if (view.kind === 'plan') assert.ok(kinds.has('tag'), `${view.name} is tagged`);
      else assert.ok(kinds.has('level'), `${view.name} is level-marked`);
    }
    const planResults = summary.views.filter((v) => v.kind === 'plan').flatMap((v) => v.results.map((r) => r.command));
    assert.ok(planResults.includes('tagall') && planResults.includes('dimall'));
    assert.ok(!summary.views.some((v) => v.kind !== 'plan' && v.results.some((r) => r.command !== 'levelall')));
  });

  it('is one undo step: one Undo removes everything, and Redo puts it back', async () => {
    await layOutSet();
    const start = useProjectStore.getState().drafts;
    clearDraftHistory();
    const summary = await wholeSet();
    assert.ok(summary.added > 0);
    assert.equal(useProjectStore.getState().drafts.length, start.length + summary.added);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(useProjectStore.getState().drafts, start, 'one Undo takes it all back');
    assert.equal(undoDrafts(), false, 'and there was only the one step');
    assert.equal(redoDrafts(), true);
    assert.equal(useProjectStore.getState().drafts.length, start.length + summary.added, 'Redo puts it all back');
  });

  it('leaves what the user drew between two views out of the step it records', async () => {
    await layOutSet();
    const start = useProjectStore.getState().drafts;
    clearDraftHistory();
    const views = targetViews(ALL_CHOICES);
    let drewOwn = false;
    const own = { id: 'own-draft', viewId: views[0].id, layerId: '0', shape: { type: 'point', p: { x: 0, y: 0 } }, params: {} } as never;
    await annotateSet({
      choices: ALL_CHOICES, mode: 'undoable',
      onProgress: ({ done }) => {
        if (done === 1 && !drewOwn) { drewOwn = true; useProjectStore.setState((s) => ({ drafts: [...s.drafts, own] })); }
      },
    });
    assert.ok(drewOwn);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(useProjectStore.getState().drafts.filter((d) => !start.includes(d)).map((d) => d.id), ['own-draft'], 'Undo takes back the set\'s annotations, not the drawing made meanwhile');
  });

  it('adds nothing the second time, and makes no undo step', async () => {
    await layOutSet();
    const first = await wholeSet();
    assert.ok(first.added > 0);
    const before = useProjectStore.getState().drafts;
    const stepAt = lastDraftStepAt();
    const second = await wholeSet();
    assert.equal(second.added, 0);
    assert.equal(useProjectStore.getState().drafts, before, 'not one draft changed');
    assert.equal(lastDraftStepAt(), stepAt, 'no second step');
    for (const v of second.views) for (const r of v.results) assert.notEqual(r.outcome, 'added', `${v.name} ${r.command}`);
    const done = second.views.flatMap((v) => v.results).filter((r) => r.outcome === 'already');
    assert.ok(done.length > 0, 'what is there is reported as there');
  });

  it('says why a command did nothing on a view, per view', async () => {
    await layOutSet();
    const only = await annotateSet({ choices: { plan: [], elevation: [], section: ['levelall'] }, mode: 'undoable' });
    assert.ok(only.views.every((v) => v.kind === 'section'));
    // A view whose drawing cannot be made is skipped with that reason and the rest go on.
    const views = targetViews(ALL_CHOICES);
    const summary = await annotateSet({
      choices: ALL_CHOICES, mode: 'undoable',
      drawingOf: async (view) => (view.id === views[0].id ? { drawing: null, error: 'timeout' } : { drawing: useViewDrawings.getState().byView[view.id].drawing! }),
    });
    assert.equal(summary.views[0].skipped?.key, 'wall.annotate.reason.noDrawing');
    assert.ok(summary.views.slice(1).some((v) => v.results.length > 0));
  });

  it('a set template that records the commands runs them on the new set, as its starting state', async () => {
    await layOutSet();
    const { views, sheets } = useProjectStore.getState();
    const annotated = new Map(views.map((v) => [v.id, ['tagAll', 'dimAll', 'levelAll'] as const]));
    const template = parseSetTemplate(serializeSetTemplate(captureSetTemplate({ name: 'Annotated', views, sheets, annotated: annotated as never })));
    assert.deepEqual(choicesOfTemplate(template).plan, ['tagall', 'dimall']);
    const reference = new Map(targetViews(ALL_CHOICES).map((v) => [`${v.kind}:${v.name}`, 0]));

    // The block again, from the template: nothing annotated yet, no history.
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    armTemplate(template);
    assert.ok(startSet(meshes, extent, { drawingOf: async (view) => ({ drawing: (await model.planOf(view)) }) }));
    assert.equal(useSetTemplates.getState().report?.annotated, 'running');
    for (let i = 0; i < 600 && useSetTemplates.getState().report?.annotated === 'running'; i++) await new Promise((r) => setTimeout(r, 100));
    const report = useSetTemplates.getState().report?.annotated;
    assert.ok(report && report !== 'running', 'the commands ran');
    assert.ok(report.added > 0);
    for (const view of targetViews(ALL_CHOICES)) {
      assert.ok(draftsOfView(view.id).length > 0, `${view.name} carries the template's commands`);
      reference.delete(`${view.kind}:${view.name}`);
    }
    assert.equal(reference.size, 0, 'the same views as the first set');
    assert.equal(undoDrafts(), false, 'the starting state is not an undo step');
    assert.equal(lastDraftStepAt(), null);
  });
});
