/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two cut faces of one fill that overlap are both painted: a pen collects every face of its colour into one path, and an even-odd
 * fill leaves the intersection white (the stair landing meeting a slab in a section). A non-zero fill of the union needs every
 * outer ring wound the same way and every hole the other way, which `viewportPens` normalises: the overlap adds up, a hole still
 * cancels its own outer ring.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D, type DrawingPolygon } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { AXIS_NAME, drawingToScreen } from '@/drafting/frame';
import { SheetPaper, viewportTransform } from './SheetPaper';

type Pt = { x: number; y: number };

/** A counter-clockwise rectangle in drawing coordinates. */
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];
const reversed = (ring: Pt[]): Pt[] => [...ring].reverse();

const face = (entityId: number, ifcType: string, outer: Pt[], holes: Pt[][] = []): DrawingPolygon =>
  ({ entityId, ifcType, modelIndex: 0, isCut: true, polygon: { outer, holes } });

// A slab with a hole and a stair flight, both deliberately wound against the sheet's convention: the stair's outer ring is CW
// and the slab's hole runs the same way as its outer ring. The two categories never join (`JOINED` in `cut-join-drawing.ts`), so
// both faces reach the sheet and share one fill.
const slab = face(1, 'IfcSlab', rect(0, 0, 10, 4), [rect(7, 1, 9, 3)]);
const stair = face(2, 'IfcStairFlight', reversed(rect(5, -2, 15, 2)));

const raw = {
  bounds: { min: { x: 0, y: -2 }, max: { x: 15, y: 4 } },
  config: createSectionConfig('z', 10, { projectionDepth: 0, includeHiddenLines: false }),
  cutPolygons: [slab, stair],
  projectionPolygons: [],
  lines: [],
} as unknown as Drawing2D;

const view = {
  id: 'v1', name: 'Plan', kind: 'plan', createdAt: 0, scale: 100,
  level: { name: 'L', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2,
} as ProjectView;
const vp: SheetViewport = { id: 'a', viewId: 'v1', x: 150, y: 100, scale: 100, width: 200, height: 150, center: { x: 7.5, y: 1 } };
const sheet = {
  id: 's1', number: 'A-101', name: 'Plan', createdAt: 1, paper: 'A3', orientation: 'landscape', titleBlock: {}, viewports: [vp],
} as ProjectSheet;

/** The rings of a `d` written by `viewportPens` (only `M…L…Z`). */
function ringsOf(d: string): Pt[][] {
  return d.split('M').slice(1).map((part) =>
    part.replace(/Z/g, '').trim().split('L').map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return { x, y };
    }),
  );
}

/** The non-zero winding of `p` over every ring. */
function windingAt(rings: readonly Pt[][], p: Pt): number {
  let w = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.y > p.y) !== (b.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x > p.x) w += b.y > a.y ? 1 : -1;
      }
    }
  }
  return w;
}

afterEach(() => cleanup());
resetProject();

describe('overlapping fills on a sheet stay filled', () => {
  it('paints their union non-zero: the overlap covered, the hole open', () => {
    const ui = render(
      <SheetPaper sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1}
        content={() => ({ view, drawing: raw, drafts: [] })} />,
    );
    const path = ui.querySelector<SVGPathElement>('[data-viewport-id="a"] path[data-dxf-layer="FILL"]');
    assert.ok(path, 'the viewport has one FILL path');
    assert.equal(path.getAttribute('fill-rule'), 'nonzero');

    // Points are given in drawing coordinates and taken through the same transform SheetPaper used; the `d` is paper mm.
    const axis = AXIS_NAME[raw.config.plane.axis];
    const t = viewportTransform(vp, raw, axis);
    const at = (p: Pt): Pt => drawingToScreen(p, t, axis);
    const rings = ringsOf(path.getAttribute('d') ?? '');
    const covered = (p: Pt): boolean => windingAt(rings, at(p)) !== 0;

    assert.equal(covered({ x: 6, y: 0.5 }), true, 'the slab–stair overlap stays filled');
    assert.equal(covered({ x: 2, y: 0.5 }), true, 'the slab alone stays filled');
    assert.equal(covered({ x: 12, y: 0.5 }), true, 'the stair alone stays filled');
    assert.equal(covered({ x: 8, y: 2.5 }), false, 'the slab hole stays open');
  });
});
