/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coloured style of an elevation or section (#499): the visible surfaces beyond the plane, each filled with the colour the 3D
 * view shows for it. That colour is the mesh's own (`MeshData.color`), which the Rust style resolver makes: the SurfaceColour of the
 * element's IfcSurfaceStyleRendering (the apparent colour; a distinct DiffuseColour is only the shading colour), else the viewer's
 * default for the class. A face that crosses the plane is cut at it, so only the part beyond the plane is drawn, and one that runs past
 * the view depth is cut there too. The fills go under the
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
const NOT_SURFACES = new Set(['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCVIRTUALELEMENT', 'IFCGRID', 'IFCANNOTATION', 'IFCZONE', 'IFCSITE']);
/** A type object (IfcWallType) carries the shape its occurrences share, not a thing standing in the building; the headless sheets never mesh it. */
const notSurface = (ifcType: string): boolean => NOT_SURFACES.has(ifcType.toUpperCase()) || ifcType.toUpperCase().endsWith('TYPE');

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

interface Corner { p: { x: number; y: number; z: number }; d: number }

/** The corners of a polygon's part at view depth 0 or more (fewer than three when none is left), in order. */
function beyondPlane(corners: readonly Corner[]): Corner[] {
  const out: Corner[] = [];
  corners.forEach((cur, i) => {
    const next = corners[(i + 1) % corners.length];
    if (cur.d >= 0) out.push(cur);
    if ((cur.d >= 0) !== (next.d >= 0)) {
      const u = cur.d / (cur.d - next.d);
      out.push({ p: { x: cur.p.x + (next.p.x - cur.p.x) * u, y: cur.p.y + (next.p.y - cur.p.y) * u, z: cur.p.z + (next.p.z - cur.p.z) * u }, d: 0 });
    }
  });
  return out;
}

/**
 * The surfaces `meshes` show in `config`'s view, nearest last. `shown` leaves out what the view hides (an element, a class).
 * Empty for a view with no depth to look into (a plan that shows its cut).
 */
export function surfaceFills(
  meshes: readonly MeshData[], config: SectionConfig, shown: (entityId: number, ifcType: string | undefined) => boolean = () => true,
  /** The colour a mesh is painted in (`#rrggbb`), `null` to leave it out; default: its own, `surfaceColourOf`. */
  colourOf: (mesh: MeshData) => string | null = (mesh) => surfaceColourOf(mesh.color),
): SurfaceFill[] {
  const depth = config.projectionDepth;
  if (!(depth > 0)) return [];
  const plane = config.plane;
  const found: { layer: number; colour: string; fill: SurfaceFill }[] = [];
  for (const mesh of meshes) {
    if (mesh.ifcType && notSurface(mesh.ifcType)) continue;
    if (!shown(mesh.expressId, mesh.ifcType)) continue;
    const colour = colourOf(mesh);
    if (!colour) continue;
    const { positions, indices, origin } = mesh;
    const at = (i: number) => ({
      x: positions[i * 3] + (origin?.[0] ?? 0), y: positions[i * 3 + 1] + (origin?.[1] ?? 0), z: positions[i * 3 + 2] + (origin?.[2] ?? 0),
    });
    for (let t = 0; t + 2 < indices.length; t += 3) {
      // View depth, 0 at the plane and growing into the view (`color-raster.ts`).
      const corners = [at(indices[t]), at(indices[t + 1]), at(indices[t + 2])].map((p) => ({ p, d: -signedDepth(p, plane) }));
      if (Math.min(...corners.map((c) => c.d)) > depth) continue;
      // The part of the face beyond the plane: a face the plane crosses is cut there, or its removed front part would paint over what lies behind.
      // It is cut again at the far end of the view depth (the same clip, with depth measured back from there), so nothing past it is painted.
      const fromFar = (cs: readonly Corner[]): Corner[] => cs.map((c) => ({ p: c.p, d: depth - c.d }));
      const piece = fromFar(beyondPlane(fromFar(beyondPlane(corners))));
      for (let k = 1; k + 1 < piece.length; k++) {
        const tri = [piece[0], piece[k], piece[k + 1]];
        const [a, b, c] = tri.map((v) => projectPointForPlane(v.p, plane));
        const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        if (!(Math.abs(area) >= MIN_AREA)) continue;
        found.push({
          layer: Math.round(Math.max(0, (tri[0].d + tri[1].d + tri[2].d) / 3) / LAYER), colour,
          fill: { polygon: { outer: area > 0 ? [a, b, c] : [a, c, b], holes: [] }, entityId: mesh.expressId, ifcType: mesh.ifcType ?? '', modelIndex: mesh.modelIndex ?? 0, isCut: false, surfaceColour: colour },
        });
      }
    }
  }
  // Far first; inside a layer by colour, so equal colours run together.
  found.sort((x, y) => y.layer - x.layer || (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0));
  return found.map((f) => f.fill);
}
