/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { danglingAnnotations } from '@/check/findings';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { renderIdGlobalId } from '@/project/element-guid';
import { loadProjectDocument, projectDocument, resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { elevationMarkPlan } from '@/drafting/cross-ref-marks';
import { dimensionLayout } from '@/drafting/annotation';
import { dimAlignedCommand } from '@/drafting/commands/annotate';
import type { DraftContext } from '@/drafting/commands/types';
import { anchorsOf } from '@/drafting/dimension-anchor';
import { clearDraftHistory } from '@/drafting/draft-store';
import { referenceElementBoxes, referenceSet, type ReferenceSet } from '@/drafting/references';
import { findSnap } from '@/drafting/snaps';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { currentSnapshot } from './current.js';
import { runWhatChanged } from './run.js';

/**
 * #459: a dimension snapped to model geometry follows the element when a new version is opened. Version 1 is the FZK-Haus; version 2 is
 * the same IFC text with the interior wall `Wand-Int-ERDG-4` lengthened by 500 mm at its east end (the two far corner points of its profile,
 * 4.29 to 4.79 m) and `Wand-Int-ERDG-2` deleted. Real parser, real geometry with the diff fingerprints on, the real WHATCHANGED run, and the
 * dimensions drawn through DIMALIGNED with the snaps and the element boxes the drawing gives it.
 */

const LONG = 'Wand-Int-ERDG-4';
const GONE = 'Wand-Int-ERDG-2';

const dir = mkdtempSync(join(tmpdir(), 'dimension-follow-'));
const V2 = join(dir, 'fzk-v2.ifc');

function writeVersion2(): void {
  const text = readFileSync(FZK_HAUS, 'utf8');
  const swap = (s: string, from: string, to: string): string => {
    assert.ok(s.includes(from), `the fixture has ${from}`);
    return s.replace(from, to);
  };
  let v2 = swap(text, '#14986= IFCCARTESIANPOINT((4.29,-0.24));', '#14986= IFCCARTESIANPOINT((4.79,-0.24));');
  v2 = swap(v2, '#14988= IFCCARTESIANPOINT((4.29,0.));', '#14988= IFCCARTESIANPOINT((4.79,0.));');
  const lines = v2.split('\n');
  const kept = lines.filter((l) => !l.startsWith('#17040= IFCWALLSTANDARDCASE'));
  assert.equal(kept.length, lines.length - 1, 'one wall is taken out');
  writeFileSync(V2, kept.join('\n'));
}

describe('dimensions follow a new version of the model (#459)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  let view: ProjectView;
  let set: ReferenceSet;
  let drawing: Drawing2D;

  const label = (d: DraftEntity): string => (d.shape.type === 'dimension' ? dimensionLayout(d.shape).label : '');
  const dimensions = (): DraftEntity[] => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');

  /** The corners of the wall's outline on one side: the side with the largest `y` (a long wall) or `x` (a short one). */
  function ends(name: string): [Pt, Pt] {
    const ring = drawing.cutPolygons.find((c) => c.entityId === model.idsByName.get(name))!.polygon.outer;
    const edge = name === LONG ? ring.filter((q) => q.y === Math.max(...ring.map((p) => p.y))) : ring.filter((q) => q.x === Math.max(...ring.map((p) => p.x)));
    const axis = name === LONG ? 'x' : 'y';
    const snap = (q: Pt): Pt => findSnap(q, set.shapes, null, { tolerance: 0.02, modes: new Set(['endpoint']), from: null })!.point;
    return [snap(edge.reduce((m, q) => (q[axis] < m[axis] ? q : m))), snap(edge.reduce((m, q) => (q[axis] > m[axis] ? q : m)))];
  }

  /** DIMALIGNED, the way the pointer drives it: the points as the snaps resolve them, then where the line goes. */
  function dimension(a: Pt, b: Pt): DraftEntity {
    const ctx = {
      viewId: view.id, layerId: '0', settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard', dimContinuous: false },
      entities: () => dimensions(), say: () => {},
      elementBoxesAt: (p: Pt) => referenceElementBoxes(set, p, 0.02, renderIdGlobalId),
    } as unknown as DraftContext;
    const step = dimAlignedCommand.create(ctx);
    step.onPoint?.(a);
    step.onPoint?.(b);
    step.onPoint?.({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 0.6 });
    return dimensions().at(-1)!;
  }

  let longDim: DraftEntity, goneDim: DraftEntity, freeDim: DraftEntity;
  let said: string[];
  /** GlobalIds of the walls, read while version 1 is loaded (a deleted wall's renderer id no longer resolves). */
  let longGuid: string, goneGuid: string;

  before(async () => {
    writeVersion2();
    model = await loadPlanModel(FZK_HAUS, { geometryHashes: true });
    resetProject();
    clearDraftHistory();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((x) => x.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    view = elevationMarkPlan(useProjectStore.getState().views)!;
    drawing = await model.planOf(view);
    set = referenceSet(drawing, false);

    longGuid = renderIdGlobalId(model.idsByName.get(LONG)!)!;
    goneGuid = renderIdGlobalId(model.idsByName.get(GONE)!)!;
    // Version 1: a dimension along each wall, snapped to its corners, and one drawn in the open.
    const [la, lb] = ends(LONG);
    longDim = dimension(la, lb);
    const [ga, gb] = ends(GONE);
    goneDim = dimension(ga, gb);
    freeDim = dimension({ x: 20, y: -2 }, { x: 22.5, y: -2 });
    assert.equal(label(longDim), '4.29');

    // Open version 2 the way the WHATCHANGED panel does: the project keeps the old model's state as its reference, the new one loads.
    useProjectStore.setState({ modelState: (await currentSnapshot())!, dirty: true });
    await loadPlanModel(V2, { geometryHashes: true });
    said = [];
    await runWhatChanged('compare', (t) => said.push(t));
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  const current = (d: DraftEntity): DraftEntity => useProjectStore.getState().drafts.find((x) => x.id === d.id)!;

  it('attaches a snapped dimension to the elements at its ends, and not a free one', () => {
    assert.equal(anchorsOf(longDim).length, 2);
    assert.deepEqual(anchorsOf(longDim).map((x) => x.anchor.g), Array(2).fill(longGuid));
    assert.equal(anchorsOf(freeDim).length, 0, 'a dimension drawn in the open names no element');
  });

  it('reads the new length of the lengthened wall after the new version is opened', () => {
    assert.match(said.join('\n'), /2 elements changed/);
    const d = current(longDim);
    assert.equal(label(d), '4.79', 'was 4.29 before the follow (and is 4.29 on main, which leaves the figure where it was)');
    if (d.shape.type !== 'dimension' || longDim.shape.type !== 'dimension') return assert.fail();
    assert.ok(Math.abs(d.shape.a.x - longDim.shape.a.x) < 1e-6, 'the west end stays at the wall end');
    assert.ok(Math.abs(d.shape.b.x - (longDim.shape.b.x + 0.5)) < 1e-6, 'the east end goes with the wall end');
    assert.ok(Math.abs(d.shape.at.y - longDim.shape.at.y) < 1e-6, 'the dimension line keeps its offset');
  });

  it('follows once: opening the same comparison again does not move it twice', async () => {
    await runWhatChanged('compare', () => {});
    assert.equal(label(current(longDim)), '4.79');
  });

  it('leaves a dimension that was drawn in the open exactly as it was', () => {
    assert.deepEqual(current(freeDim), freeDim);
  });

  it('keeps the dimension to the deleted wall and lists it in What is missing', () => {
    const d = current(goneDim);
    assert.deepEqual(d.shape, goneDim.shape, 'kept, where it was');
    const exists = new Set([...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []).map((mesh) => renderIdGlobalId(mesh.expressId)));
    assert.ok(exists.has(longGuid) && !exists.has(goneGuid), 'version 2 has the lengthened wall and not the deleted one');
    const findings = danglingAnnotations({
      views: [{ id: view.id, name: view.name, kind: 'plan' }], sheets: [], projectName: '', drafts: [current(longDim), d, current(freeDim)],
      planElements: () => null, elementExists: (g) => exists.has(g),
    });
    assert.deepEqual(findings.map((f) => [f.draftId, f.params.what]), [[goneDim.id, 'dimension']], 'only the one whose wall is gone');
    assert.deepEqual(findings[0].guids, [goneGuid]);
  });

  it('keeps the attachment through save and reopen', () => {
    const before = current(longDim);
    const file = serializeProject(projectDocument());
    resetProject();
    loadProjectDocument(parseProjectFile(file));
    const d = current(longDim);
    assert.equal(anchorsOf(d).length, 2);
    assert.equal(label(d), '4.79');
    assert.deepEqual(d, before);
  });
});
