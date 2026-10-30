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
import { COORDINATE_POINT_ID, sheetFormat, siteFrameOf, type ProjectDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { northOfStore } from '@bimvoice/ifcsheet/true-north';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { useViewerStore } from '@/store';
import { parseSiteFixture, SITE_FIXTURE } from '@/test/site-fixture';
import { northArrowRotation } from '@bimvoice/ifcsheet';
import { northDegrees } from '@bimvoice/ifcsheet/viewport-marks';
import { exportDxf } from '@bimvoice/ifcsheet/headless';
import { SheetPaper } from './SheetPaper';
import { sheetDxf } from './sheet-dxf';

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
async function bothSides(vp: SheetViewport, v: ProjectView = view, site?: object, shown: { drawing: Drawing2D; drafts: DraftEntity[] } = { drawing, drafts: [] }) {
  const store = await parseSiteFixture();
  useViewerStore.setState({ ifcDataStore: store } as never);
  const sheet = sheetOf(vp);
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view: v, drawing: shown.drawing, drafts: shown.drafts, ...(site ? { site: site as never } : {}) })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const marks = ui.querySelector('[data-viewport-marks]');
  const units = useProjectStore.getState().unitsAndNumbers;
  const doc = { name: 'House', models: [], views: [v], sheets: [sheet] } as unknown as ProjectDocument;
  const layout = sheetGraphic(sheet, doc, new Map([['v', shown.drawing]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { north: northOfStore(store), locale: sheetFormat('en', units) },
    shown.drafts.length ? { annotations: { drafts: shown.drafts, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, site: siteFrameOf({ dataStore: store, coordinateInfo: undefined as never }), locale: sheetFormat('en', units) } } : undefined);
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  return { marks, layout, screenDxf: new TextDecoder('windows-1252').decode(sheetDxf(svg, sheet)), engineDxf: exportDxf(layout) };
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

describe('a site plan viewport: one placement on the screen, in the PDF layout and in both DXFs', () => {
  // happy-dom has no layout and does not map presentation attributes to computed style: the DXF walker needs a screen CTM and the stroke, so give both (as view-dxf.test does for the CTM).
  const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
  const ownCtm = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
  const realStyle = window.getComputedStyle.bind(window);
  beforeEach(() => {
    resetProject();
    proto.getScreenCTM = () => new DOMMatrix();
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const style = realStyle(el, pseudo);
      return new Proxy(style, { get: (target, key) => (key === 'stroke' || key === 'fill' ? target[key] || el.getAttribute(key) || '' : Reflect.get(target, key) instanceof Function ? Reflect.get(target, key).bind(target) : Reflect.get(target, key)) });
    }) as typeof window.getComputedStyle;
  });
  afterEach(() => {
    cleanup(); useViewerStore.setState({ ifcDataStore: null } as never);
    window.getComputedStyle = realStyle;
    if (ownCtm) Object.defineProperty(proto, 'getScreenCTM', ownCtm); else delete proto.getScreenCTM;
  });
  const SITE_VIEW = { id: 'v', kind: 'plan', name: 'Site plan', site: true, createdAt: 0 } as unknown as ProjectView;
  // A site plan 30 x 20 m at 1:50 with a plot and a building (cut faces) over its top-right corner, where the corner placement would put the arrow.
  const BUILDING = [{ x: 14, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 12 }, { x: 14, y: 12 }];
  const site = { boundary: [{ x: 1, y: 1 }, { x: 29, y: 1 }, { x: 29, y: 19 }, { x: 1, y: 19 }], footprint: [BUILDING], setbacks: [] };
  const shown = {
    drawing: { ...drawing, cutPolygons: [{ polygon: { outer: BUILDING, holes: [] }, entityId: 3, ifcType: 'IfcWall', modelIndex: 0, isCut: true }] } as unknown as Drawing2D,
    drafts: [{ id: 'plot', viewId: 'v', layerId: 'plot-boundary', shape: { type: 'polyline', pts: site.boundary, closed: true }, params: {} }] as DraftEntity[],
  };

  it('draws the engine\'s shapes for a site plan too: the same marks at the same paper points as the layout, and none of the old live symbols', async () => {
    const { marks, layout } = await bothSides(viewport({}), SITE_VIEW, site, shown);
    assert.ok(marks, 'a site plan carries its marks by default');
    assert.equal(document.querySelectorAll('[data-site-symbol]').length, 0);
    const paths = [...marks.querySelectorAll('path')];
    const solids = paths.filter((p) => p.getAttribute('fill') === '#000');
    const strokes = paths.filter((p) => p.getAttribute('fill') === 'none');
    assert.ok(layout.symbols.solids.length > 0);
    assert.equal(solids.length, layout.symbols.solids.length);
    assert.equal(strokes.length, layout.symbols.strokes.length);
    solids.forEach((p, i) => same(numbers(p.getAttribute('d') ?? ''), flat(layout.symbols.solids[i]), `solid ${i}`));
    strokes.forEach((p, i) => same(numbers(p.getAttribute('d') ?? ''), flat(layout.symbols.strokes[i]), `stroke ${i}`));
    assert.deepEqual([...marks.querySelectorAll('text')].map((t) => t.textContent), ['N', '0', '2.5', '5 m']);
    // Clear of the building: its paper box is x 420 + (14 - 15) * 20 .. 420 + 15 * 20, y 297 - 200 .. 297 - 200 + 12 * 20.
    const inBuilding = (q: { x: number; y: number }) => q.x >= 400 && q.x <= 720 && q.y >= 97 && q.y <= 337;
    assert.ok(![...layout.symbols.strokes, ...layout.symbols.solids].flat().some(inBuilding), 'the layout keeps the marks off the building');
  });

  it('and the DXF the screen makes carries the same marks as the DXF the engine makes, on the SITE-SYMBOLS layer', async () => {
    const { screenDxf, engineDxf } = await bothSides(viewport({}), SITE_VIEW, site, shown);
    const onLayer = (dxf: string) => dxf.split(/\r?\n/).filter((l) => l.trim() === 'SITE-SYMBOLS').length;
    assert.ok(onLayer(engineDxf) > 0, 'the engine writes the marks');
    assert.ok(onLayer(screenDxf) > 0, 'the screen writes the marks');
  });

  it('a viewport that says no gets none, on both', async () => {
    const { marks, layout } = await bothSides(viewport({ northArrow: false, scaleBar: false }), SITE_VIEW, site, shown);
    assert.equal(marks, null);
    assert.deepEqual(layout.symbols, { strokes: [], solids: [] });
  });
});

