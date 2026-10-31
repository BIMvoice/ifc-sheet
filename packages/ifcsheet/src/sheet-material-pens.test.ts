/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A cut of two layers (brick, then a 0.2 mm foil, then wool) on the paper (#645): the bands are filled by their material, the
 * brick is hatched, and the foil, too thin for a band, is a heavy dashed line on the interface. What the view hides has no hatch.
 */

import { describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { materialDrawing, materialFaces, materialResolver, type LayerRef } from './material-drawing.js';
import { sheetGraphic } from './sheet-graphic.js';
import { PEN_TABLE, viewStyler } from './view-style.js';
import { materialPens } from './sheet-material-pens.js';
import type { ProjectDocument, ProjectSheet } from './document.js';

const NAMES: Record<number, string> = { 10: 'Masonry - Brick', 11: 'PE foil', 12: 'Mineral wool' };
const band = (materialId: number, y0: number, y1: number): DrawingPolygon => ({
  polygon: { outer: [{ x: 0, y: y0 }, { x: 4, y: y0 }, { x: 4, y: y1 }, { x: 0, y: y1 }], holes: [] },
  entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId,
});
const line = (y: number): DrawingLine => ({ line: { start: { x: 0, y }, end: { x: 4, y } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 } as DrawingLine);
const layers: LayerRef[] = [{ materialId: 10, name: NAMES[10], thickness: 0.2 }, { materialId: 11, name: NAMES[11], thickness: 0.0002 }, { materialId: 12, name: NAMES[12], thickness: 0.1 }];
const resolver = (table: Parameters<typeof materialResolver>[1]) => materialResolver({ nameOf: (p) => (p.materialId === undefined ? null : NAMES[p.materialId] ?? null), layers: () => layers }, table);
const drawing = { cutPolygons: [band(10, 0, 0.2), band(12, 0.2, 0.3)], lines: [line(0), line(0.2), line(0.3)], bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 0.3 } }, config: { plane: { axis: 'y', position: 0, flipped: false } } } as unknown as Drawing2D;
const at = (p: { x: number; y: number }) => ({ x: p.x * 10, y: p.y * 10 });
const box = { x: -10, y: -10, w: 100, h: 100 };

describe('a cut by its materials on the sheet (#645)', () => {
  const table = [{ id: 'b', name: 'Masonry - Brick', fill: '#aa4433' }, { id: 'w', name: 'Mineral wool', fill: '#ffe680', hatch: 'INSULATION' }, { id: 'f', name: 'PE foil', membrane: true }];
  const faces = materialFaces(drawing, materialDrawing(drawing, resolver(table)));

  it('fills each band in its material, hatches the brick and draws the foil as a heavy dashed line', () => {
    expect(faces.cutPolygons.map((p) => p.materialFill)).toEqual(['#aa4433', '#ffe680']);
    const pens = materialPens(faces, viewStyler({ graphics: undefined, pens: PEN_TABLE }), at, box, PEN_TABLE, []);
    const hatch = pens.find((p) => p.layer === 'HATCH');
    expect(hatch?.runs.length ?? 0).toBeGreaterThan(0);
    expect(hatch?.width).toBe(PEN_TABLE.materialHatch.hairline);
    const membrane = pens.find((p) => p.layer === 'MEMBRANE');
    expect(membrane?.dash?.length ?? 0).toBeGreaterThan(0);
    expect(membrane?.width).toBeGreaterThan(PEN_TABLE.pens.cut);
  });

  it('puts the fills in the sheet pens of a viewport, through the styler', () => {
    const doc = { views: [{ id: 'v', kind: 'section', name: 'S', scale: 50 }], sheets: [], viewTemplates: [] } as unknown as ProjectDocument;
    const sheet = { id: 's', number: 'A-1', name: 'S', paper: 'A3', orientation: 'landscape', viewports: [{ viewId: 'v', x: 100, y: 100, scale: 50 }] } as unknown as ProjectSheet;
    const g = sheetGraphic(sheet, doc, new Map([['v', drawing]]), null, new Map(), undefined, undefined, PEN_TABLE, undefined, undefined, undefined, undefined, undefined, undefined, undefined, resolver(table));
    expect(g.pens.filter((p) => p.layer === 'FILL').map((p) => p.fill)).toEqual(expect.arrayContaining(['#aa4433', '#ffe680']));
    expect(g.pens.some((p) => p.layer === 'HATCH')).toBe(true);
    expect(sheetGraphic(sheet, doc, new Map([['v', drawing]]), null).pens.some((p) => p.layer === 'HATCH' || p.layer === 'MEMBRANE')).toBe(false);
  });
});
