/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #430: a site plan's north arrow and scale bar stand clear of its footprint, plot boundary and setback dimensions in the
 * headless build (PDF, DXF), by the same rule the app's sheet calls (`site-marks.ts`; the app side of the parity is
 * `viewport-marks-parity.test.tsx`). The geometry here is independent of the code under test: a paper rectangle for the
 * building and four paper segments for the plot.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { DraftEntity } from './draft-types.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';
import { hits, type Obstacle } from './free-spot.js';
import { convexHull, siteMarks, SITE_MARK_MARGIN_MM } from './site-marks.js';
import { ARROW_HALF_MM, ARROW_RADIUS_MM } from './viewport-marks.js';

type P = { x: number; y: number };

// A 80 x 60 m site at 1:200 is 400 x 300 mm, centred on (420, 297) of an A1 sheet: drawing (x, y) is paper (420 + (x - 40) * 5, 297 + (y - 30) * 5).
const paper = ({ x, y }: P): P => ({ x: 420 + (x - 40) * 5, y: 297 + (y - 30) * 5 });
const BUILDING = { x0: 50, y0: 0, x1: 80, y1: 40 };
const buildingCorners: P[] = [{ x: BUILDING.x0, y: BUILDING.y0 }, { x: BUILDING.x1, y: BUILDING.y0 }, { x: BUILDING.x1, y: BUILDING.y1 }, { x: BUILDING.x0, y: BUILDING.y1 }];
const PLOT: P[] = [{ x: 2, y: 2 }, { x: 78, y: 2 }, { x: 78, y: 58 }, { x: 2, y: 58 }];

const drawing = (): Drawing2D => ({
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 200 },
  lines: [],
  cutPolygons: [{ polygon: { outer: buildingCorners, holes: [] }, entityId: 3, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 80, y: 60 } },
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
});

const sheet: ProjectSheet = {
  id: 's', number: 'A-001', name: 'Site', createdAt: 0, paper: 'A1', orientation: 'landscape',
  viewports: [{ id: 'vp', viewId: 'site', x: 420, y: 297, scale: 200, width: 0, height: 0, center: null, northArrow: true, scaleBar: true }],
};
const doc = (): ProjectDocument => ({ name: 'Site', models: [], sheets: [sheet], views: [{ id: 'site', kind: 'plan', name: 'Site', createdAt: 0, site: true }] } as unknown as ProjectDocument);
const plot: DraftEntity = { id: 'plot', viewId: 'site', layerId: 'plot-boundary', shape: { type: 'polyline', pts: PLOT, closed: true }, params: {} };

const build = (drafts: DraftEntity[] = [plot]): SheetGraphic => sheetGraphic(sheet, doc(), new Map([['site', drawing()]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
  { north: null, locale: 'en' }, { annotations: { drafts, layers: [], groups: [], book: {} as never, locale: 'en' } });

/** Every point of a run, and points along its segments every half millimetre. */
const along = (run: readonly P[]): P[] => run.flatMap((a, i) => {
  const b = run[i + 1];
  if (!b) return [a];
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
  return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
});
const inBuilding = (p: P): boolean => {
  const [a, b] = [paper({ x: BUILDING.x0, y: BUILDING.y0 }), paper({ x: BUILDING.x1, y: BUILDING.y1 })];
  return p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y;
};
const distToPlot = (p: P): number => Math.min(...PLOT.map((s, i) => {
  const a = paper(s);
  const b = paper(PLOT[(i + 1) % PLOT.length]);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}));
const marksPoints = (g: SheetGraphic): P[] => [...g.symbols.strokes, ...g.symbols.solids].flatMap(along);

describe('a site plan\'s north arrow and scale bar (#430)', () => {
  it('stand clear of the footprint and the plot boundary, in the headless build', () => {
    const g = build();
    expect(g.symbols.strokes.length).toBeGreaterThan(0);
    expect(g.texts.map((t) => t.text)).toEqual(expect.arrayContaining(['N', '0', '10', '20 m']));
    const pts = marksPoints(g);
    expect(pts.filter(inBuilding)).toEqual([]);
    expect(Math.min(...pts.map(distToPlot))).toBeGreaterThanOrEqual(3 - 1e-9);
    for (const t of g.texts.filter((x) => ['N', '0', '10', '20 m'].includes(x.text))) {
      expect(inBuilding(t.at)).toBe(false);
      expect(distToPlot(t.at)).toBeGreaterThanOrEqual(3 - 1e-9);
    }
  });

  it('stay inside the viewport\'s box while a free spot is there', () => {
    const pts = marksPoints(build());
    const [a, b] = [paper({ x: 0, y: 0 }), paper({ x: 80, y: 60 })];
    expect(pts.every((p) => p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y)).toBe(true);
  });

  it('keep the corners when the plot has nothing there (no plot, no building: nothing to avoid)', () => {
    const empty = { ...drawing(), cutPolygons: [] };
    const g = sheetGraphic(sheet, doc(), new Map([['site', empty]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { north: null, locale: 'en' });
    const arrowTip = Math.min(...g.symbols.solids[0].map((p) => p.y));
    expect(arrowTip).toBeCloseTo(paper({ x: 0, y: 0 }).y + SITE_MARK_MARGIN_MM + ARROW_HALF_MM - ARROW_RADIUS_MM, 6);
  });
});

describe('the convex hull', () => {
  it('drops an interior point and a point on an edge', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }, { x: 2, y: 0 }]);
    expect(hull).toHaveLength(4);
  });
});

