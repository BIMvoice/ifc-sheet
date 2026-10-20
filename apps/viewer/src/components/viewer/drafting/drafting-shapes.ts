/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The drawing's shapes the drafting view reads: the loops a hatch can fill, and the highlight of the selected model elements. */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { arrangementLoops, type Segment } from '@/drafting/arrangement';
import { shapeSegments } from '@/hooks/useDraftingLines3D';
import { isGeometry, type DraftEntity, type DraftShape, type Pt } from '@/drafting/types';

const HIGHLIGHT_LIMIT = 5000;
const CIRCLE_STEPS = 64;
/** Ends closer than this (metres) count as meeting when lines enclose an area. */
const ARRANGEMENT_TOLERANCE_M = 0.001;

/** Every closed loop a hatch can fill in this view. */
export function closedLoopsOf(entities: readonly DraftEntity[], drawing: Drawing2D | null): Pt[][] {
  const loops: Pt[][] = [];
  for (const e of entities) {
    const s = e.shape;
    if (s.type === 'polyline' && s.closed) loops.push(s.pts);
    else if (s.type === 'circle') loops.push(Array.from({ length: CIRCLE_STEPS }, (_, i) => ({ x: s.c.x + s.r * Math.cos((i / CIRCLE_STEPS) * Math.PI * 2), y: s.c.y + s.r * Math.sin((i / CIRCLE_STEPS) * Math.PI * 2) })));
  }
  // Whatever drafted lines, arcs and polylines enclose — end to end or crossing (BOUNDARY).
  const segments = entities.flatMap((e) => (isGeometry(e.shape) ? shapeSegments(e.shape).map(([a, b]) => [a, b] as Segment) : []));
  loops.push(...arrangementLoops(segments, ARRANGEMENT_TOLERANCE_M));
  for (const polygon of drawing?.cutPolygons ?? []) {
    loops.push(polygon.polygon.outer);
    for (const hole of polygon.polygon.holes) loops.push(hole);
  }
  return loops;
}

/** The selected model elements' cut outlines and drawn lines, for the overlay. */
export function modelHighlight(drawing: Drawing2D | null, ids: ReadonlySet<number>): DraftShape[] {
  if (!drawing || ids.size === 0) return [];
  const shapes: DraftShape[] = [];
  for (const polygon of drawing.cutPolygons) {
    if (ids.has(polygon.entityId)) shapes.push({ type: 'polyline', pts: polygon.polygon.outer, closed: true });
  }
  for (const line of drawing.lines) {
    if (shapes.length >= HIGHLIGHT_LIMIT) break;
    if (ids.has(line.entityId) && line.visibility !== 'hidden') shapes.push({ type: 'line', a: line.line.start, b: line.line.end });
  }
  return shapes;
}
