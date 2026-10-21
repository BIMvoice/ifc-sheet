/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What lies under a point of the paper, and where on the paper a model
 * element is. The first is how a pin learns its drawing, its point in the
 * model view and its element; the second is how a BCF topic about an element
 * finds its place on a sheet. Both read the views' own drawings, the ones the
 * sheet is drawn from, through the same transform the sheet prints with.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { drawingToScreen, screenToDrawing, type SectionAxisName } from '@/drafting/frame';
import { referenceSet, pickModelElement } from '@/drafting/references';
import type { Pt } from '@/drafting/types';
import { viewportBox } from '@/project/sheets';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { AXIS_NAME, viewportTransform } from '@/components/viewer/sheets/SheetPaper';

export type DrawingOf = (viewId: string) => Drawing2D | null;
/** The IFC GlobalId of a drawing entity (a renderer id), when a loaded model has it. */
export type GuidOf = (entityId: number) => string | null;

export interface PaperTarget {
  viewportId: string;
  viewId: string;
  /** The point in the view's drawing space, metres. */
  point: Pt;
  elementGuid?: string;
}

/** Paper millimetres of pick tolerance around a point, for an element whose outline is not cut. */
const PICK_MM = 2;

function axisOf(drawing: Drawing2D): SectionAxisName {
  return AXIS_NAME[drawing.config.plane.axis];
}

function inBox(vp: SheetViewport, drawing: Drawing2D, p: Pt): boolean {
  const box = viewportBox(vp, drawing.bounds);
  return Math.abs(p.x - vp.x) <= box.width / 2 && Math.abs(p.y - vp.y) <= box.height / 2;
}

/** The drawing under a paper point (the topmost viewport), the point in it, and its element when one lies there. */
export function targetAtPaper(sheet: ProjectSheet, p: Pt, drawingOf: DrawingOf, guidOf: GuidOf): PaperTarget | null {
  for (const vp of [...(sheet.viewports ?? [])].reverse()) {
    const drawing = drawingOf(vp.viewId);
    if (!drawing || !inBox(vp, drawing, p)) continue;
    const axis = axisOf(drawing);
    const point = screenToDrawing(p, viewportTransform(vp, drawing, axis), axis);
    const id = pickModelElement(drawing, referenceSet(drawing, false), point, (PICK_MM * vp.scale) / 1000);
    const guid = id === null ? null : guidOf(id);
    return { viewportId: vp.id, viewId: vp.viewId, point, ...(guid ? { elementGuid: guid } : {}) };
  }
  return null;
}

export interface ElementPlace extends PaperTarget {
  /** Where on the paper, mm. */
  x: number;
  y: number;
}

/** Where the element `guid` is drawn on a sheet (the middle of its outline, cut before seen), or null when none of its drawings shows it. */
export function placeOfElement(sheet: ProjectSheet, guid: string, drawingOf: DrawingOf, guidOf: GuidOf): ElementPlace | null {
  for (const vp of sheet.viewports ?? []) {
    const drawing = drawingOf(vp.viewId);
    if (!drawing) continue;
    const axis = axisOf(drawing);
    const t = viewportTransform(vp, drawing, axis);
    for (const polygon of [...drawing.cutPolygons, ...drawing.projectionPolygons]) {
      if (polygon.polygon.outer.length === 0 || guidOf(polygon.entityId) !== guid) continue;
      const xs = polygon.polygon.outer.map((q) => q.x);
      const ys = polygon.polygon.outer.map((q) => q.y);
      const point = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const paper = drawingToScreen(point, t, axis);
      if (!inBox(vp, drawing, paper)) continue;
      return { viewportId: vp.id, viewId: vp.viewId, point, elementGuid: guid, x: paper.x, y: paper.y };
    }
  }
  return null;
}
