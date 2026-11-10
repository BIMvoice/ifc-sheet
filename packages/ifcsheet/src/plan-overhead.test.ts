/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a plan draws above its cut (#490). The fixture: a Ground floor at 0 and a First floor at 3.0 m; on the ground
 * floor a 5 x 4 m room with 3.0 m walls and a beam across it at y 2.0 (underside 2.6 m, top 3.0 m); on the first floor
 * its floor slab from 3.0 to 3.2 m over x 0 to 6 (1 m past the room on the east) and a roof slab at 6.5 m over x -0.5
 * to 6.5. The ground plan cuts at 1.2 m: by default it draws the beam and the slab's edge above it dashed, in the
 * overhead pen, and leaves the roof, two storeys up, out. A height of its own changes the range, and 0 draws nothing
 * overhead.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { storeyFloorsOf, viewOverheadHeight } from './plan-projection.js';
import type { PlanProjectView } from './document.js';
import { readView } from './set-read.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/overhead-plan.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built' : null;

type P = { x: number; y: number };
/** A point of the model's plan (IFC x, y) on the drawing, which looks down with IFC y running down the sheet. */
const at = (x: number, y: number): P => ({ x, y: -y });

/** How much of the segment `a`-`b` (0 to 1) the `lines` lying along it cover, within 1 cm. */
function coverage(lines: readonly DrawingLine[], a: P, b: P): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const off = (p: P) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
  const along = (p: P) => (p.x - a.x) * ux + (p.y - a.y) * uy;
  const spans = lines.filter((l) => off(l.line.start) < 0.01 && off(l.line.end) < 0.01)
    .map((l) => [along(l.line.start), along(l.line.end)].sort((m, n) => m - n))
    .map(([s, e]) => [Math.max(0, s), Math.min(len, e)]).filter(([s, e]) => e > s).sort((m, n) => m[0] - n[0]);
  let covered = 0, reach = 0;
  for (const [s, e] of spans) { if (e > reach) { covered += e - Math.max(s, reach); reach = e; } }
  return covered / len;
}

/** The beam's two long sides, and the edges of the first-floor slab past the room on the east. */
const BEAM: Array<[P, P]> = [[at(0.2, 1.9), at(4.8, 1.9)], [at(0.2, 2.1), at(4.8, 2.1)]];
const SLAB_EDGE: Array<[P, P]> = [[at(6, 0), at(6, 4)], [at(5, 0), at(6, 0)], [at(5, 4), at(6, 4)]];
/** The roof slab's eaves, 0.5 m outside the slab on every side. */
const ROOF: Array<[P, P]> = [[at(-0.5, -0.5), at(6.5, -0.5)], [at(6.5, -0.5), at(6.5, 4.5)], [at(-0.5, 4.5), at(-0.5, -0.5)]];

const overhead = (d: Drawing2D) => d.lines.filter((l) => l.category === 'projection' && l.visibility === 'hidden');
const solid = (d: Drawing2D) => d.lines.filter((l) => l.visibility === 'visible');
const of = (d: Drawing2D, ifcType: string) => d.lines.filter((l) => l.ifcType === ifcType);

