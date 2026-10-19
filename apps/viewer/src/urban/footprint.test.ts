/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #76: storey footprints from plan outlines of real wasm projections, on
 * hand-built boxes whose areas are known exactly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { urbanWasm } from '@/test/urban-fixture';
import { storeyFootprint, type PlanMesh } from './footprint';
import { footprintArea } from './indicators';
import { offsetRing } from './ring-offset';

/** A box over the plan rectangle [x0, x1] × [y0, y1] (render x, z), 0–3 m high; only its top and bottom faces, which is all a plan projection sees. */
function box(x0: number, y0: number, x1: number, y1: number, origin?: [number, number, number]): PlanMesh {
  const o = origin ?? [0, 0, 0];
  const plan = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const positions = new Float32Array([0, 3].flatMap((h) => plan.flatMap(([x, z]) => [x - o[0], h - o[1], z - o[2]])));
  return { positions, indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]), origin: o };
}

/** Four 0.3 m walls whose outer faces bound [x0, x1] × [y0, y1]. */
function wallRing(x0: number, y0: number, x1: number, y1: number, t = 0.3): PlanMesh[] {
  return [box(x0, y0, x1, y0 + t), box(x0, y1 - t, x1, y1), box(x0, y0 + t, x0 + t, y1 - t), box(x1 - t, y0 + t, x1, y1 - t)];
}

/** A slab over [x0, x1] × [y0, y1] with the rectangle [hx0, hx1] × [hy0, hy1] left open. */
function slabWithOpening(x0: number, y0: number, x1: number, y1: number, hx0: number, hy0: number, hx1: number, hy1: number): PlanMesh[] {
  return [box(x0, y0, x1, hy0), box(x0, hy1, x1, y1), box(x0, hy0, hx0, hy1), box(hx1, hy0, x1, hy1)];
}

const area = (f: ReturnType<typeof storeyFootprint>) => (f ? footprintArea(f.shapes) : null);
const near = (a: number | null, b: number, what: string) => assert.ok(a !== null && Math.abs(a - b) < 1e-3, `${what}: ${a} vs ${b}`);

describe('storey footprint (#76)', () => {
  it('a building around a courtyard: the courtyard is not built area', (t) => {
    if (!urbanWasm(t)) return;
    // 20 × 20 m to the outer face; in the middle a block of 0.3 m walls 6 × 6 m outside, so the open courtyard is 5.4 × 5.4 m.
    const walls = [...wallRing(0, 0, 20, 20), ...wallRing(7, 7, 13, 13)];
    const floor = slabWithOpening(0, 0, 20, 20, 7, 7, 13, 13);
    const f = storeyFootprint(walls, floor);
    near(area(f), 400 - 5.4 * 5.4, 'built area');
    assert.equal(f?.assumedInterior, false);
    assert.equal(f?.shapes[0].holes.length, 1, 'the courtyard stays a hole');
  });

  it('a courtyard bounded by the same wall ring as the rooms, with a column standing in it', (t) => {
    if (!urbanWasm(t)) return;
    // Cross walls tie the courtyard block to the outer walls: one wall shape, the courtyard one of its holes.
    const cross = [box(9.85, 0.3, 10.15, 7), box(9.85, 13, 10.15, 19.7), box(0.3, 9.85, 7, 10.15), box(13, 9.85, 19.7, 10.15)];
    const column = box(9.85, 9.85, 10.15, 10.15);
    const f = storeyFootprint([...wallRing(0, 0, 20, 20), ...wallRing(7, 7, 13, 13), ...cross, column], slabWithOpening(0, 0, 20, 20, 7, 7, 13, 13));
    near(area(f), 400 - 5.4 * 5.4 + 0.3 * 0.3, 'built area');
  });

  it('without slab or room to tell, every hole is taken as inside and the storey says so', (t) => {
    if (!urbanWasm(t)) return;
    const f = storeyFootprint([...wallRing(0, 0, 20, 20), ...wallRing(7, 7, 13, 13)], []);
    near(area(f), 400, 'built area');
    assert.equal(f?.assumedInterior, true);
  });

  it('a slab past the walls (a balcony) does not widen the footprint', (t) => {
    if (!urbanWasm(t)) return;
    const f = storeyFootprint(wallRing(0, 0, 10, 8), [box(0, 0, 10, 8), box(2, 8, 6, 9.5)]);
    near(area(f), 80, 'built area');
  });

  it('walls a hair apart still close the room', (t) => {
    if (!urbanWasm(t)) return;
    // The east wall stops 2 mm short of the south and north walls: two 2 mm slots from the room to the outside.
    // The outlines sit far from the origin, as RTC-shifted meshes do.
    const o: [number, number, number] = [500, 0, -300];
    const walls = [box(0, 0, 10, 0.3, o), box(0, 7.7, 10, 8, o), box(0, 0.3, 0.3, 7.7, o), box(9.7, 0.302, 10, 7.698, o)];
    const f = storeyFootprint(walls, [box(0.3, 0.3, 9.7, 7.7, o)]);
    // 10 × 8 m less at most the two slots themselves (0.3 m × 2 mm each); leaking, it would be the walls alone, about 10.4 m².
    const a = area(f);
    assert.ok(a !== null && a <= 80 && a > 80 - 2 * 0.3 * 0.002, `built area ${a}`);
  });

  it('a storey with a slab but no walls takes the slab outline', (t) => {
    if (!urbanWasm(t)) return;
    const f = storeyFootprint([], [box(0, 0, 5, 4)]);
    near(area(f), 20, 'built area');
    assert.equal(f?.source, 'floor');
    assert.equal(storeyFootprint([], []), null);
  });
});

describe('ring offset (#76)', () => {
  it('moves every edge to its right: a counter-clockwise square grows, a clockwise one shrinks', () => {
    const ccw: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    near(footprintArea([{ outer: offsetRing(ccw, 0.5), holes: [] }]), 5 * 4, 'grown');
    near(footprintArea([{ outer: offsetRing([...ccw].reverse(), 0.5), holes: [] }]), 3 * 2, 'shrunk');
  });

  it('bevels a spike instead of shooting a mitre out', () => {
    const spike: [number, number][] = [[0, 0], [10, 0], [10, 0.01], [0, 1]];
    for (const [x, y] of offsetRing(spike, 0.1)) assert.ok(x < 10.3 && y < 1.3 && x > -0.3 && y > -0.3, `${x}, ${y}`);
  });
});
