/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewCentre, viewExtent, type ModelExtent } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { resetProject, useProjectStore } from '@/project/project-store';
import { publishSetExtent } from '@/project/set-extent';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { useSheetContent } from './useSheetContent';

/**
 * A plan of the set is framed and clipped on the building, as the engine's sheet frames it (`boundsInRoom`), not on
 * an element the framing left out of the extent. skolebygg (ISSUE_068) carries a survey marker 161 m from the
 * building: a frame fitted to the whole drawing grew about 315 mm on the paper to hold it, and the marker was drawn.
 * Measured on the sheet as drawn: the frame is no larger than the plan's room and its margin, the building is inside
 * it and the marker outside it.
 */

const extent: ModelExtent = { min: { x: -45, y: 0, z: -42 }, max: { x: 45, y: 30, z: 42 } };
const plan = { id: 'p', kind: 'plan', name: 'Plan 01', createdAt: 0, level: { name: 'Plan 01', elevation: 3, storeyGlobalIds: [] }, cutHeight: 1.2 } as ProjectView;
const centre = viewCentre(plan, extent) ?? { x: 0, y: 0 };
const room = viewExtent(plan, extent);
const SCALE = 200;
const K = 1000 / SCALE;

const ring = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const BUILDING = ring(-26, -40.5, 44, 28.5);
const MARKER = ring(-140, 118, -138, 120);
const drawing = {
  bounds: { min: { x: -140, y: -40.5 }, max: { x: 44, y: 120 } },
  config: { plane: { axis: 'y', position: 4.2, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 1 },
  lines: [],
  cutPolygons: [
    { polygon: { outer: BUILDING, holes: [] }, entityId: 3, ifcType: 'IfcSlab', modelIndex: 0, isCut: true },
    { polygon: { outer: MARKER, holes: [] }, entityId: 549031, ifcType: 'IfcBuildingElementProxy', modelIndex: 0, isCut: true },
  ],
  projectionPolygons: [],
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 2, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;
const sheet: ProjectSheet = {
  id: 's', number: 'A-101', name: 'Floor plans 1', createdAt: 0, paper: 'A0', orientation: 'landscape',
  viewports: [{ id: 'vp', viewId: 'p', x: 400, y: 400, scale: SCALE, width: 0, height: 0, center: centre }],
};

function Sheet() {
  const s = useProjectStore((st) => st.sheets[0]);
  const { content } = useSheetContent(s);
  return <SheetPaper sheet={s} projectName="School" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />;
}

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
  useProjectStore.setState({ views: [plan], sheets: [sheet] });
  patchViewDrawing('p', { status: 'ready', drawing });
  publishSetExtent(extent);
});
afterEach(() => {
  cleanup();
  publishSetExtent(null);
});

describe('a plan framed on the building, not on a far element (skolebygg survey marker)', () => {
  it('frames the building within its room and clips the marker', () => {
    const ui = render(<Sheet />);
    const clip = ui.querySelector('g[data-viewport-id="vp"] clipPath rect');
    assert.ok(clip, 'the viewport clips its drawing');
    const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(clip.getAttribute(a)));
    assert.ok(w <= room.w * K + 20 + 1e-6 && h <= room.h * K + 20 + 1e-6, `the frame is ${w.toFixed(0)} x ${h.toFixed(0)} mm, its room and margin ${(room.w * K + 20).toFixed(0)} x ${(room.h * K + 20).toFixed(0)} mm`);
    // The sheet puts `centre` at the viewport's position, a drawing metre at K paper mm (a plan's y runs down the paper).
    const onPaper = (p: { x: number; y: number }) => ({ x: 400 + (p.x - centre.x) * K, y: 400 + (p.y - centre.y) * K });
    const inside = (p: { x: number; y: number }) => p.x >= x - 1e-6 && p.x <= x + w + 1e-6 && p.y >= y - 1e-6 && p.y <= y + h + 1e-6;
    assert.ok(BUILDING.map(onPaper).every(inside), 'the building is inside its frame');
    assert.ok(MARKER.map(onPaper).every((p) => !inside(p)), 'the marker is outside the frame, so it is clipped');
  });
});
