/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { boxOf, overlaps, overlayObstacleBoxes, type Box } from '@/drafting/cross-ref-marks';
import { textBox } from '@/drafting/annotation';
import { modelLevels } from '@/project/model-levels';
import { planOverlays } from '@/project/plan-overlays';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { PlanProjectView, ProjectView } from '@/project/types';
import { useViewerStore } from '@/store';
import type { MeshData } from '@ifc-lite/geometry';
import { ceilTag } from './ceiltag.js';

/**
 * #271: CEILTAG put a tag at the centroid of its ceiling and looked at nothing else, so a tag could print over a
 * door leaf and its swing. The doors are the real ones of AC20-FZK-Haus, drawn by the real symbol code; the
 * ceiling is a slab laid so that its centroid falls on a door.
 */

describe('CEILTAG keeps a tag off the door leaves and swings the plan draws (#271)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let view: PlanProjectView;
  let meshes: MeshData[];
  let doors: Box[];
  let slab: { x: number; y: number };

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { levels } = useProjectStore.getState();
    const ground = [...levels].sort((a, b) => a.elevation - b.elevation)[0]!;
    useProjectStore.setState({ levels: [ground] });
    view = { id: 'rcp', kind: 'plan', name: 'Ground ceiling', createdAt: 0, scale: 100, level: ground, cutHeight: 1.2, reflected: true };
    const { models } = useViewerStore.getState();
    meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const plane = viewPlaneConfig(view, [ground], null);
    assert.ok(plane);
    doors = overlayObstacleBoxes(planOverlays(view, plane, meshes, undefined, new Set()));
    assert.ok(doors.length > 0, 'the plan draws door and window symbols');
    // The widest box among them is a swing or a leaf: lay the ceiling about its centre.
    const biggest = [...doors].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0]!;
    slab = { x: (biggest.x0 + biggest.x1) / 2, y: (biggest.y0 + biggest.y1) / 2 };
  });
  afterEach(() => publishDrawingRuntime(null));

  const run = (): { box: Box } | null => {
    resetProjectDrafts();
    const ceiling = {
      expressId: 999999, ifcType: 'IfcCovering',
      positions: new Float32Array([slab.x - 1.5, 2.7, slab.y - 1.5, slab.x + 1.5, 2.7, slab.y - 1.5, slab.x + 1.5, 2.7, slab.y + 1.5, slab.x - 1.5, 2.7, slab.y + 1.5]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    publishDrawingRuntime({ geometryResult: { meshes: [...meshes, ceiling], coordinateInfo: useViewerStore.getState().geometryResult?.coordinateInfo } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    const ctx = {
      viewId: 'rcp', layerId: '0', settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
      view: () => view as ProjectView, entities: () => useProjectStore.getState().drafts, say: () => {},
    } as unknown as Parameters<typeof ceilTag>[0];
    ceilTag(ctx, (id) => id === 999999, () => 'FZKCEIL0000000000000001');
    const tag = useProjectStore.getState().drafts.find((d) => d.params.ceilingOf !== undefined);
    if (!tag || tag.shape.type !== 'text') return null;
    const box = boxOf(textBox(tag.shape.p, tag.shape.text, tag.shape.height, 0));
    return { box };
  };
  const resetProjectDrafts = (): void => { useProjectStore.setState({ drafts: [] }); clearDraftHistory(); };

  it('puts the tag of a ceiling whose centre is a door swing beside the swing, not on it', () => {
    const tag = run();
    assert.ok(tag, 'the ceiling is tagged');
    const hit = doors.filter((d) => overlaps(tag.box, d, 0));
    assert.equal(hit.length, 0, `the tag at ${tag.box.x0.toFixed(2)}, ${tag.box.y0.toFixed(2)} meets ${hit.length} door or window boxes`);
  });
});
