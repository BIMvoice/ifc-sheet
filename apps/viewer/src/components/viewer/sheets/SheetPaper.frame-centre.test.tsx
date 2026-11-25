/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { useSheetContent } from './useSheetContent';

/**
 * A plan of the set is centred on the model's extent (the viewport's `center`), not on its own bounds, so a storey
 * smaller than the building lies to one side of the viewport's position. Its frame, the box the sheet clips the
 * drawing to, was fitted to the bounds around that position and cut the plan off: skolebygg A-102, Plan 03, 36 mm
 * on the right and 34 mm at the top. Measured here on the sheet as drawn: every point of the drawing is inside the
 * rectangle its viewport clips to.
 */

// A storey 70 x 69 m whose middle lies 9 m east and 6 m north of the building's middle (the viewport's `center`).
const OUTER = [{ x: -26, y: -40.5 }, { x: 44, y: -40.5 }, { x: 44, y: 28.5 }, { x: -26, y: 28.5 }];
const drawing = {
  bounds: { min: { x: -26, y: -40.5 }, max: { x: 44, y: 28.5 } },
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 1 },
  lines: [],
  cutPolygons: [{ polygon: { outer: OUTER, holes: [] }, entityId: 3, ifcType: 'IfcSlab', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;
const view = { id: 'v', kind: 'plan', name: 'Plan 03', createdAt: 0, level: { name: 'L3', elevation: 9, storeyGlobalIds: [] }, cutHeight: 1.2 } as unknown as ProjectView;

function Sheet() {
  const s = useProjectStore((st) => st.sheets[0]);
  const { content } = useSheetContent(s);
  return <SheetPaper sheet={s} projectName="School" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />;
}

/** How far, paper mm, the drawing as drawn on the sheet reaches past the rectangle its viewport clips to. */
function pastFrame(vp: SheetViewport): number {
  const sheet: ProjectSheet = { id: 's', number: 'A-102', name: 'Floor plans 2', createdAt: 0, paper: 'A0', orientation: 'landscape', viewports: [vp] };
  useProjectStore.setState({ views: [view], sheets: [sheet] });
  const ui = render(<Sheet />);
  const group = ui.querySelector(`g[data-viewport-id="${vp.id}"]`);
  assert.ok(group, 'the viewport is on the sheet');
  const clip = group.querySelector('clipPath rect');
  assert.ok(clip, 'the viewport clips its drawing');
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(clip.getAttribute(a)));
  const paths = [...group.querySelectorAll('g[clip-path] path')].map((p) => p.getAttribute('d') ?? '').filter((d) => d.length > 0);
  assert.ok(paths.length > 0, 'the drawing is drawn');
  const numbers = paths.flatMap((d) => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number));
  const points = numbers.flatMap((n, i) => (i % 2 === 0 ? [{ x: n, y: numbers[i + 1] }] : []));
  return Math.max(0, ...points.flatMap((p) => [x - p.x, p.x - (x + w), y - p.y, p.y - (y + h)]));
}

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
  patchViewDrawing('v', { status: 'ready', drawing });
});
afterEach(() => cleanup());

describe('the frame of a plan centred on the model, not on its own bounds (skolebygg A-102)', () => {
  it('holds the whole plan where the sheet draws it', () => {
    const past = pastFrame({ id: 'vp', viewId: 'v', x: 700, y: 400, scale: 200, width: 0, height: 0, center: { x: 0, y: 0 } });
    assert.ok(past < 1e-6, `the plan runs ${past.toFixed(1)} mm past its frame`);
  });

  it('a plan centred on its own bounds fits as it did', () => {
    const past = pastFrame({ id: 'vp', viewId: 'v', x: 700, y: 400, scale: 200, width: 0, height: 0, center: null });
    assert.ok(past < 1e-6, `the plan runs ${past.toFixed(1)} mm past its frame`);
  });
});
