/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { surfaceColourOf, surfaceFills } from './surface-fills.js';

/** A square of side 1 in the plane z = `z`, as two triangles; the south elevation looks along -z from z = 10. */
function quad(expressId: number, z: number, color: [number, number, number, number], ifcType = 'IfcWall', x = 0): MeshData {
  return {
    expressId, ifcType, color,
    positions: new Float32Array([x, 0, z, x + 1, 0, z, x + 1, 1, z, x, 1, z]),
    normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  } as unknown as MeshData;
}

const south = () => createSectionConfig('z', 10, { projectionDepth: 20, includeHiddenLines: false });

describe('the surfaces of a coloured elevation (#499)', () => {
  it('fills each face with the mesh colour, far to near', () => {
    const near = quad(1, 9, [1, 0, 0, 1]);
    const far = quad(2, 2, [0, 0, 1, 1]);
    // Listed near first: the order of the answer is the depth's, not the model's.
    const fills = surfaceFills([near, far], south());
    expect(fills.map((f) => f.surfaceColour)).toEqual(['#0000ff', '#0000ff', '#ff0000', '#ff0000']);
    expect(fills.map((f) => f.entityId)).toEqual([2, 2, 1, 1]);
  });

  it('winds every triangle the same way, so one non-zero path of them cannot cancel itself', () => {
    const flipped = quad(1, 9, [1, 0, 0, 1]);
    flipped.indices = new Uint32Array([0, 2, 1, 0, 3, 2]);
    for (const mesh of [quad(1, 9, [1, 0, 0, 1]), flipped]) {
      const fills = surfaceFills([mesh], south());
      expect(fills.length).toBeGreaterThan(0);
      for (const f of fills) {
        const [a, b, c] = f.polygon.outer;
        expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeGreaterThan(0);
      }
    }
  });

  it('leaves out what the view hides, spaces and openings, and what lies outside the depth', () => {
    const wall = quad(1, 9, [1, 0, 0, 1]);
    const space = quad(2, 8, [0, 1, 0, 1], 'IfcSpace');
    const behind = quad(3, -50, [0, 0, 1, 1]);
    const hidden = quad(4, 7, [1, 1, 0, 1], 'IfcDoor');
    const fills = surfaceFills([wall, space, behind, hidden], south(), (_id, type) => type !== 'IfcDoor');
    expect([...new Set(fills.map((f) => f.entityId))]).toEqual([1]);
  });

  it('cuts a face the plane crosses at the plane: only the part beyond it is drawn, and a face wholly in front is dropped', () => {
    // A 1 x 1 wall seen from the south (z = 10 looking down -z) and tilted: its x = 0 edge is 2 in front of the plane (z = 12), its x = 1 edge 2 behind (z = 8).
    const tilted = quad(1, 0, [1, 0, 0, 1]);
    tilted.positions = new Float32Array([0, 0, 12, 1, 0, 8, 1, 1, 8, 0, 1, 12]);
    const fills = surfaceFills([tilted], south());
    expect(fills.length).toBeGreaterThan(0);
    const xs = fills.flatMap((f) => f.polygon.outer.map((p) => p.x));
    // The plane crosses at the middle of the face: nothing is drawn on the removed half.
    expect(Math.min(...xs)).toBeGreaterThan(0.5 - 1e-6);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    const area = fills.reduce((sum, f) => { const [a, b, c] = f.polygon.outer; return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2; }, 0);
    expect(area).toBeCloseTo(0.5, 6);
    expect(surfaceFills([quad(1, 12, [1, 0, 0, 1])], south())).toEqual([]);
  });

  it('cuts a face that runs past the view depth at that depth: nothing beyond it is painted', () => {
    // Depth 3 from the plane at z = 10. The triangle runs from depth 1 (z = 9, along x = 0) to depth 9 (z = 1, at x = 8): depth = 1 + x.
    const long = quad(1, 0, [1, 0, 0, 1]);
    long.positions = new Float32Array([0, 0, 9, 8, 0, 1, 0, 1, 9]);
    long.indices = new Uint32Array([0, 1, 2]);
    const fills = surfaceFills([long], createSectionConfig('z', 10, { projectionDepth: 3, includeHiddenLines: false }));
    expect(fills.length).toBeGreaterThan(0);
    const xs = fills.flatMap((f) => f.polygon.outer.map((p) => p.x));
    // Painted from depth 1 to depth 3 only: 2 wide on the drawing, not 8, and the area of that part (1.75 of the whole 4).
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 6);
    const area = fills.reduce((sum, f) => { const [a, b, c] = f.polygon.outer; return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2; }, 0);
    expect(area).toBeCloseTo(1.75, 6);
  });

  it('draws nothing for a view with no depth, and glass as the paper shows it', () => {
    expect(surfaceFills([quad(1, 9, [1, 0, 0, 1])], createSectionConfig('y', 1, { projectionDepth: 0, includeHiddenLines: false }))).toEqual([]);
    expect(surfaceColourOf([0, 0, 0, 0.5])).toBe('#808080');
    expect(surfaceColourOf([0, 0, 0, 0.01])).toBeNull();
    expect(surfaceColourOf([0.2, 0.4, 0.6, 1])).toBe('#336699');
  });
});

describe('the coloured surfaces and the headless DXF (#499)', () => {
  it('keeps the DXF to the lines: a surface fill is on the sheet and in the PDF, not a COLOUR layer of the DXF', async () => {
    const { exportDxf } = await import('./export.js');
    const { sheetGraphic } = await import('./sheet-graphic.js');
    const { surfaceFills } = await import('./surface-fills.js');
    const config = createSectionConfig('z', 10, { projectionDepth: 20, includeHiddenLines: false });
    const drawing = {
      config, lines: [], cutPolygons: [], projectionPolygons: [],
      bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 4 } },
      stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
    } as never;
    const sheet = { id: 's1', number: 'A-201', name: 'Elevations', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }] };
    const doc = { name: 'P', models: [], sheets: [sheet], titleBlock: {}, views: [{ id: 'v1', kind: 'elevation', name: 'South', createdAt: 0 }] };
    const fills = surfaceFills([quad(1, 2, [0.8, 0.2, 0.1, 1])], config);
    const graphic = sheetGraphic(sheet as never, doc as never, new Map([['v1', drawing]]), undefined, new Map(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, new Map([['v1', fills]]));
    expect(graphic.fills.some((f) => f.colour === '#cc331a')).toBe(true);
    expect(exportDxf(graphic)).not.toContain('COLOUR-CC331A');
  });
});
