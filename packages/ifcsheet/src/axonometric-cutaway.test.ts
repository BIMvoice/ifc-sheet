/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #97: a cut-away axonometric on boxes whose answer is known. A 4 x 3 m wall
 * 0.3 m thick runs east-west; a low block stands just north of it (behind it,
 * seen from the south-east corner); a small box is buried in the wall just
 * under the cut. The storey cut is at 1.2 m.
 */

import { describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine, Point2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { drawAxonometricView, nominalScaleFactor, axonometricCamera } from './axonometric.js';
import { cutawayPlanes } from './axonometric-cutaway.js';
import { fillTriangles } from './axonometric-caps.js';
import type { ProjectLevel } from './document.js';
import type { ThreeDProjectView } from './view-3d-types.js';

type V3 = { x: number; y: number; z: number };

/** A closed box, outward-wound. */
export function boxMesh(expressId: number, ifcType: string, min: V3, max: V3): MeshData {
  const c = (i: number): number[] => [i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z];
  const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap(c));
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  return { expressId, ifcType, modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0.8, 0.8, 0.8, 1] };
}

const LEVEL: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: ['G'] };
const CUT = 1.2;
const WALL = boxMesh(1, 'IfcWall', { x: 0, y: 0, z: 0 }, { x: 4, y: 3, z: 0.3 });
const BLOCK = boxMesh(2, 'IfcFurnishingElement', { x: 1, y: 0, z: -0.6 }, { x: 3, y: 0.3, z: -0.3 });
const BURIED = boxMesh(3, 'IfcBuildingElementProxy', { x: 1.5, y: 0.8, z: 0.1 }, { x: 2.5, y: 1.1, z: 0.2 });

const view = (patch: Partial<ThreeDProjectView> = {}): ThreeDProjectView => ({
  id: 'axo', kind: '3d', name: 'Cut-away', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100,
  cutaway: { storey: { level: LEVEL, cutHeight: CUT } }, ...patch,
});

/** A drawing point back in the world: the camera plane's origin + x tangent + y bitangent, then `depth` away from the viewer (the drawing is scaled by `k`). */
function worldOf(d: Drawing2D, p: Point2D, depth: number, k: number): V3 {
  const c = d.config.plane.customPlane!;
  const x = p.x / k;
  const y = p.y / k;
  return {
    x: c.origin.x + c.tangent.x * x + c.bitangent.x * y - c.normal.x * depth,
    y: c.origin.y + c.tangent.y * x + c.bitangent.y * y - c.normal.y * depth,
    z: c.origin.z + c.tangent.z * x + c.bitangent.z * y - c.normal.z * depth,
  };
}

const ends = (d: Drawing2D, l: DrawingLine, k: number): [V3, V3] => [worldOf(d, l.line.start, l.depth, k), worldOf(d, l.line.end, l.depthEnd ?? l.depth, k)];

/** Whether the world segment a-b lies along the line `l` (both ends within `tol` of the segment). */
function along(d: Drawing2D, l: DrawingLine, k: number, a: V3, b: V3, tol = 0.02): boolean {
  const dist = (p: V3): number => {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
    return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t);
  };
  const [p, q] = ends(d, l, k);
  return dist(p) < tol && dist(q) < tol;
}

const area = (ring: readonly Point2D[]): number => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
const K = nominalScaleFactor(axonometricCamera(view()));

