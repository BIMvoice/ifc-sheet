/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A cut-away axonometric as vector lines (#97): the model clipped at a storey
 * cut and to a section box, then drawn along the camera like any axonometric
 * (`camera-drawing.ts`), with the faces the cut leaves filled.
 *
 * 1. Clip: every mesh is clipped to each plane in turn (`clipMeshesToHalfSpace`,
 *    world space, `origin` kept), which also gives the new edges each plane
 *    makes (the rim). A rim made by an earlier plane is trimmed by the later
 *    ones, so the box's corners stay clean.
 * 2. Faces: on each plane that faces the camera, the plan's own cut
 *    (`axonometric-caps.ts`) of the UNCLIPPED meshes, trimmed to the box.
 * 3. Draw: the clipped meshes through the camera, the rim of the facing planes
 *    as cut lines, and the faces as occluders only, so the hidden-line pass
 *    hides what is inside a cut wall. A clip plane facing away from the camera
 *    gets no face and no rim of its own: its open edges are ordinary outline,
 *    drawn and hidden by the hidden-line pass like any other.
 * 4. Fill: the faces projected through the same plane, as the drawing's cut
 *    polygons.
 *
 * Why a facing face needs no hidden-line test of its own: everything left lies
 * on the kept side of every plane, and a ray from the camera to a point on a
 * facing plane crosses only the removed side before it gets there. Nothing
 * that is drawn can stand in front of a cut face, so each face is filled whole.
 */

import {
  clipMeshesToHalfSpace,
  projectPointForPlane,
  type CameraFrame,
  type Drawing2D,
  type DrawingPolygon,
  type Vec3,
  type WorldSegment,
} from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { capMesh, liftPoint, planeFaces, type CardinalPlane } from './axonometric-caps.js';
import { generateCameraDrawing } from './camera-drawing.js';
import type { SectionBox } from './view-3d-types.js';

/** What is cut away, in the drawing frame (viewer metres, Y up). */
export interface CutawayClip {
  /** The storey cut: nothing above this height is drawn. */
  cutY?: number;
  /** Only what lies inside this box is drawn. */
  box?: SectionBox;
}

export interface CutawayDrawingInput {
  meshes: readonly MeshData[];
  camera: CameraFrame;
  clip: CutawayClip;
  /** The "N" in 1:N, carried on the drawing. */
  scaleFactor: number;
  /** Pixels of tolerance for an edge on its occluder's outline. */
  hiddenLineEdgeTolerancePx: number;
  onProgress?: (stage: string, progress: number) => void;
}

/** The clip planes of `clip`: the storey cut (the box's top when lower), then the box's other sides. */
export function cutawayPlanes(clip: CutawayClip): CardinalPlane[] {
  const { box } = clip;
  const top = Math.min(clip.cutY ?? Infinity, box?.max.y ?? Infinity);
  const planes: CardinalPlane[] = [];
  if (Number.isFinite(top)) planes.push({ axis: 'y', position: top, sign: 1 });
  if (box) {
    planes.push(
      { axis: 'x', position: box.max.x, sign: 1 }, { axis: 'x', position: box.min.x, sign: -1 },
      { axis: 'z', position: box.max.z, sign: 1 }, { axis: 'z', position: box.min.z, sign: -1 },
      { axis: 'y', position: box.min.y, sign: -1 },
    );
  }
  return planes;
}

/** The half-space a plane keeps, as `dot(p, normal) <= offset`. */
function halfSpace(plane: CardinalPlane): { normal: Vec3; offset: number } {
  const normal = { x: 0, y: 0, z: 0 };
  normal[plane.axis] = plane.sign;
  return { normal, offset: plane.sign * plane.position };
}

/** The part of a world segment on the kept side of a half-space, or `null`. */
function clipSegment(seg: WorldSegment, { normal: n, offset }: { normal: Vec3; offset: number }): WorldSegment | null {
  const da = seg.start.x * n.x + seg.start.y * n.y + seg.start.z * n.z - offset;
  const db = seg.end.x * n.x + seg.end.y * n.y + seg.end.z * n.z - offset;
  if (da <= 0 && db <= 0) return seg;
  if (da > 0 && db > 0) return null;
  const t = da / (da - db);
  const at = { x: seg.start.x + (seg.end.x - seg.start.x) * t, y: seg.start.y + (seg.end.y - seg.start.y) * t, z: seg.start.z + (seg.end.z - seg.start.z) * t };
  return da > 0 ? { ...seg, start: at } : { ...seg, end: at };
}

/** The camera's unit view direction. */
function viewDirection(camera: CameraFrame): Vec3 {
  const d = { x: camera.target.x - camera.position.x, y: camera.target.y - camera.position.y, z: camera.target.z - camera.position.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / len, y: d.y / len, z: d.z / len };
}

/** The drawing of `meshes` cut away by `clip`, seen along `camera`; throws when the cut leaves nothing. */
export async function generateCutawayDrawing(input: CutawayDrawingInput): Promise<Drawing2D> {
  const planes = cutawayPlanes(input.clip);
  if (planes.length === 0) throw new Error('A cut-away needs a storey cut or a section box.');
  const view = viewDirection(input.camera);
  // The box the faces are trimmed to: the section box with its top at the cut. Without a box only the cut plane clips, and its faces need no trim.
  const box = input.clip.box ? { min: input.clip.box.min, max: { ...input.clip.box.max, y: planes[0].position } } : null;

  // 1. Clip, plane by plane, trimming the rim made so far by each later plane.
  let kept: readonly MeshData[] = input.meshes;
  let rim: { seg: WorldSegment; plane: number }[] = [];
  planes.forEach((plane, i) => {
    const half = halfSpace(plane);
    const result = clipMeshesToHalfSpace(kept, half.normal, half.offset);
    kept = result.meshes;
    const trimmed: typeof rim = [];
    for (const r of rim) {
      const seg = clipSegment(r.seg, half);
      if (seg) trimmed.push({ seg, plane: r.plane });
    }
    for (const seg of result.rimSegments) trimmed.push({ seg, plane: i });
    rim = trimmed;
  });
  if (kept.length === 0) throw new Error('Nothing to draw: the cut-away removes the whole model.');

  // 2. The faces of the planes that face the camera.
  const facing = planes.map((plane) => halfSpace(plane).normal[plane.axis] * view[plane.axis] < -1e-9);
  const faces: { plane: CardinalPlane; rings: ReturnType<typeof planeFaces> }[] = [];
  const occluders: MeshData[] = [];
  planes.forEach((plane, i) => {
    if (!facing[i]) return;
    const rings = planeFaces(input.meshes, plane, box);
    faces.push({ plane, rings });
    const cap = capMesh(rings, plane);
    if (cap) occluders.push(cap);
  });

  // 3. The line work.
  const { drawing, plane: cameraPlane } = await generateCameraDrawing({
    meshes: kept,
    camera: input.camera,
    scaleFactor: input.scaleFactor,
    rimSeeds: rim.filter((r) => facing[r.plane]).map((r) => r.seg),
    occluders,
    clipPlanes: planes.filter((_, i) => facing[i]).map(halfSpace),
    hiddenLineEdgeTolerancePx: input.hiddenLineEdgeTolerancePx,
    includeFeatureEdges: true,
    onProgress: input.onProgress,
  });

  // 4. The faces, filled: each ring lifted back into the world and projected through the camera's plane.
  const cutPolygons: DrawingPolygon[] = [];
  for (const { plane, rings } of faces) {
    for (const face of rings) {
      const [outer, ...holes] = face.rings.map((ring) => ring.map((p) => projectPointForPlane(liftPoint(p, plane.axis, plane.position), cameraPlane)));
      cutPolygons.push({ ...face.source, polygon: { outer, holes }, isCut: true });
    }
  }
  return { ...drawing, cutPolygons, stats: { ...drawing.stats, polygonCount: cutPolygons.length } };
}
