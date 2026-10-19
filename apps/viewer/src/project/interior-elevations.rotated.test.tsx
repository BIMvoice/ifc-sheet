/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Left and right on an interior elevation of a room whose walls are not on
 * the axes. The fixture `public/_fixtures/rotated-room.ifc` is hand-written
 * IFC4 (made for this test; its FILE_DESCRIPTION says so): one room 4 m by
 * 3 m inside, its storey turned 30 degrees counter-clockwise, a window W1 in
 * the north wall 0.55 m to 1.25 m from its west end and a window W2 in the
 * east wall 0.4 m to 1.0 m from its north end: each near the end on your left
 * when you stand in the room facing its wall. Each must be drawn at the left
 * of its elevation as placed on the sheet, measured in paper millimetres
 * through the sheet's own transform (`viewportTransform`, `drawingToScreen`),
 * not in drawing coordinates, because the sheet mirrors a drawing whose plane
 * axis is `side`. The north wall's plane is a `front` cut, the east wall's a
 * `side` cut, so both branches of `interiorPlane` are held.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult } from '@ifc-lite/geometry';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { AXIS_NAME, viewportTransform } from '@/components/viewer/sheets/SheetPaper';
import { drawingToScreen } from '@/drafting/frame';
import { interiorElevationSheet, interiorElevationViews, type InteriorElevationView } from './interior-elevations';
import { roomGeometry } from './interior-room';

const ROTATED = new URL('../../public/_fixtures/rotated-room.ifc', import.meta.url);

let geometry: GeometryResult | null = null;
before(async () => { geometry = await meshFile(ROTATED); });

function views(g: GeometryResult): InteriorElevationView[] {
  const space = g.meshes.find((m) => m.ifcType === 'IfcSpace');
  assert.ok(space, 'the fixture has its room');
  const room = roomGeometry(g.meshes, space.expressId);
  assert.ok(room, 'the room has a footprint');
  return interiorElevationViews({ guid: 'G-ROOM', label: '1 Rotated room', ...room });
}

/** Where a window is drawn across its elevation on the sheet, as fractions of the drawing's width from its left edge. */
async function windowOnSheet(g: GeometryResult, made: InteriorElevationView[], side: 'north' | 'east', windowName: string): Promise<{ from: number; to: number; axis: string }> {
  const view = made.find((v) => v.direction === side)!;
  const drawing = await viewDrawing({ ...view, createdAt: 0 }, g);
  assert.ok(drawing, `the ${side} elevation draws`);
  const ids = new Set(g.meshes.filter((m) => m.ifcType === 'IfcWindow').map((m) => m.expressId));
  // Only one window stands in each wall: the other one is behind the viewer or beside the crop.
  const lines = drawing.lines.filter((l) => ids.has(l.entityId));
  assert.ok(lines.length > 0, `${windowName} is seen from inside the room`);
  assert.equal(new Set(lines.map((l) => l.entityId)).size, 1, `only ${windowName} is in the ${side} elevation`);
  const sheet = interiorElevationSheet('1 Rotated room', made, []);
  const vp = sheet.viewports!.find((v) => v.viewId === view.id)!;
  const axis = AXIS_NAME[drawing.config.plane.axis];
  const t = viewportTransform(vp, drawing, axis);
  const paperX = (x: number) => drawingToScreen({ x, y: 0 }, t, axis).x;
  const xs = lines.flatMap((l) => [paperX(l.line.start.x), paperX(l.line.end.x)]);
  const edges = [paperX(drawing.bounds.min.x), paperX(drawing.bounds.max.x)];
  const left = Math.min(...edges), width = Math.abs(edges[1] - edges[0]);
  return { from: (Math.min(...xs) - left) / width, to: (Math.max(...xs) - left) / width, axis };
}

describe('interior elevations of a room turned 30 degrees', () => {
  it('gives one elevation per wall, named by the side the wall is on, clockwise from north', (t) => {
    if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
    const made = views(geometry);
    assert.deepEqual(made.map((v) => v.name), ['1 Rotated room – North', '1 Rotated room – East', '1 Rotated room – South', '1 Rotated room – West']);
    const widths = made.map((v) => v.interior.crop.max.x - v.interior.crop.min.x);
    for (const [w, want] of widths.map((w, i) => [w, i % 2 === 0 ? 4 : 3])) assert.ok(Math.abs(w - want) < 0.01, `wall ${want} m drawn ${w} m wide`);
  });

  it('draws W1, near the left end of the north wall, at the left of that elevation on the sheet (a front cut)', async (t) => {
    if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
    const { from, to, axis } = await windowOnSheet(geometry, views(geometry), 'north', 'W1');
    assert.equal(axis, 'front');
    // 0.55 m to 1.25 m of the 4 m wall from its left end: 13.75 % to 31.25 % of the width.
    assert.ok(Math.abs(from - 0.1375) < 0.01 && Math.abs(to - 0.3125) < 0.01, `W1 drawn from ${(from * 100).toFixed(1)} % to ${(to * 100).toFixed(1)} % of the width`);
  });

  it('draws W2, near the left end of the east wall, at the left of that elevation on the sheet (a side cut)', async (t) => {
    if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
    const { from, to, axis } = await windowOnSheet(geometry, views(geometry), 'east', 'W2');
    assert.equal(axis, 'side');
    // 0.4 m to 1.0 m of the 3 m wall from its left end: 13.3 % to 33.3 % of the width.
    assert.ok(Math.abs(from - 0.4 / 3) < 0.01 && Math.abs(to - 1 / 3) < 0.01, `W2 drawn from ${(from * 100).toFixed(1)} % to ${(to * 100).toFixed(1)} % of the width`);
  });
});
