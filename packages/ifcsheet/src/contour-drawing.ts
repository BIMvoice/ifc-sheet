/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A terrain on a plan, drawn as contours instead of the one mesh cut at the plan's height (#182). The app's sheets and
 * drafting view and the headless sheets (`ifcsheet build`, PDF, DXF) all call {@link withContours}, so the contours stand
 * where they do in the files as on the screen. The contours are ordinary drawing lines of the terrain's element: a
 * minor contour is a projection line and a major one (every fifth) an outline, so the view's one styler gives the major
 * ones the heavier pen and the DXF carries both.
 */

import { projectPointForPlane, type Drawing2D, type DrawingLine } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { ProjectView } from './document.js';
import { CONTOUR_DEFAULT_INTERVAL, contourLines } from './contours.js';
import { CONTOUR_IFC_TYPE, labelPlaces, type ContourLabel, type WithContourLabels } from './contour-labels.js';

export { CONTOUR_IFC_TYPE };

/**
 * The interval a view draws its terrain at, metres; `null` when it draws none. Only a site plan, or the plan of a model
 * with no storeys (a terrain alone), takes contours; `contourInterval: 0` turns them off.
 */
export function contourIntervalOf(view: ProjectView | undefined): number | null {
  if (view?.kind !== 'plan' || view.reflected || view.discipline) return null;
  // A view saved before storeys were listed (or a test's bare view) has no list: it takes contours only if it has terrain.
  if (view.site !== true && (view.level?.storeyGlobalIds?.length ?? 0) > 0) return null;
  const interval = view.contourInterval ?? CONTOUR_DEFAULT_INTERVAL;
  return interval > 0 ? interval : null;
}

const upper = (t: string): string => t.toUpperCase();
const keyOf = (e: { entityId: number; modelIndex?: number }): string => `${e.modelIndex ?? 0}:${e.entityId}`;

/**
 * `drawing` of `view` with the terrain's mesh cut and projection taken out and its contours drawn in their place;
 * the same object when the view takes none or `terrain` is empty. `datum`: what the frame's y lacks of true height.
 */
export function withContours<T extends Drawing2D>(drawing: T, view: ProjectView | undefined, terrain: readonly MeshData[], datum = 0): T {
  const interval = contourIntervalOf(view);
  if (interval === null || terrain.length === 0) return drawing;
  const plane = drawing.config.plane;
  const lines: DrawingLine[] = [];
  const rings: { ring: { x: number; y: number }[]; height: number }[] = [];
  const ids = new Map(terrain.map((m) => [keyOf({ entityId: m.expressId, modelIndex: m.modelIndex }), m]));
  const first = terrain[0];
  for (const contour of contourLines(terrain, interval, datum)) {
    const pts = contour.points.map((p) => projectPointForPlane({ x: p.x, y: contour.height - datum, z: p.z }, plane));
    const ring = contour.closed ? [...pts, pts[0]] : pts;
    if (contour.major) rings.push({ ring, height: contour.height });
    for (let i = 0; i + 1 < ring.length; i++) {
      lines.push({
        line: { start: ring[i], end: ring[i + 1] }, category: contour.major ? 'silhouette' : 'projection', visibility: 'visible',
        entityId: first.expressId, ifcType: CONTOUR_IFC_TYPE, modelIndex: first.modelIndex ?? 0, depth: 0,
      });
    }
  }
  const terrainItem = (e: { entityId: number; modelIndex: number; ifcType: string }): boolean => ids.has(keyOf(e)) || upper(e.ifcType) === 'IFCGEOGRAPHICELEMENT';
  const kept = drawing.lines.filter((l) => !terrainItem(l));
  const all = [...kept, ...lines];
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const take = (p: { x: number; y: number }): void => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
  for (const l of all) { take(l.line.start); take(l.line.end); }
  const cutPolygons = drawing.cutPolygons.filter((p) => !terrainItem(p));
  const projectionPolygons = drawing.projectionPolygons.filter((p) => !terrainItem(p));
  for (const p of [...cutPolygons, ...projectionPolygons]) { p.polygon.outer.forEach(take); p.polygon.holes.forEach((h) => h.forEach(take)); }
  const bounds = Number.isFinite(minX) ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : drawing.bounds;
  // Height labels on the major contours (#182), spaced a third of the plan's longer side along each; a sheet places them once it knows its scale.
  const extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
  const contourLabels: ContourLabel[] = rings.flatMap((r) => labelPlaces(r.ring, r.height, extent / 3));
  const labelled: WithContourLabels = contourLabels.length ? { contourLabels } : {};
  return { ...drawing, ...labelled, lines: all, cutPolygons, projectionPolygons, bounds, stats: { ...drawing.stats, projectionLineCount: all.filter((l) => l.category === 'projection').length } };
}
