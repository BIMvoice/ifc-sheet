/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The front, plan and section views of ONE door or window, cut from its real
 * mesh by the section / projection pipeline the plans and sections use
 * (`Drawing2DGenerator` on a custom plane), not by a second mesher.
 *
 * The element's own frame is read off its mesh: the horizontal rectangle of
 * least area around the vertices gives the width axis `u` and the wall normal
 * `n` (exterior = `+n`, set by `awayFrom`, else arbitrary but fixed); the origin
 * is the middle of the footprint at the lowest vertex. All three views are
 * metres in the type frame of `symbols.ts`: front (u, z) seen from the interior
 * side, plan (u, n) cut `cutHeight` above the bottom, section (n, z) cut through
 * the middle of the width.
 */

import { Drawing2DGenerator, HatchGenerator, createSectionConfig, type Drawing2D, type DrawingLine, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { fitFootprint, placedMeshes } from '@bimvoice/ifcsheet';

export interface V2 { x: number; y: number }

/** `cut` is the section line, `seen` the visible outline, `hidden` what lies behind, `hatch` the fill of cut faces. */
export type ViewLineKind = 'cut' | 'seen' | 'hidden' | 'hatch';

export interface ViewLine { a: V2; b: V2; kind: ViewLineKind }

export interface ElementView {
  lines: ViewLine[];
  /** Extent of the `cut` and `seen` lines (hatching stays inside them). */
  min: V2;
  max: V2;
}

export interface ElementViews {
  /** Metres: along the wall, across it, up. */
  width: number;
  depth: number;
  height: number;
  front: ElementView;
  plan: ElementView;
  section: ElementView;
}

export interface ElementViewOptions {
  /** A horizontal point (viewer world x, z) the exterior side faces away from: the building's middle. */
  awayFrom?: { x: number; z: number };
  /** Plan cut height above the element's lowest point (m). Default 1.1, kept below the head. */
  cutHeight?: number;
  /** Schedule scale (50 = 1:50): sets the hatch spacing to 1 mm on paper. */
  scale?: number;
  /** Hidden edges in the front view. Default off. */
  hidden?: boolean;
}

interface Frame { ox: number; oy: number; oz: number; ux: number; uz: number; nx: number; nz: number; width: number; depth: number; height: number }

/** The element's meshes placed in world coordinates (the engine's `placedMeshes`, the one frame the schedule's measured size is read in). */
export { placedMeshes };

/** The element's frame from its vertices (viewer world, y up). Null when there are none. */
export function elementFrame(meshes: readonly MeshData[], awayFrom?: { x: number; z: number }): Frame | null {
  const fit = fitFootprint(placedMeshes(meshes));
  if (!fit) return null;
  const { c, s, wide, width, depth, ox, oz } = fit;
  // The long side of the footprint is the width.
  let nx = wide ? -s : c, nz = wide ? c : s; // across it
  // Exterior = +n. Facing away from `awayFrom`; without it, the sign the search gave.
  const flip = awayFrom ? (ox - awayFrom.x) * nx + (oz - awayFrom.z) * nz < 0 : false;
  if (flip) { nx = -nx; nz = -nz; }
  // Right-handed type frame: u = n x up, so that (u, n, up) reads x, y, z.
  return { ox, oy: fit.minY, oz, ux: -nz, uz: nx, nx, nz, width, depth, height: fit.height };
}

type Vec3 = { x: number; y: number; z: number };
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** One view: the plane's normal `N` (towards the viewer), through `origin`; the drawing's x is `N`'s `up x` side. */
function planeConfig(origin: Vec3, normal: Vec3, tangent: Vec3, bitangent: Vec3, below: number): SectionConfig {
  const distance = origin.x * normal.x + origin.y * normal.y + origin.z * normal.z;
  const config = createSectionConfig('y', origin.y, {
    projectionDepth: below, clipProjectionBands: true, projectionBelowDepth: below, projectionAboveDepth: 1e-3, includeHiddenLines: true, scale: 100,
  });
  config.plane.customPlane = { normal, distance, origin, tangent, bitangent };
  return config;
}

function toView(drawing: Drawing2D, hatch: DrawingLine[], keepHidden: boolean): ElementView {
  const lines: ViewLine[] = [];
  const min = { x: Infinity, y: Infinity }, max = { x: -Infinity, y: -Infinity };
  const take = (l: DrawingLine, kind: ViewLineKind) => {
    const a = { x: l.line.start.x, y: l.line.start.y }, b = { x: l.line.end.x, y: l.line.end.y };
    lines.push({ a, b, kind });
    if (kind === 'hatch') return;
    for (const p of [a, b]) {
      min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y);
      max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y);
    }
  };
  for (const l of drawing.lines) {
    if (l.visibility === 'hidden') { if (keepHidden) take(l, 'hidden'); continue; }
    take(l, l.category === 'cut' ? 'cut' : 'seen');
  }
  for (const l of hatch) take(l, 'hatch');
  if (min.x === Infinity) { min.x = min.y = max.x = max.y = 0; }
  return { lines, min, max };
}

