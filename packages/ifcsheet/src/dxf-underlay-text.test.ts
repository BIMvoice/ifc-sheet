/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A consultant's DXF keeps its room names and symbols under a plan view (#547): TEXT, MTEXT (codes stripped), a block's lines and text through
 * INSERT (turned with it), an ARC, a hatch boundary; each shows in the underlay and on the printed sheet, a layer that is off takes its text
 * with it, and a block that holds itself is cut at the converter's bound.
 */

import { importDxf, type Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { dxfUnderlayFromPaths, dxfUnderlayTexts, dxfUnderlayRuns, withDxfLayerVisible, type ViewDxfUnderlay } from './dxf-underlay.js';
import { readDxfUnderlays } from './dxf-underlay-read.js';
import { placer, sheetGraphic } from './sheet-graphic.js';

const pairs = (...p: (string | number)[]): string => p.join('\n');
const layer = (name: string, aci: number) => pairs(0, 'LAYER', 2, name, 70, 0, 62, aci, 6, 'CONTINUOUS');
const DXF = pairs(
  0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC',
  0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', layer('ROOMS', 1), layer('SYMBOLS', 3), layer('ARCS', 5), layer('FILL', 2), 0, 'ENDTAB', 0, 'ENDSEC',
  0, 'SECTION', 2, 'BLOCKS',
  0, 'BLOCK', 8, 0, 2, 'DOOR', 10, 0, 20, 0, 0, 'LINE', 8, 0, 10, 0, 20, 0, 11, 1, 21, 0, 0, 'TEXT', 8, 0, 10, 0.5, 20, 0, 40, 0.2, 1, 'D1', 0, 'ENDBLK',
  0, 'BLOCK', 8, 0, 2, 'LOOP', 10, 0, 20, 0, 0, 'LINE', 8, 0, 10, 0, 20, 0, 11, 0.1, 21, 0, 0, 'INSERT', 8, 0, 2, 'LOOP', 10, 0.1, 20, 0, 0, 'ENDBLK',
  0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES',
  0, 'TEXT', 8, 'ROOMS', 10, 2, 20, 1, 40, 0.25, 1, 'Living',
  0, 'MTEXT', 8, 'ROOMS', 10, 5, 20, 1, 40, 0.3, 71, 1, 1, '{\\fArial|b1;Kitchen}\\Pbath',
  0, 'INSERT', 8, 'SYMBOLS', 2, 'DOOR', 10, 3, 20, 3, 50, 90,
  0, 'ARC', 8, 'ARCS', 10, 0, 20, 0, 40, 2, 50, 0, 51, 90,
  0, 'CIRCLE', 8, 'ARCS', 10, 6, 20, 0, 40, 0.5,
  0, 'HATCH', 8, 'FILL', 70, 1, 91, 1, 92, 7, 72, 0, 73, 1, 93, 4, 10, 8, 20, 0, 10, 9, 20, 0, 10, 9, 20, 1, 10, 8, 20, 1,
  0, 'INSERT', 8, 'SYMBOLS', 2, 'LOOP', 10, 7, 20, 7,
  0, 'ENDSEC', 0, 'EOF',
);

const made = (): ViewDxfUnderlay => {
  const u = dxfUnderlayFromPaths(importDxf(DXF, 'plan.dxf'), 'v1', 'd1');
  if (!u) throw new Error('the DXF kept nothing');
  return { ...u, opacity: 1, printOnSheets: ['s1'] };
};
const layerOf = (u: ViewDxfUnderlay, name: string) => u.layers.find((l) => l.name === name);

const drawing: Drawing2D = {
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 10, y: 4 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 }],
  cutPolygons: [], projectionPolygons: [],
  bounds: { min: { x: -2, y: -10 }, max: { x: 12, y: 4 } },
  stats: { cutLineCount: 0, projectionLineCount: 1, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
};
const sheet: ProjectSheet = {
  id: 's1', number: 'S1', name: 's1', createdAt: 0, paper: 'A3', orientation: 'landscape',
  viewports: [{ id: 'vp-s1', viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }],
};
const printed = (u: ViewDxfUnderlay) => {
  const d: ProjectDocument = { name: 'Casă', models: [], sheets: [sheet], dxfUnderlays: [u], views: [{ id: 'v1', kind: 'plan', name: 'Parter', createdAt: 0, cutHeight: 1.2, level: { name: 'Parter', elevation: 0, storeyGlobalIds: [] } }] };
  return sheetGraphic(sheet, d, new Map([['v1', drawing]]));
};

