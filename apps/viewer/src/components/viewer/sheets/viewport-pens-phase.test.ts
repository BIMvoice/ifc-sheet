/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A phased cut face is filled with its phase's fill, not the category's or the default grey: the sheet
 * (`SheetPaper`) and the DXF (`view-dxf`) both draw from these pens.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { StyledDrawing } from '@/project/view-graphics';
import type { ViewGraphics } from '@/project/types';
import { viewportPens } from './viewport-pens';

const square = { outer: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], holes: [] };

function drawing(phase: 'new' | 'demolish' | undefined): StyledDrawing {
  return {
    lines: [],
    cutPolygons: [{ polygon: square, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, ...(phase ? { phase } : {}) }],
  } as unknown as StyledDrawing;
}

const fills = (d: StyledDrawing, graphics: ViewGraphics | undefined) =>
  viewportPens(d, graphics, { scale: 1000, x: 0, y: 0 }, 'down', []).filter((p) => p.layer === 'FILL').map((p) => p.fill);

describe('the cut fill of a phased element', () => {
  it('is the phase\'s default fill', () => {
    const graphics: ViewGraphics = { phases: { show: ['existing', 'new'] } } as ViewGraphics;
    assert.deepEqual(fills(drawing('new'), graphics), ['#52525b']);
  });

  it('is the fill the view sets for that phase', () => {
    const graphics: ViewGraphics = { phases: { show: ['existing', 'demolish'], styles: { demolish: { fillColor: '#ffcc00' } } } } as ViewGraphics;
    assert.deepEqual(fills(drawing('demolish'), graphics), ['#ffcc00']);
  });

  it('is the default grey for an element with no phase', () => {
    assert.deepEqual(fills(drawing(undefined), undefined), ['#d4d4d8']);
  });
});