describe('siteMarks on its own', () => {
  const box = { x: 0, y: 0, w: 300, h: 200 };
  const input = { box, drawingArea: { x: 0, y: 0, w: 300, h: 200 }, scale: 200, arrowDegrees: 0, bar: true, locale: 'en' as const };
  const pts = (s: ReturnType<typeof siteMarks>): P[] => [...s.strokes, ...s.solids].flatMap(along);
  const clearOf = (s: ReturnType<typeof siteMarks>, o: Obstacle) => pts(s).every((p) => !hits({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, o, SITE_MARK_MARGIN_MM - 1e-6));

  it('moves the arrow off a setback figure drawn where it would go, and off a coordinate label', () => {
    const free = siteMarks({ ...input, bar: false, obstacles: [] });
    const arrowBox = { x0: Math.min(...pts(free).map((p) => p.x)), y0: Math.min(...pts(free).map((p) => p.y)), x1: Math.max(...pts(free).map((p) => p.x)), y1: Math.max(...pts(free).map((p) => p.y)) };
    const figure: Obstacle = { kind: 'box', box: arrowBox };
    const label: Obstacle = { kind: 'box', box: { x0: arrowBox.x0 - 40, y0: arrowBox.y0, x1: arrowBox.x0, y1: arrowBox.y1 + 30 } };
    const moved = siteMarks({ ...input, bar: false, obstacles: [figure, label] });
    expect(clearOf(moved, figure) && clearOf(moved, label)).toBe(true);
    expect(pts(moved).length).toBeGreaterThan(0);
  });

  it('puts the bar clear of the arrow', () => {
    const both = siteMarks({ ...input, obstacles: [] });
    const arrowOnly = siteMarks({ ...input, bar: false, obstacles: [] });
    const arrowPts = pts(arrowOnly);
    const barPts = pts(both).filter((p) => !arrowPts.some((a) => a.x === p.x && a.y === p.y));
    const [ax0, ax1] = [Math.min(...arrowPts.map((p) => p.x)), Math.max(...arrowPts.map((p) => p.x))];
    const [ay0, ay1] = [Math.min(...arrowPts.map((p) => p.y)), Math.max(...arrowPts.map((p) => p.y))];
    expect(barPts.some((p) => p.x >= ax0 && p.x <= ax1 && p.y >= ay0 && p.y <= ay1)).toBe(false);
  });

  it('goes beside the box when nothing inside is free', () => {
    const wall: Obstacle = { kind: 'area', ring: [{ x: -1, y: -1 }, { x: 301, y: -1 }, { x: 301, y: 201 }, { x: -1, y: 201 }] };
    const outside = siteMarks({ ...input, box: { x: 20, y: 20, w: 100, h: 100 }, drawingArea: { x: 0, y: 0, w: 300, h: 200 }, obstacles: [wall] });
    expect(pts(outside).some((p) => p.x > 120 || p.x < 20 || p.y > 120 || p.y < 20)).toBe(true);
  });
});
