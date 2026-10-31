/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a building material draws, as a small piece of sheet (#90): one rectangular cut band of the material at 1:100,
 * put through the same chain a real sheet is drawn by, with no preview renderer of its own. The band becomes a cut
 * face of a `Drawing2D`; `materialDrawing` gives it the material's hatch, fill and membrane line, `styledDrawing`
 * stamps them, `viewportPens` turns them into the paper pens the sheet and the DXF write, and `membraneOverlays` is the
 * membrane's dashed pen. A change to how a sheet draws a material changes the swatch with it.
 */

import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import type { ViewTransform } from '@/drafting/frame';
import { viewportPens, type Pen } from '@/components/viewer/sheets/viewport-pens';
import { materialDrawing } from '@bimvoice/ifcsheet/material-drawing';
import { membraneOverlays } from './membrane-overlays';
import type { PlanOverlay } from './plan-overlays';
import { styledDrawing } from './view-graphics';
import type { MaterialGraphics } from './materials';

/** The swatch's size on paper, millimetres, and the scale it is drawn at. */
export const SWATCH_MM = { width: 16, height: 9 } as const;
export const SWATCH_SCALE = 100;

export interface MaterialSwatch {
  /** The sheet's pens for the band: fill, hatch, outline. */
  pens: Pen[];
  /** The membrane's dashed pen, when the material is a membrane. */
  overlays: PlanOverlay[];
  /** Drawing space to paper millimetres, the transform the pens were made with. */
  transform: ViewTransform;
}

const W = (SWATCH_MM.width * SWATCH_SCALE) / 1000;
const H = (SWATCH_MM.height * SWATCH_SCALE) / 1000;
/** Paper millimetres per drawing metre at the swatch's scale. */
const MM_PER_M = 1000 / SWATCH_SCALE;

const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];

function band(): Drawing2D {
  const polygon: DrawingPolygon = { polygon: { outer: corners, holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId: 1 };
  const lines = corners.map((a, i): DrawingLine => ({
    line: { start: a, end: corners[(i + 1) % corners.length] }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0,
  }));
  return { cutPolygons: [polygon], lines, projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: W, y: H } } } as unknown as Drawing2D;
}

/** The pens a material draws a cut band with, from its graphics (`materialGraphics`: its row, or the guess) and the project's hatch patterns. */
export function materialSwatch(graphics: MaterialGraphics | ProjectMaterial, patterns: readonly HatchPattern[]): MaterialSwatch {
  const drawing = band();
  const g = { ...graphics, auto: 'auto' in graphics ? graphics.auto : false };
  const materials = materialDrawing(drawing, { graphics: () => g, layers: () => null, membrane: () => !!g.membrane });
  const styled = styledDrawing(drawing, undefined, undefined, undefined, materials);
  const transform: ViewTransform = { scale: MM_PER_M, x: 0, y: 0 };
  return { pens: viewportPens(styled, undefined, transform, 'down', patterns), overlays: membraneOverlays(styled), transform };
}
