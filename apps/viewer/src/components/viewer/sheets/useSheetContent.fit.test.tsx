/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import type { DraftEntity } from '@/drafting/types';
import { mmPerMetre } from '@/project/sheets';
import { useSheetContent, type SheetContent } from './useSheetContent.js';
import { viewportTransform } from './SheetPaper.js';

/**
 * Issue #140: an auto-fit viewport's extent is the model drawing's bounds
 * together with its view's drafts, so a dimension drawn outside the walls
 * prints. A viewport with a manual size keeps cropping: that is what the
 * crop is for.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const other: ProjectView = { id: 'q', kind: 'plan', name: 'First', createdAt: 0, level: { name: 'First', elevation: 3, storeyGlobalIds: [] }, cutHeight: 1.2 };
const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 10, y: 8 } };
const drawing = { lines: [], cutPolygons: [], projectionPolygons: [], bounds: BOUNDS, config: { plane: { axis: 'y', position: 1.2, flipped: false } } } as unknown as Drawing2D;
const auto: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 100, width: 0, height: 0, center: null };
const sheetOf = (vp: SheetViewport): ProjectSheet => ({ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] });

/** An overall dimension string 3 m beyond the right-hand wall, its line 2 m below the model. */
const outside = (viewId: string): DraftEntity => ({
  id: `d-${viewId}`, viewId, layerId: '0', params: {},
  shape: { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 13, y: 0 }, at: { x: 6.5, y: -2 }, height: 0.25 },
});

let hook: SheetContent | null = null;
function Harness({ sheet }: { sheet: ProjectSheet }) {
  hook = useSheetContent(sheet);
  return null;
}

function setup(vp: SheetViewport, drafts: DraftEntity[]): SheetContent {
  const sheet = sheetOf(vp);
  useProjectStore.setState({ views: [plan, other], sheets: [sheet], drafts });
  useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
  render(<Harness sheet={sheet} />);
  assert.ok(hook);
  return hook;
}

/** Where a drawing point lands on the paper, and the viewport's box there. */
function onPaper(c: SheetContent, vp: SheetViewport, p: { x: number; y: number }) {
  const t = viewportTransform(vp, c.content(vp).drawing, 'down');
  const box = c.boxOf(vp);
  return { at: { x: p.x * t.scale + t.x, y: p.y * t.scale + t.y }, left: vp.x - box.width / 2, right: vp.x + box.width / 2, top: vp.y - box.height / 2, bottom: vp.y + box.height / 2 };
}
const inside = (r: ReturnType<typeof onPaper>) => r.at.x >= r.left && r.at.x <= r.right && r.at.y >= r.top && r.at.y <= r.bottom;

beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  hook = null;
  useViewDrawings.setState({ byView: {} });
});

describe('an auto-fit viewport holds its view\'s drafts (#140)', () => {
  it('fits a dimension drawn outside the model, and prints it inside the box', () => {
    const c = setup(auto, [outside('p')]);
    const k = mmPerMetre(auto);
    // The model alone is 10 m wide; the dimension reaches x = 13.
    assert.ok(c.boxOf(auto).width >= 13 * k, `box ${c.boxOf(auto).width} mm holds 13 m at ${k} mm/m`);
    for (const p of [{ x: 0, y: 0 }, { x: 13, y: 0 }, { x: 6.5, y: -2 }]) assert.ok(inside(onPaper(c, auto, p)), `${JSON.stringify(p)} is inside the box`);
  });

  it('leaves a viewport alone when its drafts sit inside the model', () => {
    const noDrafts = setup(auto, []).boxOf(auto);
    cleanup();
    const inner: DraftEntity = { ...outside('p'), shape: { type: 'line', a: { x: 1, y: 1 }, b: { x: 9, y: 7 } } };
    assert.deepEqual(setup(auto, [inner]).boxOf(auto), noDrafts);
  });

  it('ignores the drafts of other views', () => {
    const alone = setup(auto, []).boxOf(auto);
    cleanup();
    assert.deepEqual(setup(auto, [outside('q')]).boxOf(auto), alone);
  });

  it('keeps a manual crop: the box and the drawing do not move', () => {
    const manual: SheetViewport = { ...auto, width: 90, height: 70 };
    const bare = setup(manual, []);
    const before = onPaper(bare, manual, { x: 5, y: 4 });
    cleanup();
    const c = setup(manual, [outside('p')]);
    assert.deepEqual(c.boxOf(manual), { width: 90, height: 70 });
    assert.deepEqual(onPaper(c, manual, { x: 5, y: 4 }), before);
    assert.equal(inside(onPaper(c, manual, { x: 13, y: 0 })), false, 'the crop still clips what is beyond it');
  });
});
