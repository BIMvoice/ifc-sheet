/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Interior elevations on a real model (AC20-FZK-Haus, meshed by the engine
 * the viewer loads), drawn the way an open view draws them
 * (`view-drawing-harness`): a rectangular room gives four elevations, each
 * cropped to its wall, with nothing from beyond the room in them; and the
 * facade elevations and sections draw exactly what they drew before interior
 * elevations existed.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { closedEnds, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { interiorElevationSheet, interiorElevationViews, type InteriorElevationView } from './interior-elevations';
import { roomGeometry } from './interior-room';
import type { ElevationDirection, ProjectView } from './types';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
/** Two rectangular ground floor rooms side by side: Buero (2) and Bad (3); Bad's door opens to the hall through the same wall as Buero's. */
const BUERO = 21640;
const BAD = 21283;
const BAD_DOOR = 19199;
const BUERO_DOOR = 19504;

let geometry: GeometryResult | null = null;
before(async () => { geometry = await meshFile(FZK); });

type Box = { min: number[]; max: number[] };
function boxOf(meshes: readonly MeshData[], id: number): Box {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    if (m.expressId !== id) continue;
    for (let i = 0; i < m.positions.length; i++) {
      const v = m.positions[i] + (m.origin?.[i % 3] ?? 0);
      min[i % 3] = Math.min(min[i % 3], v);
      max[i % 3] = Math.max(max[i % 3], v);
    }
  }
  return { min, max };
}

const entities = (d: Drawing2D | null) => new Set((d?.lines ?? []).map((l) => l.entityId));

function viewsOf(g: GeometryResult, id: number): InteriorElevationView[] {
  const room = roomGeometry(g.meshes, id);
  assert.ok(room, `room ${id} has a footprint`);
  return interiorElevationViews({ guid: `G-${id}`, label: String(id), ...room });
}

const asView = (v: InteriorElevationView): Extract<ProjectView, { kind: 'elevation' }> => ({ ...v, createdAt: 0 });

describe('interior elevations of an FZK-Haus room', () => {
  for (const id of [BUERO, BAD]) {
    it(`room ${id}: four elevations, each as wide as its wall and as high as the room`, (t) => {
      if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
      const views = viewsOf(geometry, id);
      // The oracle is the space's own box: the room is a rectangle on the axes, so its walls are as long as the box is wide or deep.
      const box = boxOf(geometry.meshes, id);
      const across = { north: box.max[0] - box.min[0], south: box.max[0] - box.min[0], east: box.max[2] - box.min[2], west: box.max[2] - box.min[2] };
      assert.deepEqual(views.map((v) => v.direction).sort(), ['east', 'north', 'south', 'west']);
      for (const v of views) {
        const { crop } = v.interior;
        assert.ok(Math.abs(crop.max.x - crop.min.x - across[v.direction]) < 0.01, `${v.name}: crop ${crop.max.x - crop.min.x} vs wall ${across[v.direction]}`);
        assert.ok(Math.abs(crop.min.y - box.min[1]) < 0.01 && Math.abs(crop.max.y - box.max[1]) < 0.01, `${v.name}: floor to top`);
      }
    });
  }

  it('each drawing is cropped to its wall and shows nothing from beyond the room', async (t) => {
    if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
    const g = geometry;
    const room = boxOf(g.meshes, BUERO);
    const reach = 0.3 + 0.01; // INTERIOR_ELEVATION_DEFAULTS.beyond, and a centimetre
    const drawn = new Set<number>();
    for (const v of viewsOf(g, BUERO)) {
      const d = await viewDrawing(asView(v), g);
      assert.ok(d && d.lines.length > 0, `${v.name} draws`);
      const { crop } = v.interior;
      // The drawing is its wall, floor to top, and the side walls cut at either end: no wider than a wall's thickness past each end.
      const b = d.bounds;
      assert.deepEqual([b.min.y, b.max.y], [crop.min.y, crop.max.y], `${v.name}: floor to top`);
      assert.ok(b.min.x <= crop.min.x && b.min.x > crop.min.x - 0.5 && b.max.x >= crop.max.x && b.max.x < crop.max.x + 0.5, `${v.name}: ${b.min.x}..${b.max.x} for a wall ${crop.min.x}..${crop.max.x}`);
      for (const l of d.lines) {
        for (const p of [l.line.start, l.line.end]) {
          assert.ok(p.x >= b.min.x - 1e-9 && p.x <= b.max.x + 1e-9 && p.y >= b.min.y - 1e-9 && p.y <= b.max.y + 1e-9, `${v.name}: a line leaves the drawing`);
        }
      }
      for (const e of entities(d)) {
        drawn.add(e);
        const b = boxOf(g.meshes, e);
        const meets = b.max[0] >= room.min[0] - reach && b.min[0] <= room.max[0] + reach && b.max[2] >= room.min[2] - reach && b.min[2] <= room.max[2] + reach;
        assert.ok(meets, `${v.name}: #${e} (${g.meshes.find((m) => m.expressId === e)?.ifcType}) stands beyond the room`);
      }
    }
    // The hall wall carries both rooms' doors: Buero's is drawn, the bathroom's next to it is not.
    assert.ok(drawn.has(BUERO_DOOR), 'the room\'s own door is drawn');
    assert.ok(!drawn.has(BAD_DOOR), 'the neighbouring room\'s door is not');
  });

  for (const id of [BUERO, BAD]) {
    it(`room ${id}: every elevation is closed at both ends by the side walls, cut`, async (t) => {
      if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
      for (const v of viewsOf(geometry, id)) {
        const d = await viewDrawing(asView(v), geometry);
        assert.ok(d, `${v.name} draws`);
        assert.deepEqual(closedEnds(d, v.interior.crop), { left: true, right: true }, `${v.name} is closed at both ends`);
      }
    });
  }

  it('hangs all of a room\'s elevations on one sheet', (t) => {
    if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
    const views = viewsOf(geometry, BUERO);
    // Its own series, after the room sheets already made (PR #120 review): not next to the facade elevations.
    const sheet = interiorElevationSheet('2 Buero', views, [{ number: 'A-201' }, { number: 'A-202' }, { number: 'A-401' }]);
    assert.deepEqual(sheet.viewports?.map((vp) => vp.viewId), views.map((v) => v.id));
    assert.equal(sheet.number, 'A-402');
    assert.equal(sheet.name, '2 Buero – Interior elevations');
    assert.deepEqual(new Set(sheet.viewports?.map((vp) => vp.scale)), new Set([50]));
  });
});