/**
 * The three views of an element, or null when it has no body geometry (the
 * caller then draws the generated symbol and says so).
 */
export async function elementViews(meshes: readonly MeshData[], options: ElementViewOptions = {}): Promise<ElementViews | null> {
  meshes = placedMeshes(meshes);
  const f = elementFrame(meshes, options.awayFrom);
  if (!f || f.width < 1e-3 || f.height < 1e-3) return null;
  const generator = new Drawing2DGenerator();
  const hatcher = new HatchGenerator();
  await generator.initialize();
  const o: Vec3 = { x: f.ox, y: f.oy, z: f.oz };
  const nExt: Vec3 = { x: f.nx, y: 0, z: f.nz };
  const u: Vec3 = { x: f.ux, y: 0, z: f.uz };
  const at = (d: Vec3, k: number): Vec3 => ({ x: o.x + d.x * k, y: o.y + d.y * k, z: o.z + d.z * k });
  const spacing = (options.scale ?? 50) / 1000;
  const run = async (config: SectionConfig, keepHidden: boolean, edges: boolean): Promise<ElementView> => {
    const drawing = await generator.generate([...meshes], config, { useGPU: false, includeHiddenLines: keepHidden, includeProjection: true, includeEdges: true, mergeLines: true, includeFeatureEdges: edges });
    const hatch = hatcher.generateHatches(drawing.cutPolygons, 100, () => ({ type: 'diagonal', spacing }))
      .flatMap((r) => r.lines.map((h): DrawingLine => ({ line: h.line, category: 'annotation', visibility: 'visible', entityId: h.entityId, ifcType: h.ifcType, modelIndex: h.modelIndex, depth: 0 })));
    return toView(drawing, hatch, keepHidden);
  };
  const eps = 0.01;
  // Front, from the interior: the viewer stands on the -n side looking along +n.
  const frontN = { x: -nExt.x, y: 0, z: -nExt.z };
  const front = await run(planeConfig(at(frontN, f.depth / 2 + eps), frontN, cross(UP, frontN), UP, f.depth + 2 * eps), !!options.hidden, true);
  // Plan: looking down, drawing y = the exterior direction.
  const cutHeight = Math.min(options.cutHeight ?? 1.1, f.height * 0.9);
  const plan = await run(planeConfig({ x: o.x, y: o.y + cutHeight, z: o.z }, UP, cross(nExt, UP), nExt, cutHeight + eps), false, false);
  // Section: through the middle of the width, seen from +u, drawing x = the exterior direction.
  const section = await run(planeConfig(o, u, nExt, UP, f.width / 2 + eps), false, false);
  return { width: f.width, depth: f.depth, height: f.height, front, plan, section };
}
