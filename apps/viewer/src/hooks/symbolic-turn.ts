/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { turnedPoint, type DrawingPlane } from '@bimvoice/ifcsheet';
import type { DrawingAnnotationData } from './useSymbolicAnnotations.js';

/** The annotations of a cardinal drawing, in the frame of a plan turned square to the building (`DrawingPlane.turn`): every point and every text direction through the shared frame, so they sit on the cut that `turnDrawing` turned. */
export function turnAnnotations(data: DrawingAnnotationData, turn: number): DrawingAnnotationData {
  if (!turn) return data;
  const plane: DrawingPlane = { axis: 'y', position: 0, flipped: false, turn };
  const at = (p: { x: number; y: number }) => turnedPoint(plane, p);
  const lines = data.lines.map((ln) => ({ ...ln, line: { start: at(ln.line.start), end: at(ln.line.end) } }));
  const texts = data.texts.map((t) => {
    const p = at(t), d = at({ x: t.dirX, y: t.dirY });
    return { ...t, x: p.x, y: p.y, dirX: d.x, dirY: d.y };
  });
  const fills = data.fills.map((f) => {
    const points = new Float32Array(f.points.length);
    for (let i = 0; i + 1 < f.points.length; i += 2) {
      const p = at({ x: f.points[i], y: f.points[i + 1] });
      points[i] = p.x;
      points[i + 1] = p.y;
    }
    return { ...f, points };
  });
  return { lines, texts, fills };
}
