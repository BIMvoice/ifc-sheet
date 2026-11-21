/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The dashed lines of the floor below on a plan: a view that leaves them out
 * (`showLowerFloor: false`) keeps the overhead band (depth 0, clamped at the
 * cut), its own floor's hidden lines and what shows through an opening
 * (visible), and drops only its hidden lines deeper than the cut height (the
 * floor is that far under the cut). The project reader keeps the switch and
 * reads anything but a boolean as the default.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION_CONFIG, type Drawing2D, type DrawingLine } from '@ifc-lite/drawing-2d';
import { drawingWithoutLowerFloor, viewShowsLowerFloor } from './view-cut-options.js';
import type { PlanProjectView } from './document.js';
import { readView } from './set-read.js';

const line = (depth: number, extra: Partial<DrawingLine> = {}): DrawingLine => ({
  line: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  category: 'projection', visibility: 'hidden', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth, ...extra,
});

const drawing = (...lines: DrawingLine[]): Drawing2D => ({
  config: { ...DEFAULT_SECTION_CONFIG, plane: { axis: 'y', position: 1.2, flipped: false } },
  lines, cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 0 } },
  stats: { cutLineCount: 0, projectionLineCount: lines.length, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
});

describe('the floor below on a plan', () => {
  it('is drawn unless the view says no', () => {
    expect(viewShowsLowerFloor({})).toBe(true);
    expect(viewShowsLowerFloor({ showLowerFloor: true })).toBe(true);
    expect(viewShowsLowerFloor({ showLowerFloor: false })).toBe(false);
  });

  it('leaves out the hidden lines deeper than the cut height, and only those', () => {
    const overhead = line(0);
    const ownFloor = line(0.4);
    const onFloor = line(1.2);
    const belowFloor = line(3.9, { ifcType: 'IfcDoor' });
    const hiddenBelow = line(1.5, { category: 'hidden' });
    const crossing = line(1.1, { depthEnd: 1.5 });
    const seenThrough = line(3.9, { visibility: 'visible', ifcType: 'IfcStair' });
    const all = drawing(overhead, ownFloor, onFloor, belowFloor, hiddenBelow, crossing, seenThrough);
    const kept = drawingWithoutLowerFloor(all, { cutHeight: 1.2, showLowerFloor: false });
    expect(kept.lines).toEqual([overhead, ownFloor, onFloor, crossing, seenThrough]);
  });

  it('changes nothing when the view keeps the floor below', () => {
    const all = drawing(line(3.9));
    expect(drawingWithoutLowerFloor(all, { cutHeight: 1.2 })).toBe(all);
    expect(drawingWithoutLowerFloor(all, { cutHeight: 1.2, showLowerFloor: true })).toBe(all);
  });
});

describe('the floor below in the project file', () => {
  const stored = { id: 'p', name: 'Upper', createdAt: 0, kind: 'plan', level: { name: 'Upper', elevation: 2.8, storeyGlobalIds: [] }, cutHeight: 1.2 };
  const read = (showLowerFloor: unknown) => readView(JSON.parse(JSON.stringify({ ...stored, showLowerFloor })), 'views[0]') as PlanProjectView;

  it('keeps false and true, and reads anything else as the default', () => {
    expect(read(false).showLowerFloor).toBe(false);
    expect(read(true).showLowerFloor).toBe(true);
    for (const bad of ['false', 0, null, undefined]) expect(read(bad).showLowerFloor, String(bad)).toBeUndefined();
  });
});
