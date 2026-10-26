/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantities measured from geometry (#74) on meshes built here: a box drawn
 * the way the engine draws one (a vertex per face corner, so nothing is shared
 * until welded), an open one, one with a face wound the wrong way, one far from
 * the origin, and the declared figure winning over all of them.
 */

import { describe, expect, it } from 'vitest';
import { measureElement, withMeasured, type MeasureMesh } from './measured-quantities.js';

type V = [number, number, number];

/** An axis-aligned box `[x0,y0,z0]`-`[x1,y1,z1]`, Y up, wound outward, four vertices per face; `drop` leaves faces out, `flip` winds them inward. */
function box(lo: V, hi: V, opts: { drop?: number[]; flip?: number[]; origin?: V } = {}): MeasureMesh {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  // Each face: four corners counter-clockwise seen from outside.
  const faces: V[][] = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], // +x
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // -x
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], // +y (top)
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // -y
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +z
    [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], // -z
  ];
  const positions: number[] = [], indices: number[] = [];
  faces.forEach((f, i) => {
    if (opts.drop?.includes(i)) return;
    const base = positions.length / 3;
    for (const p of f) positions.push(...p);
    const quad = opts.flip?.includes(i) ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    indices.push(...quad.map((k) => base + k));
  });
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices), origin: opts.origin ?? null };
}

describe('measureElement (#74)', () => {
  it('measures a closed box drawn with a vertex per face corner: volume, a wall\'s one side, a slab\'s top', () => {
    // A wall 5 m long (x), 3 m high (y), 0.3 m thick (z).
    const wall = measureElement('IfcWallStandardCase', [box([0, 0, 0], [5, 3, 0.3])]);
    expect(wall.volume.value).toBeCloseTo(4.5, 9);
    expect(wall.areaKind).toBe('wallSide');
    expect(wall.area?.value).toBeCloseTo(15, 9);
    const slab = measureElement('IfcSlab', [box([0, 0, 0], [4, 0.2, 3])]);
    expect(slab.volume.value).toBeCloseTo(2.4, 9);
    expect(slab.area?.value).toBeCloseTo(12, 9);
    // Other classes: a volume, no measured area.
    expect(measureElement('IfcBeam', [box([0, 0, 0], [4, 0.2, 0.3])]).area).toBeNull();
  });

  it('turns an inward-wound solid outward: the same volume and the top still on top', () => {
    const inward = measureElement('IfcSlab', [box([0, 0, 0], [4, 0.2, 3], { flip: [0, 1, 2, 3, 4, 5] })]);
    expect(inward.volume.value).toBeCloseTo(2.4, 9);
    expect(inward.area?.value).toBeCloseTo(12, 9);
  });

  it('refuses an open mesh rather than report a wrong number', () => {
    const open = measureElement('IfcWall', [box([0, 0, 0], [5, 3, 0.3], { drop: [2] })]);
    expect(open.volume).toEqual({ value: null, refusal: 'notClosed' });
    expect(open.area).toEqual({ value: null, refusal: 'notClosed' });
  });

  it('refuses a closed mesh with a face wound against its neighbours', () => {
    expect(measureElement('IfcWall', [box([0, 0, 0], [5, 3, 0.3], { flip: [4] })]).volume).toEqual({ value: null, refusal: 'notOriented' });
  });

  it('refuses a part wound inward with nothing around it, and a body that encloses nothing', () => {
    const two = [box([0, 0, 0], [1, 1, 1]), box([3, 0, 0], [4, 1, 1], { flip: [0, 1, 2, 3, 4, 5] })];
    expect(measureElement('IfcColumn', two).volume.refusal).toBe('notOriented');
    // Two parts wound alike add up.
    expect(measureElement('IfcColumn', [box([0, 0, 0], [1, 1, 1]), box([3, 0, 0], [4, 1, 2])]).volume.value).toBeCloseTo(3, 9);
    expect(measureElement('IfcWall', []).volume.refusal).toBe('noGeometry');
  });

  it('gives a wall that is no longer than it is thick no side area, but still its volume', () => {
    const pier = measureElement('IfcWall', [box([0, 0, 0], [0.3, 3, 0.3])]);
    expect(pier.volume.value).toBeCloseTo(0.27, 9);
    expect(pier.area).toEqual({ value: null, refusal: 'notStraight' });
  });

  it('gives the same volume and area 5 000 km from the origin, in the coordinates or in the mesh origin', () => {
    const near = measureElement('IfcWall', [box([1, 0, 2], [6, 3, 2.3])]);
    const far = measureElement('IfcWall', [box([5e6 + 1, 120, -3e6 + 2], [5e6 + 6, 123, -3e6 + 2.3])]);
    const shifted = measureElement('IfcWall', [box([1, 0, 2], [6, 3, 2.3], { origin: [5e6, 120, -3e6] })]);
    for (const m of [far, shifted]) {
      expect(Math.abs(m.volume.value! - near.volume.value!)).toBeLessThan(1e-6);
      expect(Math.abs(m.area!.value! - near.area!.value!)).toBeLessThan(1e-6);
    }
  });
});

describe('withMeasured (#74)', () => {
  const wall = [box([0, 0, 0], [5, 3, 0.3])];

  it('keeps the declared figures and never reads the geometry when the model states both', () => {
    let read = 0;
    const q = withMeasured({ volume: 4.1, area: 13.2 }, 'IfcWall', () => { read++; return wall; });
    expect(q).toEqual({ volume: 4.1, area: 13.2, volumeSource: 'declared', areaSource: 'declared' });
    expect(read).toBe(0);
  });

  it('measures only the figure the model leaves out, and marks it measured', () => {
    expect(withMeasured({ volume: null, area: 13.2 }, 'IfcWall', () => wall)).toMatchObject({ volume: 4.5, volumeSource: 'measured', area: 13.2, areaSource: 'declared' });
    const both = withMeasured({ volume: null, area: null }, 'IfcWall', () => wall);
    expect(both.volumeSource).toBe('measured');
    expect(both.area).toBeCloseTo(15, 9);
    expect(both.areaSource).toBe('measured');
  });

  it('leaves an unmeasurable figure empty with the reason, and a class without a measured area alone', () => {
    const open = withMeasured({ volume: null, area: null }, 'IfcWall', () => [box([0, 0, 0], [5, 3, 0.3], { drop: [5] })]);
    expect(open).toMatchObject({ volume: null, volumeSource: null, volumeRefusal: 'notClosed', area: null, areaRefusal: 'notClosed' });
    const beam = withMeasured({ volume: 1, area: null }, 'IfcBeam', () => { throw new Error('a beam with a volume needs no geometry'); });
    expect(beam).toEqual({ volume: 1, area: null, volumeSource: 'declared', areaSource: null });
  });
});