/**
 * Facade elevations and sections draw what they drew before: fingerprints of
 * their drawings recorded on main (b023c90) with this harness, before any
 * source change for interior elevations.
 */
describe('facade elevations and sections are unchanged', () => {
  function fingerprint(d: Drawing2D | null): string {
    if (!d) return 'null';
    let h = 0;
    const mix = (n: number) => { h = (Math.imul(h, 31) + Math.round(n * 1000)) | 0; };
    for (const l of d.lines) { mix(l.line.start.x); mix(l.line.start.y); mix(l.line.end.x); mix(l.line.end.y); mix(l.entityId); }
    for (const p of [...d.cutPolygons, ...(d.projectionPolygons ?? [])]) for (const q of p.polygon.outer) { mix(q.x); mix(q.y); }
    return `${d.lines.length}/${d.cutPolygons.length}/${d.projectionPolygons?.length ?? 0}/${h}`;
  }
  const ON_MAIN: Record<string, string> = {
    north: '200/0/0/805198097', south: '241/0/0/1942490408', east: '374/0/0/-1670670891', west: '433/0/0/-189981305',
    'north-deep': '200/0/0/2058618608', 'south-deep': '258/0/0/1672430668', 'east-deep': '371/0/0/-464167292', 'west-deep': '371/0/0/-1001212464',
    s1: '712/84/0/1814603118', s2: '2008/32/0/1592352504', s3: '1901/43/0/-787997569',
  };
  const s = Math.SQRT1_2;
  const OFFSETS: Record<ElevationDirection, number> = { north: -12, south: 1, west: -2, east: 14 };
  const VIEWS: Exclude<ProjectView, { kind: '3d' }>[] = [
    ...(['north', 'south', 'east', 'west'] as const).flatMap((direction): Exclude<ProjectView, { kind: '3d' }>[] => [
      { id: direction, name: direction, kind: 'elevation', direction, createdAt: 0 },
      { id: `${direction}-deep`, name: direction, kind: 'elevation', direction, createdAt: 0, viewDepth: 8, planeOffset: OFFSETS[direction] },
    ]),
    { id: 's1', name: 's1', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -5, flipped: false }, viewDepth: 5 },
    { id: 's2', name: 's2', kind: 'section', createdAt: 0, plane: { axis: 'side', offset: 6, flipped: true } },
    { id: 's3', name: 's3', kind: 'section', createdAt: 0, viewDepth: 6, plane: { axis: 'side', offset: 6, flipped: false, custom: { normal: [s, 0, s], distance: 0, pickedAt: [5, 1, -5], tangent: [s, 0, -s], bitangent: [0, 1, 0] } } },
  ];
  for (const view of VIEWS) {
    it(`${view.id} draws as on main`, async (t) => {
      if (!geometry) { t.skip('needs the wasm runtime (pnpm build:wasm:fetch)'); return; }
      assert.equal(fingerprint(await viewDrawing(view, geometry)), ON_MAIN[view.id]);
    });
  }
});
