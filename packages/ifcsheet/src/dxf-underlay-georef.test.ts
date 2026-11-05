/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A surveyor's DXF under a site plan, placed by the model's IfcMapConversion, and moved when the placement changes (#182). */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { importDxf, type Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { alignDxfByTwoPoints, dxfPointToDrawing, dxfUnderlayFromPaths, type ViewDxfUnderlay } from './dxf-underlay.js';
import { placeDxfByMapConversion } from './dxf-underlay-georef.js';
import { sheetGraphic } from './sheet-graphic.js';

const MC = { eastings: 500_000, northings: 6_000_000, xAxisAbscissa: Math.cos(0.3), xAxisOrdinate: Math.sin(0.3), scale: 1 };

/** The model's plan point (x, y) as the conversion maps it, in the DXF importer's frame (E, -N). */
const surveyOf = (x: number, y: number, mc = MC) => {
  const s = mc.scale;
  return { x: mc.eastings + s * (mc.xAxisAbscissa * x - mc.xAxisOrdinate * y), y: -(mc.northings + s * (mc.xAxisOrdinate * x + mc.xAxisAbscissa * y)) };
};

/** A boundary that lies at model points (1,1), (9,1), (9,3), written in survey coordinates. */
const survey = (): ViewDxfUnderlay => ({
  id: 'd1', viewId: 'v1', name: 'survey.dxf', at: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1, locked: false, printOnSheets: ['s1'],
  layers: [{ name: 'BOUNDARY', colour: '#00aaff', visible: true, runs: [[surveyOf(1, 1), surveyOf(9, 1), surveyOf(9, 3)]] }],
});

describe('placed by the map conversion (#182)', () => {
  it('a survey point lands on the model point the conversion maps to it, drawing frame (x, -y)', () => {
    const placed = placeDxfByMapConversion(survey(), MC)!;
    for (const [x, y] of [[0, 0], [12.5, -3], [40, 25]]) {
      const p = dxfPointToDrawing(placed, surveyOf(x, y));
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(-y, 6);
    }
  });

  it('the conversion origin lands on the model origin; a scale of 0.001 (mm in the model) scales the lines', () => {
    const origin = dxfPointToDrawing(placeDxfByMapConversion(survey(), { eastings: 10, northings: 20 })!, { x: 10, y: -20 });
    expect(Math.hypot(origin.x, origin.y)).toBeLessThan(1e-9);
    const mm = dxfPointToDrawing(placeDxfByMapConversion(survey(), { eastings: 0, northings: 0, scale: 0.001 })!, { x: 1, y: 0 });
    expect(mm.x).toBeCloseTo(1000, 6);
  });

  it('refuses a conversion that is not usable', () => {
    expect(placeDxfByMapConversion(survey(), { eastings: Number.NaN, northings: 0 })).toBeNull();
    expect(placeDxfByMapConversion(survey(), { eastings: 0, northings: 0, xAxisAbscissa: 0, xAxisOrdinate: 0 })).toBeNull();
  });
});

const drawing: Drawing2D = {
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 10, y: 4 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 }],
  cutPolygons: [], projectionPolygons: [],
  bounds: { min: { x: 0, y: -6 }, max: { x: 10, y: 4 } },
  stats: { cutLineCount: 0, projectionLineCount: 1, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
};
const sheet: ProjectSheet = {
  id: 's1', number: 'S1', name: 's1', createdAt: 0, paper: 'A3', orientation: 'landscape',
  viewports: [{ id: 'vp-s1', viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }],
};
const printedFirstPoint = (u: ViewDxfUnderlay) => {
  const doc: ProjectDocument = {
    name: 'Site', models: [], sheets: [sheet], dxfUnderlays: [u],
    views: [{ id: 'v1', kind: 'plan', name: 'Site', createdAt: 0, cutHeight: 1.2, level: { name: 'Site', elevation: 0, storeyGlobalIds: [] } }],
  };
  return sheetGraphic(sheet, doc, new Map([['v1', drawing]])).strokes?.[0]?.runs[0]?.[0];
};

describe('a change of placement moves the printed lines (#182)', () => {
  it('the georeferenced DXF prints at the model; a moved conversion and two picked points each move it on the sheet', () => {
    const placed = placeDxfByMapConversion(survey(), MC)!;
    const first = printedFirstPoint(placed)!;
    expect(first).toBeDefined();
    // The conversion origin half a metre further east moves the lines half a metre on the plan, 10 mm of paper at 1:50.
    const moved = printedFirstPoint(placeDxfByMapConversion(survey(), { ...MC, eastings: MC.eastings + 0.5 })!)!;
    expect(Math.hypot(moved.x - first.x, moved.y - first.y)).toBeGreaterThan(5);
    const from = [dxfPointToDrawing(placed, surveyOf(1, 1)), dxfPointToDrawing(placed, surveyOf(9, 1))] as const;
    const picked = alignDxfByTwoPoints(placed, from, [{ x: from[0].x + 3, y: from[0].y }, { x: from[1].x + 3, y: from[1].y }])!;
    expect(Math.hypot(printedFirstPoint(picked)!.x - first.x, printedFirstPoint(picked)!.y - first.y)).toBeGreaterThan(5);
  });
});

const FIXTURE_NAME = 'columns_R2018.dxf';
const find = (dir: string): string | null => {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      const hit = find(p);
      if (hit) return hit;
    } else if (e === FIXTURE_NAME) return p;
  }
  return null;
};
const fixture = find(join(__dirname, '../../../tests/models'));
if (!fixture) console.warn(`${FIXTURE_NAME} not found under tests/models: run pnpm fixtures (the fixture test is skipped).`);

describe.skipIf(!fixture)('ezdxf columns_R2018.dxf (#182)', () => {
  it('reads as an underlay and, with its corner as the conversion origin, lands that corner on the model origin', () => {
    const u = dxfUnderlayFromPaths(importDxf(readFileSync(fixture!, 'utf8'), FIXTURE_NAME), 'v1', 'd1');
    expect(u).not.toBeNull();
    const pts = u!.layers.flatMap((l) => l.runs.flat());
    const corner = { x: Math.min(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
    const placed = placeDxfByMapConversion(u!, { eastings: corner.x, northings: -corner.y })!;
    const at = dxfPointToDrawing(placed, corner);
    expect(Math.hypot(at.x, at.y)).toBeLessThan(1e-6);
  });
});