describe('a consultant DXF keeps its text and symbols (#547)', () => {
  it('keeps TEXT and MTEXT as plain text, in their layer, in the underlay frame', () => {
    const rooms = layerOf(made(), 'ROOMS')!;
    expect(rooms.texts?.map((t) => t.text).sort()).toEqual(['Kitchen bath', 'Living']);
    const living = rooms.texts!.find((t) => t.text === 'Living')!;
    expect(living).toMatchObject({ at: { x: 2, y: -1 }, height: 0.25, dir: { x: 1, y: 0 } });
  });

  it('expands an INSERT with the block lines and text, turned and moved with it, on the insert layer', () => {
    const symbols = layerOf(made(), 'SYMBOLS')!;
    const door = symbols.runs.find((r) => r.length === 2 && Math.abs(r[0].x - 3) < 1e-9 && Math.abs(r[0].y + 3) < 1e-9)!;
    // The block's line (0,0)-(1,0) turned 90 degrees at (3,3): it now runs north, which is up the drawing (y decreases).
    expect(door[1].x).toBeCloseTo(3, 9);
    expect(door[1].y).toBeCloseTo(-4, 9);
    const d1 = symbols.texts!.find((t) => t.text === 'D1')!;
    expect(d1.at.x).toBeCloseTo(3, 9);
    expect(d1.at.y).toBeCloseTo(-3.5, 9);
    expect(d1.dir.y).toBeCloseTo(-1, 9);
  });

  it('keeps an ARC and a CIRCLE as polylines, and a hatch as its boundary', () => {
    const u = made();
    const arcs = layerOf(u, 'ARCS')!.runs;
    expect(arcs.length).toBe(2);
    expect(arcs.every((r) => r.length > 4)).toBe(true);
    expect(arcs[0][0].x).toBeCloseTo(2, 6);
    const fill = layerOf(u, 'FILL')!.runs;
    expect(fill).toHaveLength(1);
    expect(fill[0][0]).toEqual(fill[0][fill[0].length - 1]);
    expect(fill[0].some((p) => p.x === 9 && p.y === -1)).toBe(true);
  });

  it('cuts a block that holds itself at the bound instead of walking on', () => {
    const symbols = layerOf(made(), 'SYMBOLS')!;
    const loops = symbols.runs.filter((r) => r.length === 2 && Math.abs(r[1].x - r[0].x - 0.1) < 1e-9 && r[0].y === -7);
    expect(loops.length).toBe(1);
    expect(importDxf(DXF, 'plan.dxf').warnings.join(' ')).not.toMatch(/limit/);
  });

  it('puts the texts on the view with the underlay place and scale', () => {
    const u = { ...made(), at: { x: 10, y: 0 }, scale: 2 };
    const living = dxfUnderlayTexts(u).find((t) => t.text === 'Living')!;
    expect(living.at).toEqual({ x: 14, y: -2 });
    expect(living.height).toBeCloseTo(0.5, 9);
  });

  it('prints the texts and the lines on the sheet where the app places them, turned and sized by the scale', () => {
    const g = printed(made());
    const at = placer(drawing, sheet.viewports![0], null);
    const living = g.texts.find((t) => t.text === 'Living')!;
    const where = at({ x: 2, y: -1 });
    expect(living.at.x).toBeCloseTo(where.x, 6);
    expect(living.at.y).toBeCloseTo(where.y, 6);
    expect(living.size).toBeCloseTo((0.25 * 1000) / 50, 6);
    expect(living.colour).toBe(layerOf(made(), 'ROOMS')!.colour);
    expect(g.texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Kitchen bath', 'D1']));
    expect(g.texts.find((t) => t.text === 'D1')!.angle).toBeCloseTo(90, 6);
    const colours = (g.strokes ?? []).map((s) => s.colour);
    expect(colours).toEqual(expect.arrayContaining([layerOf(made(), 'ARCS')!.colour, layerOf(made(), 'SYMBOLS')!.colour, layerOf(made(), 'FILL')!.colour]));
  });

  it('a layer that is off takes its text with it, on the screen and on the sheet', () => {
    const off = withDxfLayerVisible(made(), 'ROOMS', false);
    expect(dxfUnderlayTexts(off).map((t) => t.layer)).not.toContain('ROOMS');
    expect(dxfUnderlayRuns(off).map((r) => r.layer)).not.toContain('ROOMS');
    const texts = printed(off).texts.map((t) => t.text);
    expect(texts).not.toContain('Living');
    expect(texts).not.toContain('Kitchen bath');
    expect(texts).toContain('D1');
  });

  it('is read back from the project file, and a damaged text is refused with its path', () => {
    const u = made();
    expect(readDxfUnderlays({ dxfUnderlays: [JSON.parse(JSON.stringify(u))] })).toEqual([u]);
    const bad = JSON.parse(JSON.stringify(u)) as ViewDxfUnderlay;
    bad.layers[0] = { ...bad.layers[0], texts: [{ at: { x: 0, y: 0 }, text: 'x', height: -1, dir: { x: 1, y: 0 }, align: 'left' }] };
    expect(() => readDxfUnderlays({ dxfUnderlays: [bad] })).toThrow('/texts/0');
  });
});
