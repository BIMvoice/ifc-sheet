/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { elementViews, elementFrame, type ElementViews } from './element-views';

const mm = (m: number) => Math.round(m * 1000);

/** A box `w` x `d` x `h` (metres) on the ground, its width along `angle` radians in plan, as a mesh. */
function box(w: number, d: number, h: number, angle = 0, at = { x: 10, z: 20 }): MeshData {
  const c = Math.cos(angle), s = Math.sin(angle);
  const pts: number[] = [];
  for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, h], [1, -1, h], [1, 1, h], [-1, 1, h]]) {
    const u = (a * w) / 2, v = (b * d) / 2;
    pts.push(at.x + u * c - v * s, y, at.z + u * s + v * c);
  }
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { expressId: 1, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
}

const extent = (v: { min: { x: number; y: number }; max: { x: number; y: number } }) => ({ w: v.max.x - v.min.x, h: v.max.y - v.min.y });

describe('the frame of an element read from its mesh', () => {
  it('finds width, thickness and height of a box turned in plan', () => {
    const f = elementFrame([box(1.2, 0.2, 1.5, 0.6)]);
    assert.ok(f);
    assert.equal(mm(f.width), 1200);
    assert.equal(mm(f.depth), 200);
    assert.equal(mm(f.height), 1500);
  });

  it('puts the exterior on the side facing away from the building', () => {
    const away = elementFrame([box(1, 0.2, 2, 0)], { x: 10, z: 0 });
    assert.ok(away);
    assert.ok(away.nz > 0.99, 'the building lies at z=0, the exterior is +z');
    const other = elementFrame([box(1, 0.2, 2, 0)], { x: 10, z: 40 });
    assert.ok(other && other.nz < -0.99);
  });
});

describe('placement of the mesh', () => {
  it('reads positions as origin + position, as the renderer does, and leaves instancing templates out', () => {
    const local = { ...box(1, 0.2, 2, 0, { x: 0, z: 0 }), origin: [10, 0, 20] as [number, number, number] };
    const f = elementFrame([local]);
    assert.ok(f);
    assert.ok(Math.abs(f.ox - 10) < 1e-4 && Math.abs(f.oz - 20) < 1e-4, `the frame stands at the origin: ${f.ox}, ${f.oz}`);
    assert.equal(elementFrame([{ ...local, geometryClass: 2 }]), null, 'a template is not the element');
  });
});

describe('the three views of a box window', () => {
  it('front, plan and section have the width, thickness and height of the box, whatever its angle', async () => {
    const v = await elementViews([box(1.2, 0.2, 1.5, 0.6)]);
    assert.ok(v);
    assert.deepEqual([mm(extent(v.front).w), mm(extent(v.front).h)], [1200, 1500]);
    assert.deepEqual([mm(extent(v.plan).w), mm(extent(v.plan).h)], [1200, 200]);
    assert.deepEqual([mm(extent(v.section).w), mm(extent(v.section).h)], [200, 1500]);
  });

  it('cuts the plan and the section (cut lines) and only sees the front', async () => {
    const v = await elementViews([box(1.2, 0.2, 1.5)]);
    assert.ok(v);
    assert.ok(v.plan.lines.some((l) => l.kind === 'cut'));
    assert.ok(v.section.lines.some((l) => l.kind === 'cut'));
    assert.ok(!v.front.lines.some((l) => l.kind === 'cut'));
    assert.ok(v.plan.lines.some((l) => l.kind === 'hatch'), 'cut faces are hatched');
  });

  it('is null for an element without geometry', async () => {
    assert.equal(await elementViews([]), null);
  });
});

describe('the views of the windows of AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let views: { name: string; v: ElementViews; width: number; height: number }[] = [];
  before(async () => {
    const m = await loadPlanModel(FZK_HAUS);
    const model = useViewerStore.getState().models.get('m')!;
    const ds = model.ifcDataStore!;
    for (const [name, id] of m.idsByName) {
      if (m.classOf(id) !== 'IfcWindow') continue;
      const meshes = model.geometryResult!.meshes.filter((x) => x.expressId === id);
      const v = await elementViews(meshes, { awayFrom: { x: 0, z: 0 } });
      const attrs = [...ds.getEntity(id)!.attributes] as unknown[];
      if (v) views.push({ name, v, height: Number(attrs[8]), width: Number(attrs[9]) });
    }
  });

  it('draws a front view whose outline is the window width and height within 1 mm', () => {
    assert.ok(views.length > 3, `${views.length} windows`);
    for (const { name, v, width, height } of views) {
      const e = extent(v.front);
      assert.ok(Math.abs(e.w - width) < 0.001, `${name}: width ${e.w} vs ${width}`);
      assert.ok(Math.abs(e.h - height) < 0.001, `${name}: height ${e.h} vs ${height}`);
    }
  });

  it('faces the exterior of every window away from the middle of the building', async () => {
    const { elementFrame } = await import('./element-views');
    const m = await loadPlanModel(FZK_HAUS);
    const model = useViewerStore.getState().models.get('m')!;
    const b = model.geometryResult!.coordinateInfo.shiftedBounds;
    const centre = { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 };
    let checked = 0;
    for (const [name, id] of m.idsByName) {
      if (m.classOf(id) !== 'IfcWindow') continue;
      const f = elementFrame(model.geometryResult!.meshes.filter((x) => x.expressId === id), centre);
      assert.ok(f);
      assert.ok((f.ox - centre.x) * f.nx + (f.oz - centre.z) * f.nz > 0, `${name}: +n points outwards`);
      checked++;
    }
    assert.ok(checked > 3);
  });

  it('cuts the plan through the frame at the sill height and the section through the middle', () => {
    for (const { name, v } of views) {
      assert.ok(v.plan.lines.some((l) => l.kind === 'cut'), `${name}: plan cut`);
      assert.ok(v.section.lines.some((l) => l.kind === 'cut'), `${name}: section cut`);
      assert.ok(Math.abs(extent(v.plan).w - v.width) < 0.01, `${name}: the plan spans the width`);
      assert.ok(Math.abs(extent(v.section).h - v.height) < 0.01, `${name}: the section spans the height`);
    }
  });
});
