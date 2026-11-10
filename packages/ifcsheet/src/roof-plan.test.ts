/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A roof plan shows the roof (#490). The fixture is shaped as Bonsai exports a house: a hip roof that is one IfcRoof
 * with a tessellated body (eaves at 3.0 m around 8 x 6 m, ridge at 4.5 m from x 2 to 6 along y 3), contained in the
 * Wall plate storey, and an empty Roof storey at 5.0 m whose plan cuts above everything. That plan drew only a 7.2 x
 * 4.8 m rectangle: the roof's contour 1.2 m under its top, where the plan's depth ended, with no ridge and no hip.
 * It now draws the roof to its eaves with its ridge and its four hips, and the Wall plate plan, which cuts the roof,
 * draws the hips below the cut solid and the ridge above it dashed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { storeyFloorsOf } from './plan-projection.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/hip-roof-plan.ifc', import.meta.url));
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

const RIDGE: [P, P] = [at(2, 3), at(6, 3)];
const HIPS: Array<[P, P]> = [[at(0, 0), at(2, 3)], [at(0, 6), at(2, 3)], [at(8, 0), at(6, 3)], [at(8, 6), at(6, 3)]];
const EAVES: Array<[P, P]> = [[at(0, 0), at(8, 0)], [at(8, 0), at(8, 6)], [at(8, 6), at(0, 6)], [at(0, 6), at(0, 0)]];

describe.skipIf(missing !== null)('a roof plan shows the roof (#490)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;
  const drawingOf = (name: string) => {
    const v = set.document.views.find((x) => x.kind === 'plan' && x.name === name);
    const d = v && drawings.get(v.id);
    if (!d) throw new Error(`no drawing for ${name}`);
    return d;
  };
  const roofLines = (d: Drawing2D, visibility: 'visible' | 'hidden') =>
    d.lines.filter((l) => l.category === 'projection' && l.visibility === visibility && l.ifcType === 'IfcRoof');

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const made = generateDefaultSet(model);
    if (!made) throw new Error('no set');
    set = made;
    const plans = set.document.views.filter((v) => v.kind === 'plan' && ['Roof', 'Wall plate'].includes(v.name));
    expect(plans.map((v) => v.name).sort(), 'the two plans').toEqual(['Roof', 'Wall plate']);
    drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!, () => {}, () => {}, storeyFloorsOf(model.buildingMeshes, model.dataStore?.spatialHierarchy));
  }, 120_000);

  it('the roof plan draws the roof whole, to its eaves', () => {
    const roof = roofLines(drawingOf('Roof'), 'visible');
    for (const [a, b] of EAVES) expect(coverage(roof, a, b), `eave ${JSON.stringify([a, b])}`).toBeGreaterThan(0.95);
  });

  it('the roof plan draws its ridge and its four hips, solid', () => {
    const roof = roofLines(drawingOf('Roof'), 'visible');
    expect(coverage(roof, ...RIDGE), 'ridge').toBeGreaterThan(0.95);
    for (const [a, b] of HIPS) expect(coverage(roof, a, b), `hip ${JSON.stringify([a, b])}`).toBeGreaterThan(0.95);
  });

  it('the Wall plate plan, cut through the roof, draws the hips below the cut solid and the ridge above it dashed', () => {
    const d = drawingOf('Wall plate');
    // The cut at 4.2 m crosses the hips 0.3 m under the ridge: each hip is solid from its eave corner to the cut, 80 % of it.
    for (const [a, b] of HIPS) expect(coverage(roofLines(d, 'visible'), a, b), `hip ${JSON.stringify([a, b])}`).toBeGreaterThan(0.75);
    expect(coverage(roofLines(d, 'hidden'), ...RIDGE), 'ridge, overhead').toBeGreaterThan(0.95);
    expect(coverage(roofLines(d, 'visible'), ...RIDGE), 'no solid ridge').toBeLessThan(0.05);
  });
});
