/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A DXF drawing under a plan view (#547): placed by two picked points, its layers on or off, printed on the sheets
 * that name it (by the layers that are on), and read from the project file.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { alignDxfByTwoPoints, dxfPointToDrawing, dxfUnderlayFromPaths, dxfUnderlayRuns, withDxfLayerVisible, type ViewDxfUnderlay } from './dxf-underlay.js';
import { readDxfUnderlays } from './dxf-underlay-read.js';
import { placer, sheetGraphic } from './sheet-graphic.js';

const WALLS = '#ff0000';
const FURNITURE = '#00aa00';

const base = (): ViewDxfUnderlay => ({
  id: 'd1', viewId: 'v1', name: 'consultant.dxf', at: { x: 0, y: 0 }, scale: 1, rotation: 0, opacity: 1, locked: false, printOnSheets: ['s1'],
  layers: [
    { name: 'WALLS', colour: WALLS, visible: true, runs: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]] },
    { name: 'FURNITURE', colour: FURNITURE, visible: true, runs: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]] },
  ],
});

describe('two-point alignment (#547)', () => {
  it('puts the two picked points on their targets within a tenth of a millimetre', () => {
    const u = { ...base(), at: { x: 2, y: -1 }, scale: 0.001, rotation: 0.2 };
    // Two corners as they show now, and where they belong in the model plan (a turn, a scale and a shift away).
    const from = [dxfPointToDrawing(u, { x: 0, y: 0 }), dxfPointToDrawing(u, { x: 4, y: 3 })] as const;
    const to = [{ x: 12.5, y: 8.25 }, { x: 12.5 + 4.2, y: 8.25 + 3.1 }] as const;
    const aligned = alignDxfByTwoPoints(u, from, to);
    expect(aligned).not.toBeNull();
    const a = dxfPointToDrawing(aligned!, { x: 0, y: 0 });
    const b = dxfPointToDrawing(aligned!, { x: 4, y: 3 });
    expect(Math.hypot(a.x - to[0].x, a.y - to[0].y)).toBeLessThan(1e-4);
    expect(Math.hypot(b.x - to[1].x, b.y - to[1].y)).toBeLessThan(1e-4);
  });

  it('refuses two points that coincide or a target that does', () => {
    const p = { x: 1, y: 1 };
    expect(alignDxfByTwoPoints(base(), [p, p], [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull();
    expect(alignDxfByTwoPoints(base(), [{ x: 0, y: 0 }, p], [p, p])).toBeNull();
  });
});

describe('layers (#547)', () => {
  it('a layer that is off has no lines to draw, snap to or print', () => {
    const off = withDxfLayerVisible(base(), 'FURNITURE', false);
    expect(dxfUnderlayRuns(off).map((r) => r.layer)).toEqual(['WALLS']);
    expect(dxfUnderlayRuns(base()).map((r) => r.layer)).toEqual(['WALLS', 'FURNITURE']);
  });

  it('a converted DXF is turned into a plan once, a closed path closed, an empty layer left out', () => {
    const made = dxfUnderlayFromPaths({
      name: 'a.dxf',
      layers: [
        { name: 'A', color: '#111', visible: true, paths: [{ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }], closed: true }] },
        { name: 'EMPTY', color: '#222', visible: true, paths: [] },
      ],
    }, 'v1', 'd9');
    expect(made?.layers.map((l) => l.name)).toEqual(['A']);
    expect(made?.layers[0].runs[0]).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -1 }, { x: 0, y: 0 }]);
  });
});

const drawing: Drawing2D = {
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 10, y: 4 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 }],
  cutPolygons: [], projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 4 } },
  stats: { cutLineCount: 0, projectionLineCount: 1, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
};
const sheet = (id: string): ProjectSheet => ({
  id, number: id.toUpperCase(), name: id, createdAt: 0, paper: 'A3', orientation: 'landscape',
  viewports: [{ id: `vp-${id}`, viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }],
});
const doc = (u: ViewDxfUnderlay): ProjectDocument => ({
  name: 'Casă', models: [], sheets: [sheet('s1'), sheet('s2')], dxfUnderlays: [u],
  views: [{ id: 'v1', kind: 'plan', name: 'Parter', createdAt: 0, cutHeight: 1.2, level: { name: 'Parter', elevation: 0, storeyGlobalIds: [] } }],
});
const strokesOf = (u: ViewDxfUnderlay, sheetId: string) => {
  const d = doc(u);
  return sheetGraphic(d.sheets.find((s) => s.id === sheetId)!, d, new Map([['v1', drawing]])).strokes ?? [];
};

describe('printing (#547)', () => {
  it('a sheet that names it prints one stroke per layer that is on, where the app places the lines; another sheet prints none', () => {
    const strokes = strokesOf(base(), 's1');
    expect(strokes.map((s) => s.colour).sort()).toEqual([FURNITURE, WALLS].sort());
    const walls = strokes.find((s) => s.colour === WALLS)!;
    const at = placer(drawing, sheet('s1').viewports![0], null);
    const expected = at({ x: 4, y: 0 });
    expect(walls.runs[0].some((p) => Math.abs(p.x - expected.x) < 1e-6 && Math.abs(p.y - expected.y) < 1e-6)).toBe(true);
    expect(strokesOf(base(), 's2')).toEqual([]);
  });

  it('a layer that is off is not printed', () => {
    const strokes = strokesOf(withDxfLayerVisible(base(), 'FURNITURE', false), 's1');
    expect(strokes.map((s) => s.colour)).toEqual([WALLS]);
  });
});

describe('the project file (#547)', () => {
  it('reads what it writes and refuses a damaged entry with its path', () => {
    const u = base();
    expect(readDxfUnderlays({ dxfUnderlays: [JSON.parse(JSON.stringify(u))] })).toEqual([u]);
    expect(readDxfUnderlays({})).toEqual([]);
    expect(() => readDxfUnderlays({ dxfUnderlays: [{ ...u, layers: [{ name: 'X', runs: [[{ x: 0, y: 0 }]] }] }] })).toThrow('/dxfUnderlays/0/layers/0/runs/0');
  });
});
