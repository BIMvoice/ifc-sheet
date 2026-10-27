/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's north arrow and graphic scale bar on the sheet
 * (`SheetViewport.northArrow` / `scaleBar`). The shapes are the engine's
 * (`viewportMarks` in `@bimvoice/ifcsheet/viewport-marks`), the same call the
 * PDF and DXF writers make, so the screen and the file draw them alike; this
 * only turns them into SVG. They go on the `SITE-SYMBOLS` layer of the DXF.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanDirection } from '@bimvoice/ifcsheet/true-north';
import { markArea, markBox, northDegrees, viewportMarkFlags, viewportMarks, type ViewportMarkShapes } from '@bimvoice/ifcsheet/viewport-marks';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';
import type { ProjectView, SheetViewport } from '@/project/types';
import type { Rect } from '@/project/sheet-frame';
import { penTags } from './dxf-tags';

const STROKE_MM = 0.25;

/**
 * The marks `vp` shows in its box, or null when it shows none. `box` is the
 * viewport's box on the paper and `drawingArea` the frame above the title
 * block (`drawingAreaIn`); the marks sit in the part of the box inside it.
 */
export function viewportMarkShapes(input: {
  vp: SheetViewport; view: ProjectView | undefined; drawing: Pick<Drawing2D, 'config' | 'bounds'> | null;
  drawingArea: Rect; north: PlanDirection | null; locale: SheetLocale;
}): ViewportMarkShapes | null {
  const flags = viewportMarkFlags(input.vp, input.view);
  const b = input.drawing?.bounds ?? null;
  const k = 1000 / input.vp.scale;
  const drawn = b ? { x: input.vp.x - ((b.max.x - b.min.x) * k) / 2, y: input.vp.y - ((b.max.y - b.min.y) * k) / 2, w: (b.max.x - b.min.x) * k, h: (b.max.y - b.min.y) * k } : null;
  const box = markBox(input.vp, drawn);
  const area = box ? markArea(box, input.drawingArea) : null;
  if (!area || !input.drawing || !(flags.northArrow || flags.scaleBar)) return null;
  return viewportMarks({
    area, scale: input.vp.scale, bar: flags.scaleBar, locale: input.locale,
    arrowDegrees: flags.northArrow ? northDegrees(input.drawing.config.plane, input.north) : null,
  });
}

const run = (pts: readonly { x: number; y: number }[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

export function ViewportMarks({ shapes }: { shapes: ViewportMarkShapes }) {
  return (
    <g data-viewport-marks="true" {...penTags('SITE-SYMBOLS', STROKE_MM)}>
      {shapes.solids.map((pts, i) => <path key={`s${i}`} d={`${run(pts)} Z`} fill="#000" stroke="none" />)}
      {shapes.strokes.map((pts, i) => <path key={`l${i}`} d={run(pts)} fill="none" stroke="#000" strokeWidth={STROKE_MM} strokeLinejoin="round" />)}
      {shapes.texts.map((t, i) => (
        <text key={`t${i}`} x={t.at.x} y={t.at.y} fontSize={t.size} textAnchor={t.align === 'center' ? 'middle' : 'start'} fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#000">{t.text}</text>
      ))}
    </g>
  );
}
