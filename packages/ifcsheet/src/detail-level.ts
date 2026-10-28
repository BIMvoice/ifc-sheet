/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Detail level per view (#444): coarse, medium or fine, as in Revit.
 *
 *  - fine: what a view has always drawn, every material layer of a wall, slab or roof as its own band;
 *  - medium: the same layers, with the openings simplified (`simplifyOpeningSymbol` in the app);
 *  - coarse: walls, slabs and roofs by their outline only, one closed shape per element, with the openings simplified.
 *
 * The level is a field of the view's graphics (`ViewGraphics.detailLevel`), so a view template carries it and a view overrides it,
 * and `resolveViewGraphics` layers it like the rest. Absent, it follows the scale the view is drawn at (`defaultDetailLevel`).
 *
 * `atDetailLevel` is the one place the drawing itself is simplified. The drafting view, the sheets in the app and the headless
 * sheets (PDF, DXF) all call it on the drawing before anything is derived from it, so they cannot disagree (#34).
 */

import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { outlineOf } from './outline-union.js';
import type { ViewGraphics } from './view-graphics-types.js';

export type DetailLevel = 'coarse' | 'medium' | 'fine';
export const DETAIL_LEVELS: readonly DetailLevel[] = ['coarse', 'medium', 'fine'];

/** A scale denominator at or above this (1:100 and smaller drawings) defaults to coarse. */
export const COARSE_FROM_SCALE = 100;
/** A scale denominator at or below this (1:50 and larger drawings) defaults to fine; between the two it defaults to medium. */
export const FINE_UP_TO_SCALE = 50;

/** The level a drawing at 1:`scale` takes when its view names none; an absent or unusable scale is the view default, 1:100. */
export function defaultDetailLevel(scale: number | undefined): DetailLevel {
  const s = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : COARSE_FROM_SCALE;
  return s >= COARSE_FROM_SCALE ? 'coarse' : s <= FINE_UP_TO_SCALE ? 'fine' : 'medium';
}

/** The level a view draws at: its graphics' own (a template's, or the view's over it), else the one its scale gives. */
export function resolveDetailLevel(graphics: Pick<ViewGraphics, 'detailLevel'> | undefined, scale: number | undefined): DetailLevel {
  const set = graphics?.detailLevel;
  return set === 'coarse' || set === 'medium' || set === 'fine' ? set : defaultDetailLevel(scale);
}

type P = { x: number; y: number };
/** How far (metres) a cut line may lie from an outline edge and still be on it. */
const ON_EDGE = 0.002;

function distanceToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether both ends of `line` lie on one edge of `rings`: a line along the outline, not one across the element between two layers. */
function lineOnOutline(line: DrawingLine, rings: readonly (readonly P[])[]): boolean {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (distanceToSegment(line.line.start, a, b) <= ON_EDGE && distanceToSegment(line.line.end, a, b) <= ON_EDGE) return true;
    }
  }
  return false;
}

/** The classes drawn by their outline at a coarse level. */
const OUTLINED = /^IFC(WALL|WALLSTANDARDCASE|SLAB|ROOF)$/i;

/** A cut face's layer: the material and the colour of the band. */
const layerOf = (p: DrawingPolygon) => `${p.materialId ?? ''}|${p.color?.join(',') ?? ''}`;

/**
 * `drawing` at `level`. Only coarse changes it: each wall, slab and roof the generator cut in layers (several bands, which differ in
 * material or colour) is drawn by the outline of its bands together, without the material and colour of a band, so no layer boundary
 * is left (neither a band's edge nor a cut line between two bands) and nothing downstream splits it again by material. An element whose
 * bands do not close into an outline keeps them. The same object comes back when nothing changes.
 */
export function atDetailLevel<D extends Drawing2D>(drawing: D, level: DetailLevel): D {
  if (level !== 'coarse') return drawing;
  const bands = new Map<number, DrawingPolygon[]>();
  for (const p of drawing.cutPolygons) if (OUTLINED.test(p.ifcType)) bands.set(p.entityId, [...(bands.get(p.entityId) ?? []), p]);
  const outline = new Map<number, DrawingPolygon[]>();
  for (const [id, group] of bands) {
    if (new Set(group.map(layerOf)).size < 2) continue;
    const whole = outlineOf(group.map((p) => p.polygon));
    if (!whole) continue;
    const { color: _colour, materialId: _material, isLayerBase: _base, ...like } = group[0];
    outline.set(id, whole.map((polygon) => ({ ...like, polygon, isCut: true })));
  }
  if (outline.size === 0) return drawing;
  const placed = new Set<number>();
  const cutPolygons: DrawingPolygon[] = [];
  for (const p of drawing.cutPolygons) {
    const whole = outline.get(p.entityId);
    if (!whole) { cutPolygons.push(p); continue; }
    if (placed.has(p.entityId)) continue;
    placed.add(p.entityId);
    cutPolygons.push(...whole);
  }
  const rings = new Map<number, P[][]>([...outline].map(([id, ps]) => [id, ps.flatMap((p) => [p.polygon.outer, ...p.polygon.holes])]));
  const lines = drawing.lines.filter((l) => !rings.has(l.entityId) || l.category !== 'cut' || lineOnOutline(l, rings.get(l.entityId)!));
  return { ...drawing, cutPolygons, lines: lines.length === drawing.lines.length ? drawing.lines : lines };
}
