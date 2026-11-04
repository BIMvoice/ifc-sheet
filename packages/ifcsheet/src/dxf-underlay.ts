/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A DXF drawing laid under a plan view as linework (#547): the layers it came with, each on or off, and one
 * similarity (turn, scale, shift) that puts it on the view. The app draws it, snaps to it and prints it through
 * these functions, and the command-line build prints the same lines, so a headless sheet and the app's agree.
 *
 * `layers` hold the lines in the DXF's own plan coordinates, metres, already turned into the view's drawing frame
 * (a plan's y runs down: `dxfUnderlayFromPaths` flips it once). The place is `p' = at + scale * R(rotation) * p`.
 * Two points picked on the underlay and where they belong place it (`alignDxfByTwoPoints`).
 */

import type { Point2D } from '@ifc-lite/drawing-2d';

/** The most points one DXF underlay may keep: the project file carries them all. */
export const DXF_UNDERLAY_MAX_POINTS = 200_000;

/** The pen of the underlay's lines on a sheet, paper mm: finer than the drawing's, it is a reference. */
export const DXF_UNDERLAY_PEN_MM = 0.1;

export interface DxfUnderlayLayer {
  name: string;
  /** A CSS colour. */
  colour: string;
  visible: boolean;
  /** Open runs of the layer's lines; a closed outline ends where it starts. */
  runs: Point2D[][];
}

export interface ViewDxfUnderlay {
  id: string;
  /** The view it lies under. */
  viewId: string;
  name: string;
  layers: DxfUnderlayLayer[];
  /** Where the DXF's origin lies, view drawing coordinates (metres). */
  at: Point2D;
  /** On top of the metres the DXF is read in; 1 when it was read right. */
  scale: number;
  /** Radians, counter-clockwise in drawing space. */
  rotation: number;
  /** 0 to 1. */
  opacity: number;
  locked: boolean;
  /** The sheets that print it (ids). Absent or empty: it is not printed anywhere. */
  printOnSheets?: string[];
}

/** A DXF point on the view's drawing. */
export function dxfPointToDrawing(u: Pick<ViewDxfUnderlay, 'at' | 'scale' | 'rotation'>, p: Point2D): Point2D {
  const c = Math.cos(u.rotation) * u.scale;
  const s = Math.sin(u.rotation) * u.scale;
  return { x: u.at.x + p.x * c - p.y * s, y: u.at.y + p.x * s + p.y * c };
}

export interface DxfRun {
  layer: string;
  colour: string;
  /** View drawing coordinates. */
  points: Point2D[];
}

/** The lines of the layers that are on, in the view's drawing coordinates: what the screen, the sheet, the PDF and the snaps all use. */
export function dxfUnderlayRuns(u: ViewDxfUnderlay): DxfRun[] {
  return u.layers.filter((l) => l.visible).flatMap((l) => l.runs.map((run) => ({ layer: l.name, colour: l.colour, points: run.map((p) => dxfPointToDrawing(u, p)) })));
}

/**
 * The underlay moved, turned and scaled so that the two points picked where it shows now (`from`) land on the two points they belong at
 * (`to`). Null when either pair coincides, or a point is not a number. Locked is the caller's to check.
 */
export function alignDxfByTwoPoints(u: ViewDxfUnderlay, from: readonly [Point2D, Point2D], to: readonly [Point2D, Point2D]): ViewDxfUnderlay | null {
  if (![...from, ...to].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const fx = from[1].x - from[0].x;
  const fy = from[1].y - from[0].y;
  const tx = to[1].x - to[0].x;
  const ty = to[1].y - to[0].y;
  const d = fx * fx + fy * fy;
  if (!(d > 1e-18) || !(tx * tx + ty * ty > 1e-18)) return null;
  // The map z' = m * z + c on complex numbers: m turns and scales, c shifts.
  const mr = (tx * fx + ty * fy) / d;
  const mi = (ty * fx - tx * fy) / d;
  const cx = to[0].x - (mr * from[0].x - mi * from[0].y);
  const cy = to[0].y - (mr * from[0].y + mi * from[0].x);
  return {
    ...u,
    scale: u.scale * Math.hypot(mr, mi),
    rotation: u.rotation + Math.atan2(mi, mr),
    at: { x: mr * u.at.x - mi * u.at.y + cx, y: mr * u.at.y + mi * u.at.x + cy },
  };
}

/** The underlay with a layer on or off; unchanged when it has no such layer. */
export function withDxfLayerVisible(u: ViewDxfUnderlay, name: string, visible: boolean): ViewDxfUnderlay {
  return { ...u, layers: u.layers.map((l) => (l.name === name ? { ...l, visible } : l)) };
}

export const dxfUnderlaysOfView = (all: readonly ViewDxfUnderlay[] | undefined, viewId: string): ViewDxfUnderlay[] => (all ?? []).filter((u) => u.viewId === viewId);

/** The DXF underlays of a view that a sheet prints. */
export const printedDxfUnderlays = (all: readonly ViewDxfUnderlay[] | undefined, viewId: string, sheetId: string): ViewDxfUnderlay[] =>
  dxfUnderlaysOfView(all, viewId).filter((u) => u.opacity > 0 && u.printOnSheets?.includes(sheetId) === true);

/** What an import reads of a converted DXF (`@ifc-lite/drawing-2d`'s `DxfUnderlay`): layers of paths, in metres, +y north. */
export interface ConvertedDxf {
  name: string;
  layers: readonly { name: string; color: string; visible: boolean; paths: readonly { points: readonly Point2D[]; closed: boolean }[] }[];
}

/**
 * The linework of a converted DXF for a plan view: y flipped once (a plan's drawing y runs down), a closed path ending where it starts,
 * layers with no lines left out. Null when it has no line, or more than `DXF_UNDERLAY_MAX_POINTS` points.
 */
export function dxfUnderlayFromPaths(dxf: ConvertedDxf, viewId: string, id: string): ViewDxfUnderlay | null {
  let count = 0;
  const layers: DxfUnderlayLayer[] = [];
  for (const layer of dxf.layers) {
    const runs: Point2D[][] = [];
    for (const path of layer.paths) {
      if (path.points.length < 2) continue;
      const run = path.points.map((p) => ({ x: p.x, y: 0 - p.y }));
      if (path.closed) run.push({ ...run[0] });
      count += run.length;
      runs.push(run);
    }
    if (runs.length > 0) layers.push({ name: layer.name, colour: layer.color, visible: layer.visible, runs });
  }
  if (count === 0 || count > DXF_UNDERLAY_MAX_POINTS) return null;
  return { id, viewId, name: dxf.name, layers, at: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 0.6, locked: false };
}
