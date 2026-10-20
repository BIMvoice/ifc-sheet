/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Issue #48: the site plan's frames. Map coordinates, the north arrow, the
 * scale bar, setbacks and the key plan, each checked against a value worked
 * out here independently of the code under test (the IfcMapConversion
 * formula, the TrueNorth angle, the labelled length, the drawn offsets, the
 * viewport's extent).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { drawingToScreen, worldToDrawing } from '@/drafting/frame';
import { flattenShape, placeSymbol } from '@/drafting/symbols';
import type { DraftEntity, Pt, SymbolInstanceShape } from '@/drafting/types';
import { selectAnchorGeoref } from '@/lib/geo/select-anchor-georef';
import { annotationAtFactor } from '@/project/viewport-annotation';
import type { ProjectView, SheetViewport } from '@/project/types';
import { viewportTransform } from '@/components/viewer/sheets/SheetPaper';
import { parseSiteFixture, SITE_FIXTURE } from '@/test/site-fixture';
import { drawingPointToMap, type MapAnchor } from './map-coordinates';
import { liveSymbol, COORDINATE_POINT_ID, NORTH_ARROW_ID, SCALE_BAR_ID } from './live-symbols';
import { liveSymbolContext, type SiteFrame } from './site-frame';
import { trueNorthOf } from './true-north';
import { plotAreaOf, PLOT_BOUNDARY_LAYER, setbacks } from './plot';
import { keyPlanHighlight, viewportExtent } from './key-plan';
import { footprintArea, footprintRings, offsetRing, outerRings } from './footprint';
import type { DrawingPolygon } from '@ifc-lite/drawing-2d';

/** A plan as the drawing generator cuts it: axis y (viewer up), not flipped. */
const PLAN: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
/** IFC project (x, y) → viewer (x, z = −y) → the plan's drawing point, as the kernel and the generator place it. */
const drawingOfModel = (x: number, y: number): Pt => worldToDrawing(PLAN, { x, y: 1.2, z: -y });

async function fixtureAnchor(): Promise<MapAnchor> {
  const store = await parseSiteFixture();
  const selection = selectAnchorGeoref({ models: new Map(), legacyDataStore: store, georefMutations: new Map() });
  assert.ok(selection, 'the fixture is georeferenced');
  // No coordinate info: the model was not shifted, its IFC origin is the viewer origin.
  return { eff: selection.eff, originViewer: { x: 0, y: 0, z: 0 } };
}

const frameOf = (over: Partial<SiteFrame>): SiteFrame => ({ north: null, northSource: null, anchor: null, frameOffset: { x: 0, y: 0, z: 0 }, ...over });
const labels = (kind: 'map' | 'local', a: string, b: string) => (kind === 'map' ? [`E ${a}`, `N ${b}`] : [`X ${a}`, `Y ${b}`]);
const symbol = (symbolId: string, p: Pt = { x: 0, y: 0 }, scale = 1, rotation = 0): SymbolInstanceShape => ({ type: 'symbol', symbolId, p, scale, rotation });

describe('site plan map coordinates (#48)', () => {
  it('labels a model point with E/N from the IfcMapConversion formula, within 1 mm', async () => {
    const anchor = await fixtureAnchor();
    const theta = Math.atan2(SITE_FIXTURE.xAxisOrdinate, SITE_FIXTURE.xAxisAbscissa);
    for (const [x, y] of [[0, 0], [12.5, -7.25], [-31.4, 18.9], [100, 100]]) {
      const expected = {
        e: SITE_FIXTURE.eastings + SITE_FIXTURE.scale * (x * Math.cos(theta) - y * Math.sin(theta)),
        n: SITE_FIXTURE.northings + SITE_FIXTURE.scale * (x * Math.sin(theta) + y * Math.cos(theta)),
      };
      const got = drawingPointToMap(PLAN, drawingOfModel(x, y), anchor);
      assert.ok(Math.abs(got.e - expected.e) < 0.001, `E at (${x}, ${y}): ${got.e} vs ${expected.e}`);
      assert.ok(Math.abs(got.n - expected.n) < 0.001, `N at (${x}, ${y}): ${got.n} vs ${expected.n}`);
      assert.equal(got.crs, 'EPSG:3844');
    }
  });

  it('a coordinate point prints those E/N with two decimals', async () => {
    const anchor = await fixtureAnchor();
    const ctx = liveSymbolContext(frameOf({ anchor }), PLAN, 'down', 200, 'en', labels);
    const p = drawingOfModel(12.5, -7.25);
    const { def } = liveSymbol(symbol(COORDINATE_POINT_ID, p), ctx);
    const texts = def?.shapes.flatMap((s) => (s.type === 'text' ? [s.text] : [])) ?? [];
    const m = drawingPointToMap(PLAN, p, anchor);
    assert.deepEqual(texts, [`E ${m.e.toFixed(2)}`, `N ${m.n.toFixed(2)}`]);
  });
});

/** The angle, degrees, of a paper direction (y down) counter-clockwise from the paper's up. */
const paperAngleFromUp = (d: Pt): number => (Math.atan2(-d.x, -d.y) * 180) / Math.PI;

describe('north arrow from the model (#48)', () => {
  it('reads the Model context TrueNorth, IFC4 and IFC2X3 alike', async () => {
    for (const schema of ['IFC4', 'IFC2X3'] as const) {
      const north = trueNorthOf(await parseSiteFixture(schema));
      assert.ok(north, schema);
      const deg = (Math.atan2(-north.x, north.y) * 180) / Math.PI;
      assert.ok(Math.abs(deg - SITE_FIXTURE.trueNorthDeg) < 1e-6, `${schema}: ${deg}`);
    }
  });

  it('points on paper at the angle between the view up and true north, within 0.1°', async () => {
    const north = trueNorthOf(await parseSiteFixture());
    const ctx = liveSymbolContext(frameOf({ north }), PLAN, 'down', 100, 'en', labels);
    // Placed by the user unrotated; the model turns it.
    const { def, at } = liveSymbol(symbol(NORTH_ARROW_ID, { x: 4, y: 6 }, 0.1, 0), ctx);
    assert.ok(def);
    const shaft = placeSymbol(def, at, -1).geometry.find((g) => g.type === 'line');
    assert.ok(shaft && shaft.type === 'line');
    // The shaft runs from the tail (symbol y −4) to the tip (y 8); on paper (a 1:100 viewport, drawing → mm).
    const t = { scale: 10, x: 100, y: 100 };
    const tail = drawingToScreen(shaft.a, t, 'down');
    const tip = drawingToScreen(shaft.b, t, 'down');
    // Paper up is project +Y on an unflipped plan; true north is 30° counter-clockwise from it.
    const got = paperAngleFromUp({ x: tip.x - tail.x, y: tip.y - tail.y });
    assert.ok(Math.abs(got - SITE_FIXTURE.trueNorthDeg) < 0.1, `arrow at ${got}°`);
  });
});

describe('scale bar follows its viewport (#48)', () => {
  const measure = (viewportScale: number, viewScale: number) => {
    const ctx = liveSymbolContext(frameOf({}), PLAN, 'down', viewportScale, 'en', labels);
    // The user scaled the bar up; its ticks must still be metres of the drawing.
    const stored = symbol(SCALE_BAR_ID, { x: 3, y: 4 }, 1.7, 0);
    const shown = annotationAtFactor(stored, viewportScale / viewScale);
    assert.ok(shown.type === 'symbol');
    const { def, at } = liveSymbol(shown, ctx);
    assert.ok(def);
    const placed = placeSymbol(def, at, -1);
    const vp: SheetViewport = { id: 'vp', viewId: 'v', x: 200, y: 150, scale: viewportScale, width: 0, height: 0, center: { x: 0, y: 0 } };
    const t = viewportTransform(vp, null, 'down');
    const ticks = placed.geometry
      .flatMap((g) => (g.type === 'line' && Math.abs(g.a.x - g.b.x) < 1e-9 ? [drawingToScreen(g.a, t, 'down').x] : []))
      .sort((a, b) => a - b);
    const values = placed.texts.filter((x) => x.text !== 'm').map((x) => Number(x.text)).sort((a, b) => a - b);
    return { ticks, values };
  };

  for (const [viewportScale, viewScale, expected] of [[100, 100, [0, 2.5, 5, 10]], [200, 200, [0, 5, 10, 20]], [200, 100, [0, 5, 10, 20]]] as const) {
    it(`at 1:${viewportScale} (view drawn at 1:${viewScale}) each division measures its label on paper, within 0.1 mm`, () => {
      const { ticks, values } = measure(viewportScale, viewScale);
      assert.deepEqual(values, [...expected]);
      assert.equal(ticks.length, values.length);
      for (let i = 1; i < ticks.length; i++) {
        const mm = ticks[i] - ticks[0];
        assert.ok(Math.abs(mm - (values[i] * 1000) / viewportScale) < 0.1, `${values[i]} m drawn ${mm} mm at 1:${viewportScale}`);
      }
    });
  }

  it('10 m is 100 mm at 1:100', () => {
    const { ticks, values } = measure(100, 100);
    assert.equal(values.at(-1), 10);
    assert.ok(Math.abs((ticks.at(-1) ?? 0) - ticks[0] - 100) < 0.1);
  });
});

describe('setbacks to a drawn plot boundary (#48)', () => {
  // Footprint 20 × 12 m; plot drawn with the building 10 m from the west, 12 from the east, 9 from the south, 8 from the north.
  const footprint = [[{ x: 10, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 17 }, { x: 10, y: 17 }]];
  const plot = [{ x: 0, y: -4 }, { x: 42, y: -4 }, { x: 42, y: 25 }, { x: 0, y: 25 }];

  it('gives each side the offset it was drawn with', () => {
    const got = setbacks(footprint, plot).map((s) => [s.edge, Number(s.distance.toFixed(6))]);
    // Edges in boundary order: south (y = −4), east (x = 42), north (y = 25), west (x = 0).
    assert.deepEqual(got, [[0, 9], [1, 12], [2, 8], [3, 10]]);
  });

  it('measures each perpendicular to its edge, from the footprint to the boundary', () => {
    for (const s of setbacks(footprint, plot)) {
      const a = plot[s.edge];
      const b = plot[(s.edge + 1) % plot.length];
      const along = (s.to.x - s.from.x) * (b.x - a.x) + (s.to.y - s.from.y) * (b.y - a.y);
      assert.ok(Math.abs(along) < 1e-9, `edge ${s.edge} not perpendicular`);
      assert.ok(footprint[0].some((p) => p.x === s.from.x && p.y === s.from.y));
    }
  });

  it('the plot area is the drawn boundary\'s, for the urban indicators to take', () => {
    const site: ProjectView = { id: 'site', name: 'Site plan', kind: 'plan', site: true, createdAt: 0, cutHeight: 1.2, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] } };
    const boundary: DraftEntity = { id: 'b', viewId: 'site', layerId: PLOT_BOUNDARY_LAYER.id, params: {}, shape: { type: 'polyline', pts: plot, closed: true } };
    const elsewhere: DraftEntity = { ...boundary, id: 'c', layerId: '0', shape: { type: 'polyline', pts: plot.map((p) => ({ x: p.x * 2, y: p.y * 2 })), closed: true } };
    assert.equal(plotAreaOf({ views: [site], drafts: [boundary, elsewhere] }), 42 * 29);
    assert.equal(plotAreaOf({ views: [{ ...site, site: undefined }], drafts: [boundary] }), null);
  });
});

