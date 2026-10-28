/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { addLegend, placeLegend, projectLegends } from '@/legend/legend-actions';
import { layoutOf, readLegendEnv } from '@/legend/legend-env';
import type { LegendLabels } from '@/legend/legend-layout';
import type { ElevationDirection, ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { useSheetContent, type SheetContent } from './useSheetContent';

/**
 * #267: a legend is put in a free place beside the drawings of a sheet. A
 * plan's box is what the sheet draws, its elevation marks included (#243); the
 * legend placement measured the plan on its own drafts and so stood closer to
 * the plan than the marks allow.
 */

const LABELS: LegendLabels = {
  heading: { materials: 'Materials', layers: 'Layers', hatches: 'Hatches', symbols: 'Symbols', annotations: 'Annotations', colours: 'Colours' },
  tool: (tool) => tool,
  continued: (heading) => `${heading} (continued)`,
  membrane: 'membrane',
  sampleText: 'Abc',
};
const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, scale: 100, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const elevation = (direction: ElevationDirection): ProjectView => ({ id: `e-${direction}`, kind: 'elevation', name: direction, direction, createdAt: 0 });
const elevations = (['north', 'east', 'south', 'west'] as const).map(elevation);
const vp = (id: string, viewId: string, x: number, y: number): SheetViewport => ({ id, viewId, x, y, scale: 100, width: 0, height: 0, center: null });
const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 12, y: 8 } };
const drawing = { lines: [], cutPolygons: [], projectionPolygons: [], bounds: BOUNDS, config: { plane: { axis: 'y', position: 1.2, flipped: false } } } as unknown as Drawing2D;

/** The plan, alone and beside the right margin of an A2 sheet, and the four elevations on a sheet of their own. */
const plans: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp('vp', 'p', 520, 330)] };
const elevationSheet: ProjectSheet = { id: 's2', number: 'A-201', name: 'Elevations', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: elevations.map((e, i) => vp(`ve${i}`, e.id, 100 + i * 100, 100)) };

let hook: SheetContent | null = null;
function Harness({ sheet }: { sheet: ProjectSheet }) {
  hook = useSheetContent(sheet);
  return null;
}

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ views: [plan, ...elevations], sheets: [plans, elevationSheet], drafts: [] });
  useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
});
afterEach(() => {
  cleanup();
  useViewDrawings.setState({ byView: {} });
});

describe('a legend placed on a sheet stands clear of the plan the sheet draws, marks included (#267)', () => {
  it('does not overlap the box the sheet gives the plan', () => {
    const planViewport = plans.viewports![0]!;
    render(<Harness sheet={plans} />);
    const drawn = hook!.boxOf(planViewport);
    // The sheet's box holds the elevation marks: it is larger than the 120 x 80 mm of the building at 1:100.
    assert.ok(drawn.width > 120 && drawn.height > 80, `the drawn box is ${drawn.width} x ${drawn.height}`);

    const id = addLegend('Key', { categories: ['hatches'] });
    const placed = placeLegend('s', id, LABELS);
    const at = useProjectStore.getState().sheets.find((s) => s.id === 's')?.viewports?.find((v) => v.id === placed);
    const legend = projectLegends().find((l) => l.id === id);
    assert.ok(at && legend);
    const size = layoutOf(legend, readLegendEnv(LABELS), 's');
    const overlapsX = Math.abs(at.x - planViewport.x) < drawn.width / 2 + size.width / 2;
    const overlapsY = Math.abs(at.y - planViewport.y) < drawn.height / 2 + size.height / 2;
    assert.equal(overlapsX && overlapsY, false, `the legend at ${at.x}, ${at.y} (${size.width} x ${size.height}) is inside the plan's drawn box ${drawn.width} x ${drawn.height} at ${planViewport.x}, ${planViewport.y}`);
  });
});
