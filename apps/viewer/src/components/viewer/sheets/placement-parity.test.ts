/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #279: the engine (`placer`, which puts a drawing on the PDF and DXF) and the
 * sheet (`viewportTransform` with `drawingToScreen`) put a drawing point at the
 * same paper point, for every cut axis and with or without a stored centre. A
 * plan, an elevation facing east or west and a section each have their own
 * signs, and the two had gone their own ways.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placer } from '@bimvoice/ifcsheet';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { drawingToScreen } from '@/drafting/frame';
import type { SheetViewport } from '@/project/types';
import { AXIS_NAME, viewportTransform } from './SheetPaper';

const BOUNDS = { min: { x: 10, y: -40 }, max: { x: 70, y: -10 } };
const drawingOn = (axis: 'x' | 'y' | 'z'): Drawing2D => ({ bounds: BOUNDS, config: { plane: { axis } } }) as unknown as Drawing2D;
const viewport = (center: SheetViewport['center']): SheetViewport => ({ id: 'vp', viewId: 'v', x: 300, y: 200, scale: 100, width: 0, height: 0, center });
const POINTS = [{ x: 10, y: -40 }, { x: 70, y: -10 }, { x: 33, y: -17 }, { x: 0, y: 0 }];

describe('a drawing point on the paper: the engine and the sheet agree (#279)', () => {
  for (const axis of ['y', 'z', 'x'] as const) {
    for (const center of [null, { x: 20, y: -30 }]) {
      it(`cut axis ${axis}, ${center ? 'stored centre' : 'centred on its bounds'}`, () => {
        const drawing = drawingOn(axis);
        const vp = viewport(center);
        const name = AXIS_NAME[axis];
        const t = viewportTransform(vp, drawing, name);
        const at = placer(drawing, vp);
        for (const p of POINTS) {
          const sheet = drawingToScreen(p, t, name);
          const engine = at(p);
          assert.ok(Math.abs(sheet.x - engine.x) < 1e-9 && Math.abs(sheet.y - engine.y) < 1e-9, `${JSON.stringify(p)}: sheet ${JSON.stringify(sheet)}, engine ${JSON.stringify(engine)}`);
        }
      });
    }
  }
});