describe.skipIf(missing !== null)('a plan draws what is above its cut, dashed, up to the floor above (#490)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let floors: number[] | null;
  const plan = (name: string): PlanProjectView => {
    const v = set.document.views.find((x): x is PlanProjectView => x.kind === 'plan' && x.name === name);
    if (!v) throw new Error(`no plan ${name}`);
    return v;
  };
  const draw = async (view: PlanProjectView): Promise<Drawing2D> => {
    const out = await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent!, (_v, e) => { throw e; }, () => {}, floors);
    const d = out.get(view.id);
    if (!d) throw new Error(`no drawing for ${view.name}`);
    return d;
  };
  const ground = (overheadHeight?: number | null) => ({ ...plan('Ground floor'), id: `ground-${overheadHeight}`, overheadHeight });

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const made = generateDefaultSet(model);
    if (!made) throw new Error('no set');
    set = made;
    floors = storeyFloorsOf(model.buildingMeshes, model.dataStore?.spatialHierarchy);
    expect(floors, 'two storey floors, the first at 3.0 m').toEqual([0, 3]);
    expect(plan('Ground floor').cutHeight).toBe(1.2);
  }, 120_000);

  it('by default the ground plan draws the beam and the slab edge above it dashed, and leaves the roof out', async () => {
    const d = await draw(ground());
    for (const [a, b] of BEAM) expect(coverage(overhead(d), a, b), `beam side ${JSON.stringify([a, b])}, dashed`).toBeGreaterThan(0.95);
    for (const [a, b] of SLAB_EDGE) expect(coverage(overhead(d), a, b), `slab edge ${JSON.stringify([a, b])}, dashed`).toBeGreaterThan(0.95);
    // The overhead pen, never the cut pen nor a solid projection line.
    expect(of(d, 'IfcBeam').every((l) => l.category === 'projection' && l.visibility === 'hidden'), 'every beam line is overhead').toBe(true);
    for (const [a, b] of [...BEAM, ...SLAB_EDGE]) expect(coverage(solid(d), a, b), `no solid line on ${JSON.stringify([a, b])}`).toBe(0);
    // The roof, two storeys up, is past the floor above.
    for (const [a, b] of ROOF) expect(coverage(d.lines, a, b), `roof eave ${JSON.stringify([a, b])}`).toBe(0);
    // The walls the plan cuts are cut, never overhead.
    expect(of(d, 'IfcWall').some((l) => l.category === 'cut'), 'the walls are cut').toBe(true);
    expect(of(d, 'IfcWall').filter((l) => l.visibility === 'hidden'), 'no overhead wall line').toEqual([]);
  });

  it('switched off (0), the ground plan draws nothing overhead and keeps its cut', async () => {
    expect(viewOverheadHeight(ground(0))).toBe(0);
    const d = await draw(ground(0));
    expect(overhead(d), 'no overhead line').toEqual([]);
    expect(of(d, 'IfcBeam'), 'no beam').toEqual([]);
    expect(of(d, 'IfcSlab'), 'no slab').toEqual([]);
    expect(of(d, 'IfcWall').filter((l) => l.category === 'cut').length, 'the walls are still cut').toBeGreaterThan(0);
  });

  it('a height of its own: 1.5 m above the cut (to 2.7 m) reaches the beam and not the slab; 5.5 m reaches the roof', async () => {
    const low = await draw(ground(1.5));
    for (const [a, b] of BEAM) expect(coverage(overhead(low), a, b), 'beam, dashed').toBeGreaterThan(0.95);
    expect(of(low, 'IfcSlab'), 'no slab').toEqual([]);
    const high = await draw(ground(5.5));
    for (const [a, b] of ROOF) expect(coverage(overhead(high), a, b), `roof eave ${JSON.stringify([a, b])}, dashed`).toBeGreaterThan(0.95);
  });

  it('the top storey sees up to the top of the model: the first-floor plan draws the roof dashed', async () => {
    const d = await draw(plan('First floor'));
    for (const [a, b] of ROOF) expect(coverage(overhead(d), a, b), `roof eave ${JSON.stringify([a, b])}, dashed`).toBeGreaterThan(0.95);
  });
});

describe('a plan\'s overhead range in the project file (#490)', () => {
  const stored = { id: 'p', name: 'Ground floor', createdAt: 0, kind: 'plan', level: { name: 'Ground floor', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
  const read = (overheadHeight: unknown) => readView(JSON.parse(JSON.stringify({ ...stored, overheadHeight })), 'views[0]') as PlanProjectView;
  it('keeps a height and 0 (off), and reads anything else as the automatic range', () => {
    expect(read(2.5).overheadHeight).toBe(2.5);
    expect(read(0).overheadHeight).toBe(0);
    expect(viewOverheadHeight(read(0))).toBe(0);
    for (const bad of [null, -1, '2', undefined]) expect(viewOverheadHeight(read(bad)), String(bad)).toBeNull();
  });
  it('is the automatic range on a reflected ceiling plan and on any other view', () => {
    expect(viewOverheadHeight({ kind: 'plan', reflected: true, overheadHeight: 2 })).toBeNull();
    expect(viewOverheadHeight({ kind: 'section', overheadHeight: 2 })).toBeNull();
  });
});