describe('key plan (#48)', () => {
  it('outlines exactly the plan extent its keyed viewport shows', () => {
    // A 120 × 80 mm viewport at 1:50 centred on drawing (5, 3): it shows x 2..8, y 1..5 m.
    const keyed: SheetViewport = { id: 'a', viewId: 'v', x: 300, y: 200, scale: 50, width: 120, height: 80, center: { x: 5, y: 3 } };
    const key: SheetViewport = { id: 'k', viewId: 'v', x: 700, y: 500, scale: 500, width: 0, height: 0, center: { x: 0, y: 0 }, keyPlanOf: 'a' };
    const extent = viewportExtent({ x: 240, y: 160, width: 120, height: 80 }, viewportTransform(keyed, null, 'down'), 'down');
    assert.deepEqual(extent, { min: { x: 2, y: 1 }, max: { x: 8, y: 5 } });
    // At 1:500 a metre is 2 mm, around the key plan's centre at drawing (0, 0).
    const rect = keyPlanHighlight(extent, viewportTransform(key, null, 'down'), 'down');
    for (const [k, v] of Object.entries({ x: 704, y: 502, width: 12, height: 8 })) {
      assert.ok(Math.abs(rect[k as keyof typeof rect] - v) < 1e-9, `${k}: ${rect[k as keyof typeof rect]} vs ${v}`);
    }
  });
});

