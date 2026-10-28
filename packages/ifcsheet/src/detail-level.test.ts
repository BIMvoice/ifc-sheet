/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Detail level per view (#444): the scale's default, the layering of view and template, and the coarse simplification of a drawing. */

import type { Drawing2D, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import { atDetailLevel, defaultDetailLevel, resolveDetailLevel } from './detail-level.js';
import { resolveViewGraphics } from './view-templates.js';
import type { PlanProjectView, ProjectViewTemplate } from './document.js';

describe('the default follows the scale (#444)', () => {
  it('is coarse from 1:100, fine up to 1:50 and medium between', () => {
    expect([500, 200, 100].map(defaultDetailLevel)).toEqual(['coarse', 'coarse', 'coarse']);
    expect([99, 75, 51].map(defaultDetailLevel)).toEqual(['medium', 'medium', 'medium']);
    expect([50, 20, 1].map(defaultDetailLevel)).toEqual(['fine', 'fine', 'fine']);
  });

  it('takes 1:100 for a view with no usable scale', () => {
    expect([undefined, 0, -5, Number.NaN].map(defaultDetailLevel)).toEqual(['coarse', 'coarse', 'coarse', 'coarse']);
  });

  it('is overridden by the view, and a template carries it for the views that name none', () => {
    const template: ProjectViewTemplate = { id: 't', name: 'Plans', kind: 'plan', graphics: { detailLevel: 'fine' } };
    const view = (graphics?: PlanProjectView['graphics']) => ({ graphics, templateId: 't' });
    expect(resolveDetailLevel(resolveViewGraphics(view(), [template]), 100)).toBe('fine');
    expect(resolveDetailLevel(resolveViewGraphics(view({ detailLevel: 'coarse' }), [template]), 20)).toBe('coarse');
    expect(resolveDetailLevel(resolveViewGraphics(view({ categories: {} }), [template]), 20)).toBe('fine');
    expect(resolveDetailLevel(resolveViewGraphics({ graphics: undefined, templateId: undefined }, [template]), 100)).toBe('coarse');
  });
});

const ring = (x: number, w: number) => ({ outer: [{ x, y: 0 }, { x: x + w, y: 0 }, { x: x + w, y: 1 }, { x, y: 1 }], holes: [] });
const band = (entityId: number, ifcType: string, x: number, materialId: number): DrawingPolygon => ({ polygon: ring(x, 1), entityId, ifcType, modelIndex: 0, isCut: true, color: [1, 0, 0, 1], materialId });
const drawing = (): Drawing2D => ({
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: { plane: { axis: 'y' } },
  lines: [],
  // A wall of three layers, a slab of two, a single-material wall and a layered column (not outlined).
  cutPolygons: [
    band(1, 'IfcWall', 0, 7), band(1, 'IfcWall', 1, 8), band(1, 'IfcWall', 2, 9),
    band(2, 'IfcSlab', 5, 7), band(2, 'IfcSlab', 6, 8),
    { polygon: ring(8, 1), entityId: 3, ifcType: 'IfcWall', modelIndex: 0, isCut: true },
    band(4, 'IfcColumn', 9, 7), band(4, 'IfcColumn', 10, 8),
  ],
} as unknown as Drawing2D);

describe('atDetailLevel (#444)', () => {
  it('coarse draws each layered wall and slab as one closed outline, with no material on it', () => {
    const out = atDetailLevel(drawing(), 'coarse');
    const of = (id: number) => out.cutPolygons.filter((p) => p.entityId === id);
    expect(of(1)).toHaveLength(1);
    expect(of(1)[0].polygon.outer).toHaveLength(4);
    expect(Math.min(...of(1)[0].polygon.outer.map((p) => p.x))).toBe(0);
    expect(Math.max(...of(1)[0].polygon.outer.map((p) => p.x))).toBe(3);
    expect(of(2)).toHaveLength(1);
    expect([...of(1), ...of(2)].every((p) => p.materialId === undefined && p.color === undefined && p.isLayerBase === undefined && p.isCut)).toBe(true);
  });

  it('leaves a single-material wall and a layered column alone', () => {
    const before = drawing();
    const out = atDetailLevel(before, 'coarse');
    expect(out.cutPolygons.filter((p) => p.entityId === 3)).toEqual(before.cutPolygons.filter((p) => p.entityId === 3));
    expect(out.cutPolygons.filter((p) => p.entityId === 4)).toHaveLength(2);
  });

  it('keeps the bands of a wall whose bands do not close into an outline', () => {
    const d = drawing();
    // A hole that lies in none of the bands is no outline.
    d.cutPolygons[1] = { ...d.cutPolygons[1], polygon: { ...d.cutPolygons[1].polygon, holes: [[{ x: 20, y: 20 }, { x: 20, y: 21 }, { x: 21, y: 21 }]] } };
    expect(atDetailLevel(d, 'coarse').cutPolygons.filter((p) => p.entityId === 1)).toHaveLength(3);
  });

  it('drops the cut line across a wall between two layers and keeps the ones along its outline', () => {
    const d = drawing();
    const cut = (x0: number, y0: number, x1: number, y1: number) => ({ entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } } });
    d.lines = [cut(0, 0, 3, 0), cut(1, 0, 1, 1), cut(0, 1, 3, 1)] as unknown as Drawing2D['lines'];
    expect(atDetailLevel(d, 'coarse').lines.map((l) => [l.line.start.x, l.line.start.y])).toEqual([[0, 0], [0, 1]]);
  });

  it('joins bands that meet at different vertices (an opening in one layer splits the edge of the next)', () => {
    const d = drawing();
    // The middle band's right edge has an extra vertex the neighbour does not.
    d.cutPolygons[1] = { ...d.cutPolygons[1], polygon: { outer: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0.5 }, { x: 2, y: 1 }, { x: 1, y: 1 }], holes: [] } };
    const of1 = atDetailLevel(d, 'coarse').cutPolygons.filter((p) => p.entityId === 1);
    expect(of1).toHaveLength(1);
    expect(of1[0].polygon.outer).toHaveLength(4);
  });

  it('medium and fine are the drawing itself', () => {
    const d = drawing();
    expect(atDetailLevel(d, 'fine')).toBe(d);
    expect(atDetailLevel(d, 'medium')).toBe(d);
  });
});
