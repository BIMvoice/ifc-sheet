/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan drawn square to the building (Revit's project north): its drawing frame is turned by the IfcSite's rotation
 * about the vertical (`coordinateInfo.buildingRotation`), so walls the site turned 48 degrees run along the sheet's
 * axes, while the north arrow, read through the same frame, turns to point to real north. Text and marks stay upright
 * because they are placed in drawing space.
 *
 * The rule, one place for the engine and the app: a plan with `orientation: 'building'` (what a new plan gets) is
 * turned; a plan without the field (every plan saved before it) or with `'true-north'` is not, so a saved drawing and
 * the drafts on it never move. A site plan stays on true north. A rotation within half a degree of a quarter turn is
 * taken as none, so a building already square to the world (FZK, bloc-p4) draws exactly as before.
 *
 * Elevations and sections are not turned yet: they still look from the world's north, south, east and west.
 */

import type { Drawing2D, DrawingLine, DrawingPolygon, Polygon2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { ProjectView } from './document.js';
import { drawingProjector, turnOf, turnedPoint, type DrawingPlane } from './drawing-frame.js';
import type { Pt } from './draft-types.js';

/** A rotation within this of a multiple of 90 degrees counts as none: the building is square to the world already. */
export const SQUARE_TOLERANCE_RAD = (0.5 * Math.PI) / 180;

/** The building squared on the sheet: the turn its plans are drawn at and its footprint's box in that turned drawing. */
export interface SquareFrame {
  /** Radians, counter-clockwise seen from above (`DrawingPlane.turn`). */
  turn: number;
  min: Pt;
  max: Pt;
}

/** The turn a plan square to the building takes for a site rotated `rotation` radians: the rotation, in (-pi, pi], or 0 within `SQUARE_TOLERANCE_RAD` of a quarter turn (or when it is not known). */
export function squareTurn(rotation: number | null | undefined): number {
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) return 0;
  const quarter = Math.PI / 2;
  if (Math.abs(rotation - Math.round(rotation / quarter) * quarter) <= SQUARE_TOLERANCE_RAD) return 0;
  const turn = Math.atan2(Math.sin(rotation), Math.cos(rotation));
  return Object.is(turn, -0) ? 0 : turn;
}

/** Whether `view` is drawn square to the building: a plan, not a site plan, that says `orientation: 'building'`. */
export function drawsSquare(view: Pick<ProjectView, 'kind'> & { orientation?: unknown; site?: unknown }): boolean {
  return view.kind === 'plan' && view.orientation === 'building' && view.site !== true;
}

/** The turn `view` is drawn at, given the building's square frame (`ModelExtent.square`); 0 when it is drawn on the world's axes. */
export function viewTurn(view: Pick<ProjectView, 'kind'> & { orientation?: unknown; site?: unknown }, square: SquareFrame | null | undefined): number {
  return square && drawsSquare(view) ? square.turn : 0;
}

/**
 * The box of `meshes` seen from above in the plan frame turned by `turn` (`drawingProjector`), or null when they have
 * no vertex: how large a plan square to the building is, which the world-axis box of a turned building overstates.
 */
export function squareFrameOf(meshes: readonly MeshData[], turn: number): SquareFrame | null {
  if (!turn) return null;
  const plan: DrawingPlane = { axis: 'y', position: 0, flipped: false, turn };
  const project = drawingProjector(plan);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const mesh of meshes) {
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const q = project(ox + p[i], oy + p[i + 1], oz + p[i + 2]);
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
  }
  return minX <= maxX ? { turn, min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : null;
}

/** A plane turned by `turn` (`DrawingPlane`); the plane itself when there is none. */
export function turnedPlane<P extends DrawingPlane>(plane: P, turn: number): P {
  return turn ? { ...plane, turn } : plane;
}

/**
 * `drawing`, generated on the world's axes, turned into the frame of `plane` (a turned plan's `DrawingPlane`): every
 * line, face and bound, with the plane on its config. The drawing itself when the plane is not turned.
 */
export function turnDrawing(drawing: Drawing2D, plane: DrawingPlane): Drawing2D {
  if (turnOf(plane) === 0) return drawing;
  const at = (p: Pt) => turnedPoint(plane, p);
  const ring = (r: readonly Pt[]) => r.map(at);
  const polygon = (p: Polygon2D): Polygon2D => ({ outer: ring(p.outer), holes: p.holes.map(ring) });
  const faces = (rows: readonly DrawingPolygon[]) => rows.map((r) => ({ ...r, polygon: polygon(r.polygon) }));
  const lines: DrawingLine[] = drawing.lines.map((l) => ({ ...l, line: { start: at(l.line.start), end: at(l.line.end) } }));
  const cutPolygons = faces(drawing.cutPolygons);
  const projectionPolygons = faces(drawing.projectionPolygons);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: Pt) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
  for (const l of lines) { grow(l.line.start); grow(l.line.end); }
  for (const f of [...cutPolygons, ...projectionPolygons]) f.polygon.outer.forEach(grow);
  // A drawing with nothing in it keeps its (turned) old bounds.
  if (!(minX <= maxX)) {
    const corners = [drawing.bounds.min, drawing.bounds.max, { x: drawing.bounds.min.x, y: drawing.bounds.max.y }, { x: drawing.bounds.max.x, y: drawing.bounds.min.y }].map(at);
    corners.forEach(grow);
  }
  return {
    ...drawing,
    config: { ...drawing.config, plane },
    lines,
    cutPolygons,
    projectionPolygons,
    ...(drawing.layerBaseCutPolygons ? { layerBaseCutPolygons: faces(drawing.layerBaseCutPolygons) } : {}),
    bounds: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } },
  };
}
