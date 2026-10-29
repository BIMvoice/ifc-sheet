/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coloured style of an elevation (#499) on the sheet, which is also what the PDF prints (the same SVG): the visible surfaces are
 * filled in the colours of the materials, behind the linework; the plain style is as it was; the switch off takes the fills away; and
 * the DXF keeps the lines.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { cleanup, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { styledDrawing } from '@/project/view-graphics';
import { drawsColoured, withSurfaceFills } from '@/project/view-surface-fills';
import type { ProjectSheet, ProjectView, SheetViewport, ViewGraphics } from '@/project/types';
import { ViewSvg } from '../drafting/view-dxf';
import { SheetPaper } from './SheetPaper';

const quad = (expressId: number, z: number, color: [number, number, number, number], ifcType: string, x: number): MeshData => ({
  expressId, ifcType, color, positions: new Float32Array([x, 0, z, x + 1, 0, z, x + 1, 1, z, x, 1, z]), normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
}) as unknown as MeshData;
// A brick wall (red) with a window (blue) standing in front of it.
const meshes = [quad(1, 2, [0.8, 0.2, 0.1, 1], 'IfcWall', 0), quad(2, 4, [0.1, 0.2, 0.8, 1], 'IfcWindow', 0.25)];
const RED = '#cc331a';
const BLUE = '#1a33cc';

const square = (x: number) => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }];
const raw = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: createSectionConfig('z', 10, { projectionDepth: 20, includeHiddenLines: false }),
  cutPolygons: [],
  projectionPolygons: [],
  lines: [1, 2].map((entityId) => ({ entityId, ifcType: 'IfcWall', modelIndex: 0, category: 'projection', visibility: 'visible', line: { start: { x: entityId * 2, y: 3 }, end: { x: entityId * 2 + 1, y: 3 } } })),
  hatch: square(0),
} as unknown as Drawing2D;

const view = { id: 'v1', name: 'South', kind: 'elevation', direction: 'south', createdAt: 0, scale: 100 } as ProjectView;
const vp: SheetViewport = { id: 'a', viewId: 'v1', x: 150, y: 100, scale: 100, width: 200, height: 150, center: { x: 5, y: 5 } };
const sheet = { id: 's1', number: 'A-201', name: 'Elevations', createdAt: 1, paper: 'A3', orientation: 'landscape', titleBlock: {}, viewports: [vp] } as ProjectSheet;

const shown = (graphics: ViewGraphics | undefined, kind: ProjectView['kind'] = 'elevation') =>
  withSurfaceFills(styledDrawing(raw, graphics), { kind }, graphics, meshes, new Set());
function paper(graphics: ViewGraphics | undefined): HTMLElement {
  const v = { ...view, graphics } as ProjectView;
  return render(<SheetPaper sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: v, drawing: shown(graphics), drafts: [] })} />);
}
const paths = (ui: ParentNode) => [...ui.querySelectorAll('[data-viewport-id="a"] path')];
const surfaces = (ui: ParentNode) => paths(ui).filter((p) => p.getAttribute('data-surface') === 'true');

afterEach(() => cleanup());
resetProject();

describe('the coloured style of an elevation on the sheet and its PDF (#499)', () => {
  it('fills the surfaces in the colours of their materials, far to near, behind every line', () => {
    const ui = paper({ colouredSurfaces: true });
    const fills = surfaces(ui);
    assert.deepEqual(fills.map((p) => p.getAttribute('fill')), [RED, BLUE], 'the wall first, the window in front of it');
    assert.equal(fills.every((p) => p.getAttribute('fill-rule') === 'nonzero'), true);
    const all = paths(ui);
    const lastFill = Math.max(...fills.map((p) => all.indexOf(p)));
    const firstLine = all.findIndex((p) => p.getAttribute('data-surface') !== 'true' && p.getAttribute('fill') === 'none');
    assert.ok(firstLine > lastFill, 'the linework is drawn after the fills');
  });

  it('the plain style has no fills and draws what it drew', () => {
    const plain = paths(paper(undefined)).map((p) => p.outerHTML);
    cleanup();
    const off = paths(paper({ colouredSurfaces: false })).map((p) => p.outerHTML);
    assert.equal(surfaces(paper(undefined)).length, 0);
    cleanup();
    assert.deepEqual(off, plain);
    const on = paths(paper({ colouredSurfaces: true })).filter((p) => p.getAttribute('data-surface') !== 'true').map((p) => p.outerHTML);
    assert.deepEqual(on, plain, 'the lines are the same with the fills under them');
  });

  it('keeps the DXF to the lines: the fills are marked out of it and the view DXF has none', () => {
    for (const p of surfaces(paper({ colouredSurfaces: true }))) assert.equal(p.getAttribute('data-export-ignore-dxf'), 'true');
    cleanup();
    const ui = render(<ViewSvg view={{ ...view, graphics: { colouredSurfaces: true } } as ProjectView} drawing={shown({ colouredSurfaces: true })} axis="front" drafts={[]} layers={[]} extraPatterns={[]} overlays={[]} />);
    assert.equal(ui.querySelectorAll('[fill="#cc331a"], [stroke="#cc331a"]').length, 0);
  });

  it('only an elevation or a section takes it', () => {
    assert.equal(drawsColoured({ kind: 'elevation' }, { colouredSurfaces: true }), true);
    assert.equal(drawsColoured({ kind: 'section' }, { colouredSurfaces: true }), true);
    assert.equal(drawsColoured({ kind: 'plan' }, { colouredSurfaces: true }), false);
    assert.equal(drawsColoured({ kind: 'elevation' }, { colouredSurfaces: false }), false);
    assert.equal((shown({ colouredSurfaces: true }, 'plan') as { surfaceFills?: unknown }).surfaceFills, undefined);
  });
});
