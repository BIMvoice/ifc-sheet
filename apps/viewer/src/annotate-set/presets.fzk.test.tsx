/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation presets (#497) on AC20-FZK-Haus: a saved preset (door tags and room names, no windows, no dimensions)
 * applied to the plans places exactly those, a second application adds nothing, one Undo takes the batch back, and the
 * preset survives save and reopen.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setExtent } from '@/draft-set/body';
import { isDimAll } from '@/dimall/apply';
import { clearDraftHistory, draftsOfView, lastDraftStepAt, undoDrafts } from '@/drafting/draft-store';
import { labelTargets } from '@/labels/label-all';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { drawingShownBy } from '@/project/view-shown';
import { modelLevels } from '@/project/model-levels';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { loadProjectDocument, projectDocument, resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { startSet } from '@/set-template/start';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { ALL_TAG_PARTS, MARK_TYPE_ID, ROOM_TYPE_ID } from '@/tagall/types';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { ALL_CHOICES } from './choices';
import { annotateSet, targetViews } from './annotate-set';
import { effectiveOptions, presetsOfProject, saveAnnotationPreset, type AnnotationOptions } from './presets';
import { applyAnnotationPreset, useAnnotatePanel } from './store';
import { contextForView, runCommandOnView, type AnnotatableView } from './run-view';
import { choicesFrom } from './choices';

/** Door tags and room names; no window tags, no dimensions, no level marks. */
const DOORS_AND_ROOMS: AnnotationOptions = { on: { tagall: true, dimall: false, levelall: false }, tagParts: { doors: true, windows: false, rooms: true } };

describe('annotation presets on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  let meshes: ReturnType<typeof modelMeshes>;
  const modelMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const drawings = new Map<string, Drawing2D>();

  async function layOutSet(): Promise<AnnotatableView[]> {
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startSet(meshes, extent), 'the Wall lays out a set');
    const views = targetViews(ALL_CHOICES);
    for (const view of views) {
      const key = `${view.kind}:${view.name}`;
      let drawing = drawings.get(key);
      if (!drawing) { drawing = await model.planOf(view, { omits: 'none' }); drawings.set(key, drawing); }
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
    }
    return views;
  }

  /** The class of the element a mark or room label belongs to, read the way TAGALL reads it. */
  function classOf(view: AnnotatableView, guid: string): string | undefined {
    const ctx = contextForView(view, useViewDrawings.getState().byView[view.id].drawing!, () => {});
    return labelTargets(ctx.viewElements()).find((t) => t.guid === guid)?.className;
  }

  /** What a view carries, by kind. */
  function carried(view: AnnotatableView) {
    const drafts = draftsOfView(view.id);
    const marks = drafts.filter((d) => d.params.atype === MARK_TYPE_ID).map((d) => classOf(view, String(d.params.labelOf)) ?? '');
    return {
      doorMarks: marks.filter((c) => /^ifcdoor/i.test(c)).length,
      windowMarks: marks.filter((c) => /^ifcwindow/i.test(c)).length,
      rooms: drafts.filter((d) => d.params.atype === ROOM_TYPE_ID).length,
      dimensions: drafts.filter(isDimAll).length,
      levels: drafts.filter((d) => d.shape.type === 'level').length,
    };
  }

  const apply = (options: AnnotationOptions) => {
    const { on, tagParts } = effectiveOptions(options);
    return annotateSet({ choices: choicesFrom(on), tagParts, mode: 'undoable' });
  };

  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    meshes = modelMeshes();
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  after(() => publishDrawingRuntime(null));
  beforeEach(() => { resetProject(); useAnnotatePanel.setState({ on: { tagall: true, dimall: true, levelall: true }, tagParts: { ...ALL_TAG_PARTS }, running: null, summary: null }); });
  afterEach(() => { useViewDrawings.setState({ byView: {} }); });

  it('places exactly the chosen annotations: door tags and room names, no window tags, no dimensions, no level marks', async () => {
    const views = await layOutSet();
    const saved = saveAnnotationPreset('Doors and rooms', DOORS_AND_ROOMS);
    assert.ok(saved);
    assert.equal(await applyAnnotationPreset(saved.id), true);
    const plans = views.filter((v) => v.kind === 'plan');
    const totals = plans.map(carried);
    assert.ok(totals.some((t) => t.doorMarks > 0), 'the house has doors tagged');
    assert.ok(totals.some((t) => t.rooms > 0), 'the house has rooms named');
    for (const view of views) {
      const c = carried(view);
      assert.equal(c.windowMarks, 0, `${view.name}: no window tags`);
      assert.equal(c.dimensions, 0, `${view.name}: no dimensions`);
      assert.equal(c.levels, 0, `${view.name}: no level marks`);
    }
    // The window tags the full TAGALL would add exist, so the preset's absence of them is its choice.
    await apply({ on: { tagall: true, dimall: false, levelall: false }, tagParts: ALL_TAG_PARTS });
    assert.ok(plans.map(carried).some((t) => t.windowMarks > 0), 'the house has windows to tag');
  });

  it('on the drawings the views store (drawingShownBy), the full TAGALL tags the doors, the windows and the rooms, and a plan whose drawing omits doors and windows gets none', async () => {
    const views = await layOutSet();
    // The drawing a view stores is the generated one as the view shows it (`ViewDrawingHost`): a plain plan leaves nothing out, a discipline plan only what its filter drops.
    for (const view of views) {
      const stored = useViewDrawings.getState().byView[view.id].drawing!;
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing: drawingShownBy(view, stored), status: 'ready' } } }));
    }
    await apply({ on: { tagall: true, dimall: false, levelall: false }, tagParts: ALL_TAG_PARTS });
    const plans = views.filter((v) => v.kind === 'plan').map(carried);
    assert.ok(plans.some((c) => c.doorMarks > 0), 'doors are tagged');
    assert.ok(plans.some((c) => c.windowMarks > 0), 'windows are tagged');
    assert.ok(plans.some((c) => c.rooms > 0), 'rooms are named');
    // A plan whose drawing leaves the doors and windows out (what a discipline plan's omit predicate does, `viewOmits`) gets no door or window tag: TAGALL labels what the stored drawing holds.
    const ground = views.find((v) => v.kind === 'plan' && v.name === 'Erdgeschoss')!;
    const bare = await model.planOf(ground, { omits: 'view' });
    assert.ok(drawings.get(`plan:${ground.name}`)!.cutPolygons.length > bare.cutPolygons.length, 'the omit predicate drops elements of the generated drawing');
    const probe: AnnotatableView = { ...ground, id: 'omits-probe' };
    useViewDrawings.setState((st) => ({ byView: { ...st.byView, [probe.id]: { ...EMPTY_VIEW_DRAWING, drawing: bare, status: 'ready' } } }));
    runCommandOnView(probe, bare, 'tagall', ALL_TAG_PARTS);
    const c = carried(probe);
    assert.equal(c.doorMarks + c.windowMarks, 0, 'no door or window tag where the drawing holds none');
    assert.ok(c.rooms > 0, 'rooms are still named');
  });

  it('a preset of window tags alone places no door tag, no room name and nothing else', async () => {
    const views = await layOutSet();
    await apply({ on: { tagall: true, dimall: false, levelall: false }, tagParts: { doors: false, windows: true, rooms: false } });
    const plans = views.filter((v) => v.kind === 'plan').map(carried);
    assert.ok(plans.some((c) => c.windowMarks > 0), 'the windows are tagged');
    for (const c of plans) assert.deepEqual({ ...c, windowMarks: 0 }, { doorMarks: 0, windowMarks: 0, rooms: 0, dimensions: 0, levels: 0 });
  });

  it('a preset with the dimensions on and no tag kind places dimensions only', async () => {
    const views = await layOutSet();
    await apply({ on: { tagall: true, dimall: true, levelall: false }, tagParts: { doors: false, windows: false, rooms: false } });
    const plans = views.filter((v) => v.kind === 'plan').map(carried);
    assert.ok(plans.some((c) => c.dimensions > 0), 'the plans are dimensioned');
    for (const c of plans) assert.deepEqual({ ...c, dimensions: 0 }, { doorMarks: 0, windowMarks: 0, rooms: 0, dimensions: 0, levels: 0 });
  });

  it('applied again adds nothing, and the whole application is one undo step', async () => {
    await layOutSet();
    clearDraftHistory();
    const start = useProjectStore.getState().drafts;
    const first = await apply(DOORS_AND_ROOMS);
    assert.ok(first.added > 0);
    const after1 = useProjectStore.getState().drafts;
    const stepAt = lastDraftStepAt();
    const second = await apply(DOORS_AND_ROOMS);
    assert.equal(second.added, 0, 're-applying adds nothing');
    assert.equal(useProjectStore.getState().drafts, after1);
    assert.equal(lastDraftStepAt(), stepAt, 'and records no step');
    assert.equal(undoDrafts(), true);
    assert.deepEqual(useProjectStore.getState().drafts, start, 'one Undo removes the batch');
    assert.equal(undoDrafts(), false);
  });

  it('keeps the preset when the project is saved and reopened', async () => {
    await layOutSet();
    saveAnnotationPreset('Doors and rooms', DOORS_AND_ROOMS);
    const text = serializeProject(projectDocument());
    resetProject();
    assert.equal(presetsOfProject().length, 0);
    loadProjectDocument(parseProjectFile(text));
    const [preset] = presetsOfProject();
    assert.equal(preset.name, 'Doors and rooms');
    assert.deepEqual({ on: preset.on, tagParts: preset.tagParts }, DOORS_AND_ROOMS);
  });
});
