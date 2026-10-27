/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's north arrow and scale bar: the sheet on the screen (`SheetPaper`)
 * and the layout the PDF and DXF are written from (`sheetGraphic`) put the same
 * shapes at the same paper points, the arrow turned to the same true north and
 * the figures written in the same format, for one project.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { sheetFormat, type ProjectDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { trueNorthOf } from '@bimvoice/ifcsheet/true-north';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { useViewerStore } from '@/store';
import { parseSiteFixture, SITE_FIXTURE } from '@/test/site-fixture';
import { northArrowRotation } from '@/siteplan/true-north';
import { northDegrees } from '@bimvoice/ifcsheet/viewport-marks';
import { SheetPaper } from './SheetPaper';

const drawing = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 30, y: 20 } },
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 1 },
  lines: [], cutPolygons: [], projectionPolygons: [],
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;
const view = { id: 'v', kind: 'plan', name: 'Plan', createdAt: 0 } as unknown as ProjectView;
const viewport = (over: Partial<SheetViewport>): SheetViewport => ({ id: 'vp', viewId: 'v', x: 420, y: 297, scale: 50, width: 0, height: 0, center: null, ...over });
const sheetOf = (vp: SheetViewport): ProjectSheet => ({ id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [vp] });

const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
const flat = (run: readonly { x: number; y: number }[]): number[] => run.flatMap((p) => [p.x, p.y]);
const same = (a: number[], b: number[], what: string): void => {
  assert.equal(a.length, b.length, `${what}: ${a.length} numbers on the screen, ${b.length} in the layout`);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${what} [${i}]: screen ${v}, layout ${b[i]}`));
};

/** The screen and the layout for the same project; `north` is what the project's model states. */
async function bothSides(vp: SheetViewport) {
  const store = await parseSiteFixture();
  useViewerStore.setState({ ifcDataStore: store } as never);
  const sheet = sheetOf(vp);
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view, drawing, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const marks = ui.querySelector('[data-viewport-marks]');
  const units = useProjectStore.getState().unitsAndNumbers;
  const doc = { name: 'House', models: [], views: [view], sheets: [sheet] } as unknown as ProjectDocument;
  const layout = sheetGraphic(sheet, doc, new Map([['v', drawing]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, { north: trueNorthOf(store), locale: sheetFormat('en', units) });
  return { marks, layout };
}

describe('a viewport\'s north arrow and scale bar: the screen and the layout agree', () => {
  beforeEach(() => resetProject());
  afterEach(() => { cleanup(); useViewerStore.setState({ ifcDataStore: null } as never); });

  it('draw the same outlines, fills and figures at the same paper points', async () => {
    const { marks, layout } = await bothSides(viewport({ northArrow: true, scaleBar: true }));
    assert.ok(marks, 'the sheet draws the marks');
    const paths = [...marks.querySelectorAll('path')];
    const solids = paths.filter((p) => p.getAttribute('fill') === '#000');
    const strokes = paths.filter((p) => p.getAttribute('fill') === 'none');
    assert.equal(solids.length, layout.symbols.solids.length);
    assert.equal(strokes.length, layout.symbols.strokes.length);
    solids.forEach((p, i) => same(numbers(p.getAttribute('d') ?? ''), flat(layout.symbols.solids[i]), `solid ${i}`));
    strokes.forEach((p, i) => same(numbers(p.getAttribute('d') ?? ''), flat(layout.symbols.strokes[i]), `stroke ${i}`));
    const texts = [...marks.querySelectorAll('text')];
    assert.deepEqual(texts.map((t) => t.textContent), ['N', '0', '2.5', '5 m']);
    for (const t of texts) {
      const twin = layout.texts.find((l) => l.text === t.textContent && Math.abs(l.at.x - Number(t.getAttribute('x'))) < 1e-9 && Math.abs(l.at.y - Number(t.getAttribute('y'))) < 1e-9);
      assert.ok(twin, `${t.textContent} is in the layout at the same point`);
      assert.equal(Number(t.getAttribute('font-size')), twin.size);
    }
  });

  it('turn the arrow to the fixture\'s TrueNorth, 30 degrees counter-clockwise, on both', async () => {
    const { marks, layout } = await bothSides(viewport({ northArrow: true }));
    const axis = (d: string) => numbers(d);
    const line = [...(marks?.querySelectorAll('path[fill="none"]') ?? [])].map((p) => axis(p.getAttribute('d') ?? '')).find((n) => n.length === 4);
    assert.ok(line, 'the arrow\'s axis is drawn');
    const degrees = (tip: { x: number; y: number }, notch: { x: number; y: number }) => (Math.atan2(-(tip.x - notch.x), -(tip.y - notch.y)) * 180) / Math.PI;
    assert.ok(Math.abs(degrees({ x: line[0], y: line[1] }, { x: line[2], y: line[3] }) - SITE_FIXTURE.trueNorthDeg) < 1e-6, 'on the screen');
    const [tip, notch] = layout.symbols.strokes.filter((s) => s.length === 2)[0];
    assert.ok(Math.abs(degrees(tip, notch) - SITE_FIXTURE.trueNorthDeg) < 1e-6, 'in the layout');
  });

  it('write the figures with commas in a comma project, on both', async () => {
    useProjectStore.setState({ unitsAndNumbers: { separator: 'comma' } });
    const { marks, layout } = await bothSides(viewport({ scaleBar: true }));
    assert.deepEqual([...(marks?.querySelectorAll('text') ?? [])].map((t) => t.textContent), ['0', '2,5', '5 m']);
    assert.ok(layout.texts.some((t) => t.text === '2,5'));
  });

  it('draw nothing on a viewport that asks for nothing, on both', async () => {
    const { marks, layout } = await bothSides(viewport({}));
    assert.equal(marks, null);
    assert.deepEqual(layout.symbols, { strokes: [], solids: [] });
  });
});

describe('the angle of the arrow: the engine\'s and the site plan\'s agree', () => {
  it('for every direction, on a plan and a reflected plan', () => {
    for (const deg of [0, 17, 30, 90, 135, 180, 224, -50, -90]) {
      const north = { x: -Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) };
      for (const flipped of [false, true]) {
        const plane = { axis: 'y', position: 0, flipped } as const;
        const site = northArrowRotation(plane, 'down', north);
        assert.ok(site !== null);
        const turn = (((((site * 180) / Math.PI) - (northDegrees(plane, north) ?? NaN)) % 360) + 540) % 360 - 180;
        assert.ok(Math.abs(turn) < 1e-9, `${deg} degrees${flipped ? ' reflected' : ''}: site plan ${(site * 180) / Math.PI}, engine ${northDegrees(plane, north)}`);
      }
    }
  });
});
