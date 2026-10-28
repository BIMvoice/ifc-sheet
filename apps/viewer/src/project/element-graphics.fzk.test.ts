/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall of AC20-FZK-Haus hidden in one plan, through the real pipeline (parser, wasm geometry, section generator, the view's
 * hidden elements, `styledDrawing`) (#33): the wall is gone from that plan's faces and lines, still in another plan of the same
 * storey, and in the model the 3D view draws; an element override reaches the pens of that wall alone (#32). The wall is found by
 * GlobalId, which is what the project file keeps, not by the renderer id the drawing carries.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { renderIdGlobalId } from './element-guid';
import { planViewFor } from './view-defaults';
import type { ProjectView, ViewGraphics } from './types';

describe('one FZK wall hidden in one plan', { skip: planModelMissing(FZK_HAUS) }, () => {
  let m: LoadedPlanModel;
  let ground: ProjectView;
  let wall: { id: number; globalId: string };
  let otherWall: number;

  const plan = (extra: Partial<ProjectView> & { graphics?: ViewGraphics }): ProjectView => ({ ...ground, ...extra }) as ProjectView;
  const MM = { scale: 1000, x: 0, y: 0 };

  before(async () => {
    m = await loadPlanModel(FZK_HAUS);
    const level = m.levels.find((l) => l.name === 'Erdgeschoss');
    assert.ok(level, 'the model has a ground floor');
    ground = { ...planViewFor(level, []), createdAt: 0, id: 'v-ground' } as ProjectView;
    const drawn = await m.planOf(ground);
    const walls = drawn.cutPolygons.filter((p) => p.ifcType === 'IfcWallStandardCase').map((p) => p.entityId);
    const first = walls[0];
    otherWall = walls.find((id) => id !== first)!;
    wall = { id: first, globalId: renderIdGlobalId(first)! };
  });

  it('finds the wall by GlobalId', () => {
    assert.match(wall.globalId, /^[0-9A-Za-z_$]{22}$/);
    assert.notEqual(otherWall, undefined);
  });

  it('is gone from that plan\'s faces and lines, and still in another plan and in the 3D model', async () => {
    const hidden = await m.planOf(plan({ graphics: { hiddenElements: [wall.globalId] } }));
    const another = await m.planOf(plan({ id: 'v-ground-2', graphics: undefined }));
    const control = await m.planOf(ground);
    assert.ok(m.drawnIds(control).has(wall.id), 'the wall is in the plan as it was');
    assert.ok(!m.drawnIds(hidden).has(wall.id), 'the wall is not in the plan that hides it');
    assert.ok(m.drawnIds(hidden).has(otherWall), 'the other walls are');
    assert.ok(m.drawnIds(another).has(wall.id), 'and it is in another plan of the same storey');
    assert.deepEqual([...m.drawnIds(another)].sort(), [...m.drawnIds(control)].sort());
    // The model, and so the 3D view, still has it: hiding is a statement about one view.
    const meshes = [...useViewerStore.getState().models.values()].flatMap((model) => model.geometryResult?.meshes ?? []);
    assert.ok(meshes.some((mesh) => mesh.expressId === wall.id));
  });

  it('keeps the wall gone when the plan is rebuilt: the key is the GlobalId', async () => {
    const view = plan({ graphics: JSON.parse(JSON.stringify({ hiddenElements: [wall.globalId] })) as ViewGraphics });
    const again = await m.planOf(view);
    assert.ok(!m.drawnIds(again).has(wall.id));
  });

  it('an override draws that wall dashed and grey, over its category\'s colour; the other walls keep the category\'s', async () => {
    const graphics: ViewGraphics = {
      categories: { walls: { lineColor: '#cc0000', lineWeight: 'heavy' } },
      elements: { [wall.globalId]: { lineColor: '#808080', lineStyle: 'dashed' } },
    };
    const styled = await m.planOf(plan({ graphics }));
    const only = (id: number): Drawing2D => ({ ...styled, cutPolygons: styled.cutPolygons.filter((p) => p.entityId === id), lines: styled.lines.filter((l) => l.entityId === id) }) as Drawing2D;
    const penStrokes = (id: number) => viewportPens(only(id), graphics, MM, 'down', []).filter((p) => p.layer === 'CUT' || p.layer === 'SEEN');
    const mine = penStrokes(wall.id);
    assert.ok(mine.length > 0, 'the wall draws lines');
    assert.ok(mine.every((p) => p.stroke === '#808080' && p.dash), JSON.stringify(mine.map((p) => [p.stroke, p.dash])));
    const theirs = penStrokes(otherWall);
    assert.ok(theirs.length > 0 && theirs.every((p) => p.stroke === '#cc0000' && !p.dash), JSON.stringify(theirs.map((p) => [p.stroke, p.dash])));
  });
});
