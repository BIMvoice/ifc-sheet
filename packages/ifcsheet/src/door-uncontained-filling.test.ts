/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a model scripted with IfcOpenShell fills each wall's opening with a door or window (IfcRelFillsElement) but contains the
 * filling in no storey, as `feature.add_filling` leaves it. The plan left those doors and windows out of the building (`storeyElementIds`),
 * so it neither cut them nor drew their symbols: the door was an empty gap in the wall, with no leaf and no swing. A filling contained
 * nowhere is now on its host wall's storey. The fixture (`__fixtures__/bonsai-door-symbols.ifc`) is Bonsai-shaped: bodies mapped from the
 * types, each door and window placed relative to its opening, one window in a wall at 45 degrees.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planOpeningSymbols } from './plan-openings.js';
import { resolveViewGraphics } from './view-templates.js';
import type { DraftShape, Pt } from './draft-types.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/bonsai-door-symbols.ifc', import.meta.url));

/** A plan point back in IFC X and Y: the drawing's y is minus IFC Y. */
const ifc = (p: Pt): Pt => ({ x: p.x, y: -p.y });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: Pt, b: Pt): Pt => { const d = dist(a, b); return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

describe('doors and windows that fill a wall but no storey contains are drawn as symbols on its plan (#831)', () => {
  it('draws each door\'s leaf and swing in its gap and the oblique wall\'s window along that wall', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model)!;
    const [plan] = set.document.views.filter((v) => v.kind === 'plan');
    // The generated symbols: the fixture's types also carry their own plan symbols, which a plan draws in their place (`door-plan-representation.test.ts`).
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
    const symbols = planOpeningSymbols(model.buildingMeshes, drawing.config.plane, { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } }, { ...resolveViewGraphics(plan, set.document.viewTemplates), usePlanSymbols: false }, plan.level);
    const byName = new Map(symbols.map((s) => [model.dataStore.entities.getName(s.id), s]));
    expect([...byName.keys()].sort()).toEqual(['Entrance door', 'Inner door', 'North window', 'Oblique window']);

    // [name, width, IFC hinge (jamb on the wall face the leaf opens to), IFC direction the leaf opens in]: D01 is SINGLE_SWING_LEFT in the
    // south wall's gap x 2.0 to 2.9 (inner face y = 0.3), D02 SINGLE_SWING_RIGHT in the partition's gap y 3.3 to 4.1 (its face x = 4.95).
    const doors: [string, number, Pt, Pt][] = [['Entrance door', 0.9, { x: 2, y: 0.3 }, { x: 0, y: 1 }], ['Inner door', 0.8, { x: 4.95, y: 4.1 }, { x: -1, y: 0 }]];
    for (const [name, width, hinge, opens] of doors) {
      const s = byName.get(name)!;
      const leaf = s.heavy?.find((x) => x.type === 'polyline');
      const arc = s.shapes.find((x): x is Extract<DraftShape, { type: 'arc' }> => x.type === 'arc');
      if (leaf?.type !== 'polyline' || !arc) throw new Error(`${name}: no leaf or no swing`);
      const [h, t] = leaf.pts.map(ifc);
      expect(dist(h, hinge), `${name}: hinge on the jamb, in the wall's gap`).toBeLessThan(0.02);
      expect(dist(h, t), `${name}: leaf as long as the door is wide`).toBeCloseTo(width, 2);
      expect(dot(unit(h, t), opens), `${name}: leaf open square to the wall`).toBeGreaterThan(0.999);
      expect(arc.r, `${name}: swing radius the door's width`).toBeCloseTo(width, 2);
      expect(dist(ifc(arc.c), hinge), `${name}: swing about the hinge`).toBeLessThan(0.02);
    }

    // W01: 1.2 m, 1.5 to 2.7 m along the wall from (6, 0) to (9, 3), its frame across the wall's 0.3 m; the glazing runs along the wall.
    const w = byName.get('Oblique window')!;
    const frame = w.shapes.find((x) => x.type === 'polyline' && x.closed);
    if (frame?.type !== 'polyline') throw new Error('no window frame');
    const pts = frame.pts.map(ifc);
    const along = { x: Math.SQRT1_2, y: Math.SQRT1_2 }, inward = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    const sides = pts.map((p, i) => ({ length: dist(p, pts[(i + 1) % pts.length]), dir: unit(p, pts[(i + 1) % pts.length]) }));
    const long = sides.filter((x) => Math.abs(x.length - 1.2) < 0.01), short = sides.filter((x) => Math.abs(x.length - 0.3) < 0.01);
    expect(long.length, 'two sides 1.2 m long').toBe(2);
    expect(short.length, 'two sides 0.3 m long, the wall\'s thickness').toBe(2);
    for (const x of long) expect(Math.abs(dot(x.dir, along)), 'the long sides run along the oblique wall').toBeGreaterThan(0.999);
    const centre = { x: pts.reduce((a, p) => a + p.x, 0) / 4, y: pts.reduce((a, p) => a + p.y, 0) / 4 };
    const expected = { x: 6 + 2.1 * along.x + 0.15 * inward.x, y: 2.1 * along.y + 0.15 * inward.y };
    expect(dist(centre, expected), 'the frame in the wall\'s opening').toBeLessThan(0.01);
    const glazing = w.shapes.filter((x): x is Extract<DraftShape, { type: 'line' }> => x.type === 'line');
    expect(glazing.length).toBeGreaterThan(0);
    for (const g of glazing) expect(Math.abs(dot(unit(ifc(g.a), ifc(g.b)), along)), 'glazing along the oblique wall').toBeGreaterThan(0.999);
  }, 200_000);
});