describe('a storey cut-away axonometric (#97)', () => {
  it('draws nothing above the cut: every line, visible or hidden, lies at or under 1.2 m', async () => {
    const d = await drawAxonometricView([WALL, BLOCK, BURIED], view(), [LEVEL]);
    expect(d.lines.length).toBeGreaterThan(10);
    const top = Math.max(...d.lines.flatMap((l) => ends(d, l, K).map((p) => p.y)));
    expect(top).toBeLessThan(CUT + 1e-3);
    expect(top).toBeGreaterThan(CUT - 1e-3);
  });

  it('fills the wall\'s cut face: the plan\'s 4 x 0.3 m section, seen at the isometric angle and the nominal scale', async () => {
    const d = await drawAxonometricView([WALL, BLOCK, BURIED], view(), [LEVEL]);
    const faces = d.cutPolygons.filter((p) => p.entityId === 1);
    expect(faces).toHaveLength(1);
    expect(faces[0].isCut).toBe(true);
    // A horizontal face is foreshortened by |d.y| = 1/sqrt(3); the nominal scale enlarges lengths by sqrt(3/2), areas by 3/2.
    expect(area(faces[0].polygon.outer)).toBeCloseTo(1.2 * (1 / Math.sqrt(3)) * 1.5, 6);
    // Its rim is drawn as cut line work, along the wall's top at the cut.
    const rim = d.lines.filter((l) => l.category === 'cut' && l.entityId === 1 && l.visibility === 'visible');
    expect(rim.some((l) => along(d, l, K, { x: 0, y: CUT, z: 0.3 }, { x: 4, y: CUT, z: 0.3 }))).toBe(true);
    // Neither the block nor the buried box is cut.
    expect(d.cutPolygons.some((p) => p.entityId !== 1)).toBe(false);
  });

  it('hides the edge of the block behind the wall: its top south edge is hidden, never visible', async () => {
    const d = await drawAxonometricView([WALL, BLOCK, BURIED], view(), [LEVEL]);
    const edge = [{ x: 1, y: 0.3, z: -0.3 }, { x: 3, y: 0.3, z: -0.3 }] as const;
    const on = d.lines.filter((l) => l.entityId === 2 && along(d, l, K, edge[0], edge[1]));
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((l) => l.visibility === 'hidden')).toBe(true);
  });

  it('hides what is inside a cut wall behind its cut face: the box buried just under the cut is not seen', async () => {
    const d = await drawAxonometricView([WALL, BLOCK, BURIED], view(), [LEVEL]);
    const buried = d.lines.filter((l) => l.entityId === 3);
    expect(buried.length).toBeGreaterThan(0);
    expect(buried.filter((l) => l.visibility === 'visible')).toEqual([]);
  });

  it('draws the cut rim once: no projection line runs along the cut rim', async () => {
    const d = await drawAxonometricView([WALL], view(), [LEVEL]);
    const top = d.lines.filter((l) => l.visibility === 'visible' && l.category !== 'cut' && ends(d, l, K).every((p) => Math.abs(p.y - CUT) < 1e-3));
    expect(top).toEqual([]);
  });

  it('a section box trims the drawing and fills its sides that face the camera', async () => {
    const box = { min: { x: 1, y: -1, z: -1 }, max: { x: 3, y: 5, z: 1 } };
    const d = await drawAxonometricView([WALL, BLOCK], view({ cutaway: { storey: { level: LEVEL, cutHeight: CUT }, box } }), [LEVEL]);
    const xs = d.lines.flatMap((l) => ends(d, l, K).map((p) => p.x));
    expect(Math.min(...xs)).toBeGreaterThan(1 - 1e-3);
    expect(Math.max(...xs)).toBeLessThan(3 + 1e-3);
    // The top face (2 x 0.3 m) and the east side (x = 3, facing a south-east camera: 0.3 x 1.2 m) of the wall are filled.
    const faces = d.cutPolygons.filter((p) => p.entityId === 1).map((p) => area(p.polygon.outer) / (K * K * (1 / Math.sqrt(3))));
    expect(faces.sort((a, b) => a - b).map((a) => Number(a.toFixed(4)))).toEqual([0.36, 0.6]);
  });

  it('a plain axonometric is untouched: no cut faces, and drawn at its projection\'s scale', async () => {
    const plain = await drawAxonometricView([WALL], view({ cutaway: undefined }));
    expect(plain.cutPolygons).toEqual([]);
    const top = Math.max(...plain.lines.flatMap((l) => ends(plain, l, 1).map((p) => p.y)));
    expect(top).toBeCloseTo(3, 3);
  });

  it('measures the nominal scale along the vertical: a 1.2 m edge is 1.2 m long on the drawing', async () => {
    const d = await drawAxonometricView([WALL], view(), [LEVEL]);
    expect(K).toBeCloseTo(Math.sqrt(1.5), 12);
    // The wall's south-east vertical edge, x = 4, z = 0.3, from 0 to the cut.
    const edge = d.lines.find((l) => l.visibility === 'visible' && along(d, l, K, { x: 4, y: 0, z: 0.3 }, { x: 4, y: CUT, z: 0.3 }));
    expect(edge).toBeDefined();
    expect(Math.hypot(edge!.line.end.x - edge!.line.start.x, edge!.line.end.y - edge!.line.start.y)).toBeCloseTo(1.2, 4);
  });

  it('refuses a cut that leaves nothing', async () => {
    await expect(drawAxonometricView([WALL], view({ cutaway: { storey: { level: LEVEL, cutHeight: -1 } } }), [LEVEL])).rejects.toThrow(/removes the whole model/);
  });
});

describe('the cut planes and the face fill (#97)', () => {
  it('a box lowers its top to the storey cut and adds its five other sides', () => {
    expect(cutawayPlanes({ cutY: 1.2 })).toEqual([{ axis: 'y', position: 1.2, sign: 1 }]);
    const planes = cutawayPlanes({ cutY: 1.2, box: { min: { x: 0, y: -1, z: 0 }, max: { x: 1, y: 9, z: 1 } } });
    expect(planes[0]).toEqual({ axis: 'y', position: 1.2, sign: 1 });
    expect(planes).toHaveLength(6);
  });

  it('fills a ring with a hole by its even-odd area', () => {
    const outer = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const hole = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
    const tris = fillTriangles([outer, hole]);
    let sum = 0;
    for (let i = 0; i < tris.length; i += 3) sum += area([tris[i], tris[i + 1], tris[i + 2]]);
    expect(sum).toBeCloseTo(11, 9);
  });
});
