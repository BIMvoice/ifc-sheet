/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a door or window that carries its own 2D plan representation is drawn from it on a plan, not from the symbol generated for it.
 * The fixture (`__fixtures__/bonsai-door-symbols.ifc`) maps a Plan / Body / PLAN_VIEW Curve2D symbol from each type, as Bonsai writes
 * one: D01's swing a trimmed IfcEllipse, D02's leaf and swing one IfcCompositeCurve with a trimmed IfcCircle, W01 (in a wall at 45
 * degrees) IfcPolylines, and W02's symbol 5 m off its window, which the plan does not draw. Each expected point is the representation's
 * own point carried through the element's placement (the opening's, in its wall's frame), worked out by hand from the file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planOpeningSymbols } from './plan-openings.js';
import { openingPlanSymbolsOf, withOwnPlanRepresentations } from './opening-plan-representation.js';
import { resolveViewGraphics } from './view-templates.js';
import type { OpeningSymbol } from './opening-symbols.js';
import type { ViewGraphics } from './view-graphics-types.js';
import type { Pt } from './draft-types.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/bonsai-door-symbols.ifc', import.meta.url));

let model: OpenedModel;
let plane: SectionPlaneConfig;
let symbolsWith: (graphics?: ViewGraphics) => Map<string, OpeningSymbol>;

beforeAll(async () => {
  model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
  const set = generateDefaultSet(model)!;
  const [plan] = set.document.views.filter((v) => v.kind === 'plan');
  plane = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!.config.plane;
  const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING }, frame: model.coordinateInfo };
  symbolsWith = (graphics = resolveViewGraphics(plan, set.document.viewTemplates)) =>
    new Map(planOpeningSymbols(model.buildingMeshes, plane, sources, graphics, plan.level).map((s) => [model.dataStore.entities.getName(s.id) ?? '', s]));
}, 200_000);

/** Every polyline of a symbol, whatever its pen, in IFC X and Y (the drawing's y is minus IFC Y). */
const linesOf = (s: OpeningSymbol): Pt[][] => [...s.shapes, ...(s.heavy ?? [])].map((x) => {
  if (x.type !== 'polyline') throw new Error(`a ${x.type} in a symbol drawn from the model's representation`);
  return x.pts.map((p) => ({ x: p.x, y: -p.y }));
});
const near = (lines: Pt[][], q: Pt) => Math.min(...lines.flat().map((p) => Math.hypot(p.x - q.x, p.y - q.y)));

describe('a door or window with its own plan representation is drawn from it (#831)', () => {
  it('draws D01 from its symbol: the leaf and the swing, a trimmed IfcEllipse about the hinge', () => {
    const s = symbolsWith().get('Entrance door')!;
    const lines = linesOf(s);
    // The door's frame is the opening's: the south wall's, moved 2.0 m along it. Local (x, y) is IFC (2 + x, y).
    expect(near(lines, { x: 2.06, y: 0.9 }), 'the open leaf\'s tip, where the swing starts').toBeLessThan(0.001);
    expect(near(lines, { x: 2.875, y: 0.05 }), 'the swing ends at the closed leaf\'s end').toBeLessThan(0.001);
    const swing = lines.find((l) => l.length > 4 && l.every((p) => Math.abs(((p.x - 2.06) / 0.815) ** 2 + ((p.y - 0.05) / 0.85) ** 2 - 1) < 0.01));
    expect(swing, 'the swing drawn as an arc of the ellipse, not a chord').toBeDefined();
  });

  it('draws D02 from its composite curve: the leaf\'s line and a trimmed IfcCircle, in the partition\'s frame', () => {
    const s = symbolsWith().get('Inner door')!;
    const lines = linesOf(s);
    // The partition runs along IFC +Y from (5.05, 0.3), its local +Y to IFC -X; the opening is 3.0 m along it. Local (x, y) is IFC (5.05 - y, 3.3 + x).
    const hinge = { x: 5.0, y: 4.04 }, r = 0.715;
    expect(near(lines, { x: 4.285, y: 4.04 }), 'the open leaf\'s tip').toBeLessThan(0.001);
    expect(near(lines, { x: 5.0, y: 3.325 }), 'the swing\'s end').toBeLessThan(0.001);
    expect(near(lines, hinge), 'the leaf\'s line from the hinge').toBeLessThan(0.001);
    const arc = lines.find((l) => l.length > 4 && l.every((p) => Math.abs(Math.hypot(p.x - hinge.x, p.y - hinge.y) - r) < 0.001));
    expect(arc, 'the swing drawn as an arc about the hinge at the leaf\'s length, not a chord').toBeDefined();
  });

  it('draws W01 from its symbol along the oblique wall', () => {
    const s = symbolsWith().get('Oblique window')!;
    const lines = linesOf(s);
    // The oblique wall starts at (6, 0) along (c, c), its local +Y (-c, c); the opening is 1.5 m along it. Local (x, y) is IFC (6 + (1.5 + x - y) c, (1.5 + x + y) c).
    const c = Math.SQRT1_2, at = (x: number, y: number): Pt => ({ x: 6 + (1.5 + x - y) * c, y: (1.5 + x + y) * c });
    expect(near(lines, at(0.05, 0.1075)), 'the glass line\'s start').toBeLessThan(0.001);
    expect(near(lines, at(1.15, 0.1075)), 'the glass line\'s end').toBeLessThan(0.001);
    for (const corner of [at(0, 0.05), at(1.2, 0.05), at(1.2, 0.125), at(0, 0.125)]) expect(near(lines, corner), 'the lining\'s corners').toBeLessThan(0.001);
  });

  it('keeps the generated symbol of W02, whose representation lies 5 m off it', () => {
    const s = symbolsWith().get('North window')!;
    const points = s.shapes.flatMap((x) => (x.type === 'polyline' ? x.pts : x.type === 'line' ? [x.a, x.b] : []));
    expect(s.shapes.some((x) => x.type === 'line'), 'the generated glazing lines').toBe(true);
    // The window is 3.0 to 3.9 m along the north wall from (9, 7) to (0, 7): IFC x 5.1 to 6.0.
    for (const p of points) expect(p.x > 5.05 && p.x < 6.05, 'within the window').toBe(true);
  });

  it('draws the generated symbols when the view does not use the model\'s plan symbols', () => {
    const symbols = symbolsWith({ usePlanSymbols: false });
    for (const name of ['Entrance door', 'Inner door']) expect(symbols.get(name)!.heavy?.length, `${name}: the generated leaf`).toBeGreaterThan(0);
    expect(symbols.get('Oblique window')!.shapes.some((x) => x.type === 'line'), 'the generated glazing lines').toBe(true);
  });

  it('leaves a symbol a configured type draws as it is', () => {
    const made = [...symbolsWith({ usePlanSymbols: false }).values()];
    const own = openingPlanSymbolsOf(model.dataStore, model.coordinateInfo ?? null);
    expect(own.size, 'the model\'s four representations').toBe(4);
    expect(withOwnPlanRepresentations(made, plane, (id) => own.get(id), () => true).symbols).toEqual(made);
    const drawn = withOwnPlanRepresentations(made, plane, (id) => own.get(id), () => false);
    expect(drawn.fellBack.map((id) => model.dataStore.entities.getName(id)), 'only the broken one falls back').toEqual(['North window']);
  });
});
