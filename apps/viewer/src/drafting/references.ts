/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The generated drawing as drafting references: every visible line and
 * every cut-polygon edge as a line shape, indexed once per drawing, so
 * snaps and trim / extend boundaries see the model's geometry.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { SnapIndex } from './snaps';
import { pointInPolygon, signedArea } from './offset';
import { nearestOnShape } from './curves';
import type { ElementBox } from './dimension-anchor';
import type { DraftShape, Pt } from './types';

export interface ReferenceSet {
  shapes: DraftShape[];
  /** The renderer (global) id of the element each shape was drawn from. */
  owners: number[];
  index: SnapIndex;
}

const cache = new WeakMap<Drawing2D, ReferenceSet>();

function polygonEdges(outer: readonly Pt[], owner: number, into: DraftShape[], owners: number[]): void {
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    if (a.x !== b.x || a.y !== b.y) {
      into.push({ type: 'line', a, b });
      owners.push(owner);
    }
  }
}

export function referenceSet(drawing: Drawing2D, includeHidden: boolean): ReferenceSet {
  const cached = cache.get(drawing);
  if (cached) return cached;
  const shapes: DraftShape[] = [];
  const owners: number[] = [];
  for (const line of drawing.lines) {
    if (!includeHidden && line.visibility === 'hidden') continue;
    shapes.push({ type: 'line', a: line.line.start, b: line.line.end });
    owners.push(line.entityId);
  }
  for (const polygon of drawing.cutPolygons) {
    polygonEdges(polygon.polygon.outer, polygon.entityId, shapes, owners);
    for (const hole of polygon.polygon.holes) polygonEdges(hole, polygon.entityId, shapes, owners);
  }
  const set = { shapes, owners, index: new SnapIndex(shapes) };
  cache.set(drawing, set);
  return set;
}

/**
 * The model element under a drawing point: the smallest cut outline that
 * contains it (as the plan view picks), else the element of the nearest
 * drawn line within `tolerance`. `null` when nothing is there.
 */
export function pickModelElement(drawing: Drawing2D, set: ReferenceSet, p: Pt, tolerance: number): number | null {
  let best: { id: number; area: number } | null = null;
  for (const polygon of drawing.cutPolygons) {
    const outer = polygon.polygon.outer;
    if (!pointInPolygon(p, outer) || polygon.polygon.holes.some((h) => pointInPolygon(p, h))) continue;
    const area = Math.abs(signedArea(outer));
    if (!best || area < best.area) best = { id: polygon.entityId, area };
  }
  if (best) return best.id;
  let nearest: { id: number; d: number } | null = null;
  const min = { x: p.x - tolerance, y: p.y - tolerance };
  const max = { x: p.x + tolerance, y: p.y + tolerance };
  for (const i of set.index.query(min, max)) {
    const d = nearestOnShape(set.shapes[i], p).dist;
    if (d <= tolerance && (!nearest || d < nearest.d)) nearest = { id: set.owners[i], d };
  }
  return nearest?.id ?? null;
}

/**
 * The elements a drawing point is a corner or an end of, nearest first, each with its box in the drawing (the bounds of the lines and
 * cut outlines drawn from it): the elements a dimension snapped to that point can stay attached to. Empty where no drawn line
 * of any element ends within `tolerance`.
 */
export function referenceElementBoxes(set: ReferenceSet, p: Pt, tolerance: number, guidOf: (id: number) => string | null): ElementBox[] {
  const near = new Map<number, number>();
  const min = { x: p.x - tolerance, y: p.y - tolerance };
  const max = { x: p.x + tolerance, y: p.y + tolerance };
  for (const i of set.index.query(min, max)) {
    const s = set.shapes[i];
    if (s.type !== 'line') continue;
    const d = Math.min(Math.hypot(s.a.x - p.x, s.a.y - p.y), Math.hypot(s.b.x - p.x, s.b.y - p.y));
    if (d <= tolerance && d < (near.get(set.owners[i]) ?? Infinity)) near.set(set.owners[i], d);
  }
  const out: ElementBox[] = [];
  for (const [id] of [...near].sort((a, b) => a[1] - b[1])) {
    const guid = guidOf(id);
    if (!guid) continue;
    let rect: ElementBox['rect'] | null = null;
    set.shapes.forEach((s, i) => {
      if (s.type !== 'line' || set.owners[i] !== id) return;
      rect = rect
        ? { x0: Math.min(rect.x0, s.a.x, s.b.x), y0: Math.min(rect.y0, s.a.y, s.b.y), x1: Math.max(rect.x1, s.a.x, s.b.x), y1: Math.max(rect.y1, s.a.y, s.b.y) }
        : { x0: Math.min(s.a.x, s.b.x), y0: Math.min(s.a.y, s.b.y), x1: Math.max(s.a.x, s.b.x), y1: Math.max(s.a.y, s.b.y) };
    });
    if (rect) out.push({ guid, rect });
  }
  return out;
}

/** The reference shapes whose bounds meet the box. */
export function referencesIn(set: ReferenceSet, min: Pt, max: Pt): DraftShape[] {
  return set.index.query(min, max).map((i) => set.shapes[i]);
}
