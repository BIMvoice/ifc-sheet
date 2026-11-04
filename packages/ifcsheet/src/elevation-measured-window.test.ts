/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #651: a mesh-only window (no joinery type) has frame and glazing lines in an elevation and a section, within its own box. */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { elevationOpeningSymbols } from './elevation-openings.js';

/** A 1.0 x 1.2 x 0.5 box in the renderer frame (Y up), placed with the identity, so its face normal is along world z. */
function windowBox(): MeshData {
  const [x0, x1, y0, y1, z0, z1] = [-0.5, 0.5, 0.9, 2.1, -0.25, 0.25];
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const localToWorld = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return { expressId: 7, ifcType: 'IfcWindow', positions, normals: new Float32Array(24), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [1, 1, 1, 1], localToWorld } as unknown as MeshData;
}
const reads = { typedOf: () => null, operationOf: () => null, flipsOf: () => 0 };

describe('a mesh-only window in an elevation and a section (#651)', () => {
  for (const [name, plane] of [['elevation', { axis: 'front', position: 50, flipped: false }], ['section', { axis: 'front', position: 50, flipped: true }]] as const) {
    it(`gets an outline and glazing lines inside its own box in a ${name}`, () => {
      const out = elevationOpeningSymbols([windowBox()], plane as unknown as SectionPlaneConfig, new Set([7]), new Set(), reads);
      expect(out).toHaveLength(1);
      expect(out[0].kind).toBe('window');
      expect(out[0].shapes.length).toBeGreaterThanOrEqual(3);
      const xs = out[0].shapes.flatMap((s) => (s.type === 'polyline' ? s.pts.map((p) => p.x) : []));
      const ys = out[0].shapes.flatMap((s) => (s.type === 'polyline' ? s.pts.map((p) => p.y) : []));
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.99);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1.1);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.2, 1);
    });
  }
  it('draws nothing when the view hides windows', () => {
    const plane = { axis: 'front', position: 50, flipped: false } as unknown as SectionPlaneConfig;
    expect(elevationOpeningSymbols([windowBox()], plane, new Set([7]), new Set(['IFCWINDOW']), reads)).toHaveLength(0);
  });
});
