/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coloured style of an elevation or section (#499): the visible surfaces beyond the plane, each filled with the colour the 3D
 * view shows for it. That colour is the mesh's own (`MeshData.color`): the IfcSurfaceStyleRendering diffuse colour the model
 * authors for the element's material, else its surface colour, else the viewer's default for the class. The fills go under the
 * linework (the line and hatch styles stay on top), and the DXF keeps only the lines.
 *
 * The triangles are painted far to near, so a nearer face covers a farther one (the painter's order: a vector fill cannot be
 * resolved per pixel). Triangles within a centimetre of depth form one layer and are ordered by colour inside it, so a facade is a
 * few runs of one colour, not one run per triangle. Each triangle is wound the same way in the drawing, so a path of them can be
 * filled non-zero without overlapping triangles cancelling out.
 *
 * The app (`project/view-surface-fills.ts`) and the headless sheets (`sheet-graphic.ts`) both draw from {@link surfaceFills}.
 */

import { projectPointForPlane, signedDepth, type DrawingPolygon, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';

/** A visible surface of the drawing, `#rrggbb`. */
export type SurfaceFill = DrawingPolygon & { surfaceColour: string };

/** Classes that are not surfaces of the building: they are never drawn as a face. */
const NOT_SURFACES = new Set(['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCVIRTUALELEMENT', 'IFCGRID', 'IFCANNOTATION', 'IFCZONE']);

/** Depth of one layer of the painter's order, metres. */
const LAYER = 0.01;
/** Triangles smaller than this on the drawing (square metres) are slivers that only add bytes. */
const MIN_AREA = 1e-6;

const hex = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

/**
 * The colour of a mesh as paper shows it: `#rrggbb`. A translucent mesh (glass) is mixed with the paper's white by its opacity;
 * `null` for one so clear that it leaves nothing to draw.
 */
export function surfaceColourOf(color: readonly number[]): string | null {
  const a = color[3] ?? 1;
  if (!(a > 0.05)) return null;
  const mix = (c: number): number => (a >= 0.999 ? c : c * a + (1 - a));
  return `#${hex(mix(color[0]))}${hex(mix(color[1]))}${hex(mix(color[2]))}`;
}

/**
 * The surfaces `meshes` show in `config`'s view, nearest last. `shown` leaves out what the view hides (an element, a class).
 * Empty for a view with no depth to look into (a plan that shows its cut).
 */
export function surfaceFills(
  meshes: readonly MeshData[], config: SectionConfig, shown: (entityId: number, ifcType: string | undefined) => boolean = () => true,
): SurfaceFill[] {
  const depth = config.projectionDepth;
  if (!(depth > 0)) return [];
  const plane = config.plane;
  const found: { layer: number; colour: string; fill: SurfaceFill }[] = [];
  for (const mesh of meshes) {
    if (mesh.ifcType && NOT_SURFACES.has(mesh.ifcType.toUpperCase())) continue;
    if (!shown(mesh.expressId, mesh.ifcType)) continue;
    const colour = surfaceColourOf(mesh.color);
    if (!colour) continue;
    const { positions, indices, origin } = mesh;
    const at = (i: number) => ({
      x: positions[i * 3] + (origin?.[0] ?? 0), y: positions[i * 3 + 1] + (origin?.[1] ?? 0), z: positions[i * 3 + 2] + (origin?.[2] ?? 0),
    });
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const v = [at(indices[t]), at(indices[t + 1]), at(indices[t + 2])];
      // View depth, 0 at the plane and growing into the view (`color-raster.ts`).
      const d = v.map((p) => -signedDepth(p, plane));
      if (Math.max(...d) < 0 || Math.min(...d) > depth) continue;
      const [a, b, c] = v.map((p) => projectPointForPlane(p, plane));
      const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      if (!(Math.abs(area) >= MIN_AREA)) continue;
      found.push({
        layer: Math.round(Math.max(0, (d[0] + d[1] + d[2]) / 3) / LAYER), colour,
        fill: { polygon: { outer: area > 0 ? [a, b, c] : [a, c, b], holes: [] }, entityId: mesh.expressId, ifcType: mesh.ifcType ?? '', modelIndex: mesh.modelIndex ?? 0, isCut: false, surfaceColour: colour },
      });
    }
  }
  // Far first; inside a layer by colour, so equal colours run together.
  found.sort((x, y) => y.layer - x.layer || (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0));
  return found.map((f) => f.fill);
}