describe('a coordinate point on a georeferenced model (#479): the screen and the layout write the same Easting and Northing', () => {
  beforeEach(() => resetProject());
  afterEach(() => { cleanup(); useViewerStore.setState({ ifcDataStore: null } as never); });
  const point = (p: { x: number; y: number }): DraftEntity => ({ id: `cp${p.x}`, viewId: 'v', layerId: '0', shape: { type: 'symbol', symbolId: COORDINATE_POINT_ID, p, scale: 0.1, rotation: 0 }, params: {} } as DraftEntity);
  /** The coordinate lines the screen writes (its `E ...` and `N ...` texts) and the layout's, for points drawn on the fixture. */
  async function lines(points: { x: number; y: number }[]) {
    const { layout } = await bothSides(viewport({}), view, undefined, { drawing, drafts: points.map(point) });
    return layout.texts.map((t) => t.text).filter((t) => /^[EN] /.test(t));
  }
  const screenLines = async (points: { x: number; y: number }[]) => {
    const store = await parseSiteFixture();
    useViewerStore.setState({ ifcDataStore: store } as never);
    const ui = render(<SheetPaper sheet={sheetOf(viewport({}))} projectName="House" content={() => ({ view, drawing, drafts: points.map(point) })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
    return [...ui.querySelectorAll('text')].map((t) => t.textContent ?? '').filter((t) => /^[EN] /.test(t));
  };

  it('for points over the fixture\'s plan, the figures are the same and are map coordinates, not local ones', async () => {
    const points = [{ x: 2, y: 3 }, { x: 14.5, y: 7.25 }];
    const engine = await lines(points);
    const screen = await screenLines(points);
    assert.equal(engine.length, 4, `two lines a point: ${engine.join('|')}`);
    assert.deepEqual(engine, screen);
    // Stereo 70 eastings of the fixture are around 588 km: a local X would be a few metres.
    assert.ok(Number(engine[0].slice(2)) > 500_000, engine[0]);
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