describe('the scale bar outline (#48)', () => {
  it('is as long as its last label', () => {
    const ctx = liveSymbolContext(frameOf({}), PLAN, 'down', 500, 'en', labels);
    const { def, at } = liveSymbol(symbol(SCALE_BAR_ID), ctx);
    assert.ok(def);
    const xs = placeSymbol(def, at, -1).geometry.flatMap((g) => flattenShape(g).pts.map((p) => p.x));
    assert.equal(Math.max(...xs), 40);
  });
});

describe('footprint from the ground storey cut (#48)', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];

  it('offsets a ring outward by the distance, whichever way it turns', () => {
    for (const ring of [square, [...square].reverse()]) {
      const grown = offsetRing(ring, 0.5);
      const xs = grown.map((p) => p.x);
      const ys = grown.map((p) => p.y);
      assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-0.5, 10.5, -0.5, 6.5]);
      const back = offsetRing(grown, -0.5);
      back.forEach((p, i) => assert.ok(Math.hypot(p.x - ring[i].x, p.y - ring[i].y) < 1e-9));
    }
  });

  it('keeps the outer rings of a union, the rooms filled', () => {
    const room = [{ x: 0.3, y: 0.3 }, { x: 9.7, y: 0.3 }, { x: 9.7, y: 5.7 }, { x: 0.3, y: 5.7 }];
    const column = [{ x: 4, y: 2 }, { x: 4.4, y: 2 }, { x: 4.4, y: 2.4 }, { x: 4, y: 2.4 }];
    const apart = [{ x: 20, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 1 }, { x: 20, y: 1 }];
    assert.deepEqual(outerRings([square, room, column, apart]), [square, apart]);
  });

  it('measures the outline as drawn, the closing growth taken back', () => {
    const polygon = (outer: Pt[], ifcType: string): DrawingPolygon => ({ polygon: { outer, holes: [] }, entityId: 1, ifcType, modelIndex: 0, isCut: true });
    const wallRing = polygon(square, 'IfcWall');
    const furniture = polygon([{ x: -5, y: -5 }, { x: 30, y: -5 }, { x: 30, y: 30 }, { x: -5, y: 30 }], 'IfcFurnishingElement');
    // A union that changes nothing: the one ring stays one shape.
    const rings = footprintRings([wallRing, furniture], (r) => r);
    assert.equal(rings.length, 1);
    assert.ok(Math.abs(footprintArea(rings) - 60) < 1e-9);
  });
});
