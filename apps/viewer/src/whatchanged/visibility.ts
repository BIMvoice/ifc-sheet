/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which changed elements a view shows. A view looks at a band of the model
 * along one axis, on the side of its cut it keeps: a plan from its depth below
 * the cut up to the cut, a section or an elevation from the cut as far as its
 * depth toward what it looks at. An element is in view when its box (where it
 * was, or where it is now) reaches into the band and, for a detail, into the
 * area it shows; one with no box (a space with no geometry, a type) is in no
 * view. Nothing here knows what hides what: an element behind a wall that
 * covers it in the drawing still counts. Pure.
 *
 * FRAMES. The boxes a snapshot keeps are absolute (the file's own coordinates,
 * Y up); the bands and the drawing are in the render frame, which the geometry
 * pass shifted by an offset (`CoordinateInfo`: RTC and origin shift). The two meet
 * in `toRenderFrame`, once, before anything is compared with a band.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { worldToDrawing } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';
import type { Rect } from '@/labels/label-geometry';
import type { ModelChange } from './compare';

export interface ViewBand {
  viewId: string;
  /** The axis the band is across: y for a plan (height), z or x for a section or elevation. */
  axis: 'x' | 'y' | 'z';
  from: number;
  to: number;
  /** The plane the view draws on, to put a box into the view's drawing; with `crop`. */
  plane?: SectionPlaneConfig;
  /** A detail's area, drawing metres of the view it was marked on. */
  crop?: { min: Pt; max: Pt };
}

/** A plan sees from `floor` (its cut less its depth) up to its cut. */
export const planBand = (viewId: string, floor: number, cut: number): ViewBand => ({ viewId, axis: 'y', from: Math.min(floor, cut), to: Math.max(floor, cut) });

/**
 * A section or elevation keeps the half of space the drawing keeps (`drawing-2d` projection bands: depth is
 * `flipped ? -(c - position) : c - position`, kept where it is negative): unflipped, from `depth` behind
 * the cut up to it; flipped, the other way.
 */
export const cutBand = (viewId: string, axis: 'x' | 'z', position: number, depth: number, flipped = false): ViewBand =>
  ({ viewId, axis, from: flipped ? position : position - depth, to: flipped ? position + depth : position });

const AXIS = { x: 0, y: 1, z: 2 } as const;
type Box = readonly number[];

/** `box` (absolute, Y up) in the render frame, whose origin lies at `offset` of the file's. */
export function shiftBox(box: Box, offset: { x: number; y: number; z: number }): number[] {
  // Millions of metres less millions leave rounding noise a million times a millimetre: back to the micrometre.
  const tidy = (v: number) => Math.round(v * 1e6) / 1e6;
  return [tidy(box[0] - offset.x), tidy(box[1] - offset.y), tidy(box[2] - offset.z), tidy(box[3] - offset.x), tidy(box[4] - offset.y), tidy(box[5] - offset.z)];
}

/** The changes with their boxes in the render frame. */
export function toRenderFrame(changes: readonly ModelChange[], offset: { x: number; y: number; z: number }): ModelChange[] {
  if (offset.x === 0 && offset.y === 0 && offset.z === 0) return [...changes];
  return changes.map((c) => ({ ...c, ...(c.before ? { before: shiftBox(c.before, offset) } : {}), ...(c.after ? { after: shiftBox(c.after, offset) } : {}) }));
}

/** The rectangle a render-frame box covers in a view's drawing. */
export function drawingRect(box: Box, plane: SectionPlaneConfig): Rect {
  const pts = [0, 3].flatMap((x) => [1, 4].flatMap((y) => [2, 5].map((z) => worldToDrawing(plane, { x: box[x], y: box[y], z: box[z] }))));
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}

function reaches(box: Box | undefined, band: ViewBand): boolean {
  if (!box || box.length !== 6) return false;
  const i = AXIS[band.axis];
  if (!(box[i] <= band.to && box[i + 3] >= band.from)) return false;
  if (!band.crop || !band.plane) return true;
  const r = drawingRect(box, band.plane);
  return r.x1 >= band.crop.min.x && r.x0 <= band.crop.max.x && r.y1 >= band.crop.min.y && r.y0 <= band.crop.max.y;
}

/** The changes a view shows, in the order given. */
export function changesInView(changes: readonly ModelChange[], band: ViewBand): ModelChange[] {
  return changes.filter((c) => reaches(c.before, band) || reaches(c.after, band));
}

/** The changes shown in a region of a view's drawing (a sheet viewport's crop), by where their boxes fall in it. */
export function changesInRegion(changes: readonly ModelChange[], plane: SectionPlaneConfig, region: { min: Pt; max: Pt }): ModelChange[] {
  const inside = (box: Box | undefined) => {
    if (!box || box.length !== 6) return false;
    const r = drawingRect(box, plane);
    return r.x1 >= region.min.x && r.x0 <= region.max.x && r.y1 >= region.min.y && r.y0 <= region.max.y;
  };
  return changes.filter((c) => inside(c.before) || inside(c.after));
}
