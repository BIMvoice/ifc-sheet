/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reflected ceiling plans (#91), on a real meshed IFC (`reflected-ceiling-room.ifc`: an 8 x 6 m room, an
 * L-shaped ceiling over all but its north-east quarter, one light off-centre at x 6.0, y 1.2). The views run
 * through the real `useDrawingGeneration` exactly as `ViewDrawingHost` drives them (`sectionPlaneForView`,
 * `viewDisplayOverrides`), and are compared with the floor plan of the same level at the same scale.
 *
 * Model (x, y) lands at drawing (x, -y) in a plan (the viewer is Y-up, IFC y is viewer -z); a reflected
 * ceiling plan must put every point at that same place, so its sheet position is the plan's.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { mmPerMetre } from '@/project/sheets';
import type { ElevationProjectView, PlanProjectView, ProjectLevel, SectionProjectView } from '@/project/types';
import { ceilingTags } from '@/rcp/ceiling-tags';
import { generateRcpView, meshRcpFixture, RCP_FIXTURE } from '@/test/rcp-fixture';

const { meshes, ids } = meshRcpFixture();
const level: ProjectLevel = { name: 'Level 1', elevation: RCP_FIXTURE.storeyZ, storeyGlobalIds: [] };
const base = { name: 'v', createdAt: 0, scale: 50 };
const plan: PlanProjectView = { ...base, id: 'plan', kind: 'plan', level, cutHeight: 1.2 };
const rcp: PlanProjectView = { ...base, id: 'rcp', kind: 'plan', level, cutHeight: 1.2, reflected: true };
const section: SectionProjectView = { ...base, id: 'sec', kind: 'section', plane: { axis: 'front', offset: -3, flipped: false } };
const elevation: ElevationProjectView = { ...base, id: 'elev', kind: 'elevation', direction: 'south' };

const linesOf = (d: Drawing2D, id: number): DrawingLine[] => d.lines.filter((l) => l.entityId === id);
const extent = (pts: { x: number; y: number }[]) => ({
  x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
});
const lineExtent = (ls: DrawingLine[]) => extent(ls.flatMap((l) => [l.line.start, l.line.end]));
const MM = mmPerMetre({ scale: 50 });
/** Sheet millimetres at 1:50 differ by less than 0.1 mm. */
const sameOnSheet = (a: number, b: number) => assert.ok(Math.abs(a - b) * MM < 0.1, `${a} vs ${b}: ${Math.abs(a - b) * MM} mm on the sheet`);
const sameExtent = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) => (['x0', 'x1', 'y0', 'y1'] as const).forEach((k) => sameOnSheet(a[k], b[k]));

