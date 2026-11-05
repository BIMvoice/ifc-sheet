/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSectionConfig, type Drawing2D, type DrawingLine } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { grid } from './__fixtures__/contour-grid.js';
import { contourLines } from './contours.js';
import { contourIntervalOf, withContours } from './contour-drawing.js';
import type { PlanProjectView, ProjectLevel } from './document.js';

const level: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: [] };
const plan = (extra: Partial<PlanProjectView> = {}): PlanProjectView => ({ id: 'p', name: 'Plan', createdAt: 0, kind: 'plan', level, cutHeight: 1.2, ...extra });

const line = (ifcType: string, entityId: number, x: number): DrawingLine => ({
  line: { start: { x, y: 0 }, end: { x: x + 1, y: 1 } }, category: 'cut', visibility: 'visible', entityId, ifcType, modelIndex: 0, depth: 0,
});

/** A plan drawing with one wall line and the terrain's own cut line, as the generator makes them. */
function drawing(terrainId = 7): Drawing2D {
  return {
    config: createSectionConfig('y', 1.2), lines: [line('IfcWall', 3, 2), line('IfcGeographicElement', terrainId, 0)], cutPolygons: [], projectionPolygons: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 3, y: 1 } },
    stats: { cutLineCount: 2, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
  };
}

const tin = grid(19, 10, (x) => 0.1 * x + 0.03);
const contoured = (view: PlanProjectView | undefined, interval = view?.contourInterval): Drawing2D => withContours(drawing(), view && interval !== undefined ? { ...view, contourInterval: interval } : view, [tin]);
const contourLinesOf = (d: Drawing2D): DrawingLine[] => d.lines.filter((l) => l.ifcType === 'IfcGeographicElement');

describe('which plans take contours (#182)', () => {
  it('a site plan and the plan of a model with no storeys do; a storey plan, a reflected or discipline plan and a switched-off one do not', () => {
    expect(contourIntervalOf(plan({ site: true }))).toBe(0.5);
    expect(contourIntervalOf(plan())).toBe(0.5);
    expect(contourIntervalOf(plan({ level: { ...level, storeyGlobalIds: ['g'] } }))).toBeNull();
    expect(contourIntervalOf(plan({ site: true, reflected: true }))).toBeNull();
    expect(contourIntervalOf(plan({ site: true, discipline: 'roof' }))).toBeNull();
    expect(contourIntervalOf(plan({ site: true, contourInterval: 0 }))).toBeNull();
    expect(contourIntervalOf(plan({ site: true, contourInterval: 2 }))).toBe(2);
    expect(contourIntervalOf(undefined)).toBeNull();
  });
});

describe('withContours (#182)', () => {
  it('replaces the terrain mesh cut with contours and keeps everything else', () => {
    const out = contoured(plan({ site: true }));
    expect(out.lines.some((l) => l.ifcType === 'IfcWall')).toBe(true);
    // The terrain's own cut line (x = 0..1) is gone: what is left of it is contours at x = 4.7, 9.7, 14.7.
    expect(out.lines.filter((l) => l.ifcType === 'IfcGeographicElement' && l.line.start.x < 1)).toHaveLength(0);
    const xs = new Set(contourLinesOf(out).map((l) => Math.round(l.line.start.x * 10) / 10));
    expect([...xs].sort((a, b) => a - b)).toEqual([4.7, 9.7, 14.7]);
  });

  it('draws a finer interval as more contours, and every fifth as an outline over the others', () => {
    const coarse = contourLinesOf(contoured(plan({ site: true }), 0.5));
    const fine = contourLinesOf(contoured(plan({ site: true }), 0.1));
    const xsOf = (ls: DrawingLine[]): number => new Set(ls.map((l) => Math.round(l.line.start.x * 10))).size;
    expect(xsOf(coarse)).toBe(3);
    expect(xsOf(fine)).toBe(19);
    const major = new Set(fine.filter((l) => l.category === 'silhouette').map((l) => Math.round(l.line.start.x * 10) / 10));
    expect([...major].sort((a, b) => a - b)).toEqual([4.7, 9.7, 14.7]);
    expect(fine.filter((l) => l.category === 'projection').length).toBeGreaterThan(0);
  });

  it('leaves a plan that takes none, or a model with no terrain, as it was', () => {
    const base = drawing();
    expect(withContours(base, plan({ level: { ...level, storeyGlobalIds: ['g'] } }), [tin])).toBe(base);
    expect(withContours(base, plan({ site: true }), [])).toBe(base);
  });

  it('strips a terrain mesh that carries no class (a LandXML surface) by its id', () => {
    const bare: MeshData = { ...tin, ifcType: undefined };
    const d = { ...drawing(), lines: [line('Unknown', 7, 0), line('IfcWall', 3, 2)] };
    const out = withContours(d, plan({ site: true }), [bare]);
    expect(out.lines.filter((l) => l.ifcType === 'Unknown')).toHaveLength(0);
    expect(contourLinesOf(out).length).toBeGreaterThan(0);
  });

  it('grows the drawing to the contours it draws', () => {
    const out = contoured(plan({ site: true }));
    expect(out.bounds.max.x).toBeGreaterThan(3);
  });
});

const fixture = fileURLToPath(new URL('../../../apps/viewer/public/samples/terrain-tin-metric.xml', import.meta.url));

describe.skipIf(!existsSync(fixture))('terrain-tin-metric.xml (#182; skipped without the file: run pnpm fixtures)', () => {
  /** The sample's points (northing easting elevation) and faces, as a viewer-frame mesh (x east, y up, z south). */
  function sample(): MeshData {
    const xml = readFileSync(fixture, 'utf8');
    const ids: string[] = [];
    const positions: number[] = [];
    for (const m of xml.matchAll(/<P id="([^"]+)">\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*<\/P>/g)) {
      ids.push(m[1]);
      positions.push(Number(m[3]), Number(m[4]), -Number(m[2]));
    }
    const indices = [...xml.matchAll(/<F>\s*(\S+)\s+(\S+)\s+(\S+)\s*<\/F>/g)].flatMap((m) => [ids.indexOf(m[1]), ids.indexOf(m[2]), ids.indexOf(m[3])]);
    return { expressId: 1, positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices), color: [0.4, 0.6, 0.3, 1] };
  }

  it('gives contours at every half metre between 100 and 103.05, instead of one cut', () => {
    const mesh = sample();
    const heights = [...new Set(contourLines([mesh], 0.5).map((l) => l.height))];
    expect(heights).toEqual([100.5, 101, 101.5, 102, 102.5, 103]);
    const out = withContours({ ...drawing(1), lines: [line('Unknown', 1, 0)] }, plan({ site: true }), [mesh]);
    expect(out.lines.filter((l) => l.ifcType === 'Unknown')).toHaveLength(0);
    expect(contourLinesOf(out).length).toBeGreaterThan(0);
    expect(contourLines([mesh], 1).map((l) => l.height).every((h) => Number.isInteger(h))).toBe(true);
  });
});