describe('reflected ceiling plan against the floor plan below', () => {
  it('puts the off-centre light at the same sheet position as its model x/y in the plan frame', async () => {
    const [floorPlan, ceilingPlan] = [await generateRcpView(plan), await generateRcpView(rcp)];
    const light = lineExtent(linesOf(ceilingPlan, ids.light));
    // The model point (6.0, 1.2) is at drawing (6.0, -1.2): the plan's mapping of the same model point.
    sameOnSheet((light.x0 + light.x1) / 2, RCP_FIXTURE.light.x);
    sameOnSheet((light.y0 + light.y1) / 2, -RCP_FIXTURE.light.y);
    // ...and the plan draws that light (overhead) at the very same place.
    sameExtent(light, lineExtent(linesOf(floorPlan, ids.light)));
    // The plan's own mapping of the walls: the room's outer corners, (-0.1, 6.1) to (8.1, -0.1).
    const walls = extent(floorPlan.cutPolygons.flatMap((p) => p.polygon.outer));
    sameExtent(walls, { x0: -0.1, x1: 8.1, y0: -6.1, y1: 0.1 });
    sameExtent(extent(ceilingPlan.cutPolygons.flatMap((p) => p.polygon.outer)), walls);
  });

  it('puts the asymmetric ceiling edge at the same sheet x/y as the plan', async () => {
    const [floorPlan, ceilingPlan] = [await generateRcpView(plan), await generateRcpView(rcp)];
    const ceiling = lineExtent(linesOf(ceilingPlan, ids.ceiling));
    // The L runs x 0.1..7.9 and y 0.1..5.9; its notch edge is at x = 4.0.
    sameExtent(ceiling, { x0: 0.1, x1: 7.9, y0: -5.9, y1: -0.1 });
    sameExtent(ceiling, lineExtent(linesOf(floorPlan, ids.ceiling)));
    const edge = linesOf(ceilingPlan, ids.ceiling).filter((l) => Math.abs(l.line.start.x - 4) * MM < 0.1 && Math.abs(l.line.end.x - 4) * MM < 0.1);
    assert.ok(edge.length > 0, 'a vertical edge at x = 4.0, the west half of the ceiling');
    const span = extent(edge.flatMap((l) => [l.line.start, l.line.end]));
    sameOnSheet(span.y0, -5.9);
    sameOnSheet(span.y1, -2.5);
  });

  it('draws ceiling and light in the ceiling plan, and overhead (dashed) in the floor plan below', async () => {
    const [floorPlan, ceilingPlan] = [await generateRcpView(plan), await generateRcpView(rcp)];
    for (const id of [ids.ceiling, ids.light]) {
      const below = linesOf(floorPlan, id), above = linesOf(ceilingPlan, id);
      assert.ok(below.length > 0 && below.every((l) => l.visibility === 'hidden'), `${id}: overhead and dashed in the floor plan`);
      assert.ok(above.some((l) => l.visibility === 'visible'), `${id}: drawn solid in the ceiling plan`);
    }
    assert.ok(ceilingPlan.cutPolygons.some((p) => ids.wall.includes(p.entityId)), 'walls are cut at the cut height, as in a plan');
    assert.deepEqual(linesOf(ceilingPlan, ids.slab), [], 'the floor slab below the cut is not part of the ceiling plan');
    assert.ok(floorPlan.cutPolygons.every((p) => p.entityId !== ids.ceiling && p.entityId !== ids.light), 'nothing of the ceiling is cut at 1.2 m');
  });

  it('still generates the plan, section and elevation views', async () => {
    for (const view of [plan, section, elevation]) {
      const d = await generateRcpView(view);
      assert.ok(d.lines.length > 0 || d.cutPolygons.length > 0, `${view.kind} draws something`);
    }
    assert.ok((await generateRcpView(section)).cutPolygons.length > 0, 'the section cuts the walls');
  });
});

describe('ceiling height tags', () => {
  const tags = ceilingTags(meshes, RCP_FIXTURE.storeyZ, (id) => id === ids.ceiling);

  it('reads the soffit height above the level: the fixture states 2.70 m', () => {
    assert.equal(tags.length, 1);
    assert.ok(Math.abs(tags[0].height - RCP_FIXTURE.ceilingHeight) < 1e-3, `${tags[0].height}`);
    assert.equal(tags[0].text, '+2.70');
  });

  it('tags it under the ceiling, at the centroid of the L in the plan frame', () => {
    const cx = (18.72 * 4.0 + 13.26 * 2.05) / 31.98, cy = (18.72 * 1.3 + 13.26 * 4.2) / 31.98;
    sameOnSheet(tags[0].at.x, cx);
    sameOnSheet(tags[0].at.y, -cy);
  });

  it('tags nothing the predicate does not accept, and no light or wall', () => {
    assert.deepEqual(ceilingTags(meshes, RCP_FIXTURE.storeyZ, () => false), []);
    assert.deepEqual(ceilingTags(meshes, RCP_FIXTURE.storeyZ, (id) => id === ids.light), []);
  });
});

describe('ceiling height tags on a dense covering', () => {
  it('reads the soffit of a covering with 300 000 vertices (no argument-spread limit)', () => {
    const triangles = 100_000;
    const positions = new Float32Array(triangles * 9);
    for (let t = 0; t < triangles; t++) {
      const x = (t % 300) * 0.01, z = Math.floor(t / 300) * 0.01;
      positions.set([x, 2.7, z, x + 0.01, 2.7, z, x, 2.7, z + 0.01], t * 9);
    }
    const mesh = { expressId: 7, ifcType: 'IfcCovering', positions, indices: Uint32Array.from({ length: triangles * 3 }, (_, i) => i) };
    const tags = ceilingTags([mesh], 0, () => true);
    assert.equal(tags.length, 1);
    assert.equal(tags[0].text, '+2.70');
  });
});
