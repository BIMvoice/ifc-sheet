/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a door drawn from its own plan representation takes the generated door symbol's pens per stroke: its leaf and frame heavy, its
 * swing thin, decided per segment, so one stroke can hold both; a window stays thin, as the generated window symbol. The fixture (`__fixtures__/bonsai-door-symbols.ifc`) holds Bonsai's
 * shapes (closed polycurves for the jambs and the leaf, a trimmed ellipse for the swing, a composite of the leaf's line and a trimmed
 * circle); the Revit case is the duplex's door style '1250mm x 2010mm' (#6633 in `tests/models/ara3d/duplex.ifc`), its numbers copied:
 * the leaf as four separate lines and the swing a trimmed circle.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planOpeningSymbols } from './plan-openings.js';
import { doorStrokePens } from './opening-plan-rep-pens.js';
import { resolveViewGraphics } from './view-templates.js';
import type { OpeningSymbol } from './opening-symbols.js';
import type { DraftShape, Pt } from './draft-types.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/bonsai-door-symbols.ifc', import.meta.url));

let byName: Map<string, OpeningSymbol>;

beforeAll(async () => {
  const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
  const set = generateDefaultSet(model)!;
  const [plan] = set.document.views.filter((v) => v.kind === 'plan');
  const plane = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!.config.plane;
  const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING }, frame: model.coordinateInfo };
  byName = new Map(planOpeningSymbols(model.buildingMeshes, plane, sources, resolveViewGraphics(plan, set.document.viewTemplates), plan.level).map((s) => [model.dataStore.entities.getName(s.id) ?? '', s]));
}, 200_000);

/** A stroke's points in IFC X and Y. */
const pts = (x: DraftShape): Pt[] => (x.type === 'polyline' ? x.pts.map((p) => ({ x: p.x, y: -p.y })) : []);
const has = (strokes: readonly DraftShape[] | undefined, q: Pt) => (strokes ?? []).some((x) => pts(x).some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 0.001));
const onEllipse = (x: DraftShape) => pts(x).length > 4 && pts(x).every((p) => Math.abs(((p.x - 2.06) / 0.815) ** 2 + ((p.y - 0.05) / 0.85) ** 2 - 1) < 0.01);

describe('a door drawn from its own plan representation takes the generated symbol\'s pens per stroke (#831)', () => {
  it('draws D01\'s leaf and jambs heavy and its ellipse swing thin', () => {
    const s = byName.get('Entrance door')!;
    expect(has(s.heavy, { x: 2.025, y: 0.9 }), 'the leaf\'s outline, heavy').toBe(true);
    expect(has(s.heavy, { x: 2, y: 0 }) && has(s.heavy, { x: 2.9, y: 0 }), 'both jambs, heavy').toBe(true);
    expect(s.shapes.some(onEllipse), 'the swing, thin').toBe(true);
    expect((s.heavy ?? []).some(onEllipse), 'and not heavy').toBe(false);
  });

  it('splits D02\'s composite leaf-and-swing stroke: the leaf\'s line heavy, the swing thin, the jambs heavy', () => {
    const s = byName.get('Inner door')!;
    // Local (x, y) is IFC (5.05 - y, 3.3 + x): the jambs' outer corners at local (0, 0) and (0.8, 0); the composite's leaf line runs from
    // the hinge, local (0.74, 0.05), to the open leaf's tip (0.74, 0.765), where the swing, radius 0.715 about the hinge, starts and
    // passes local (0.2344, 0.5556) at 135 degrees.
    expect(has(s.heavy, { x: 5.05, y: 3.3 }) && has(s.heavy, { x: 5.05, y: 4.1 }), 'both jambs, heavy').toBe(true);
    const hinge = { x: 5.0, y: 4.04 }, tip = { x: 4.285, y: 4.04 };
    const leaf = (s.heavy ?? []).find((x) => has([x], hinge) && has([x], tip));
    expect(leaf && pts(leaf).length, 'the leaf\'s line from the hinge to the tip, heavy, on its own').toBe(2);
    const onSwing = (x: DraftShape) => pts(x).length > 4 && pts(x).every((p) => Math.abs(Math.hypot(p.x - hinge.x, p.y - hinge.y) - 0.715) < 0.001);
    expect(s.shapes.some(onSwing), 'the swing, thin').toBe(true);
    expect(has(s.heavy, { x: 4.4944, y: 3.5344 }), 'no point of the swing heavy').toBe(false);
  });

  it('draws a window\'s representation thin throughout', () => {
    expect(byName.get('Oblique window')!.heavy).toBeUndefined();
  });

  it('reads Revit\'s leaf, four separate lines, as one loop, and its trimmed-circle swing as no part of it', () => {
    const swing: Pt[] = [];
    const c = { x: 1.25, y: 0.417 }, r = 1.251691456021321;
    for (let a = 92.33515524878541; a <= 180.0001; a += 7.5) swing.push({ x: c.x + r * Math.cos((a * Math.PI) / 180), y: c.y + r * Math.sin((a * Math.PI) / 180) });
    const lines: Pt[][] = [
      swing,
      [{ x: 1.199, y: 0.417 }, { x: 1.199, y: 1.667652030373253 }],
      [{ x: 1.25, y: 1.667652030373253 }, { x: 1.199, y: 1.667652030373253 }],
      [{ x: 1.25, y: 0.417 }, { x: 1.25, y: 1.667652030373253 }],
      [{ x: 1.25, y: 0.417 }, { x: 1.199, y: 0.417 }],
    ];
    const pens = doorStrokePens(lines);
    expect(pens.heavy, 'the leaf\'s four lines, whole').toEqual(lines.slice(1));
    expect(pens.thin, 'the swing, whole').toEqual([swing]);
    // An open line that closes no loop and runs to no swing's centre stays thin.
    expect(doorStrokePens([swing, [{ x: 0, y: 0 }, { x: 1, y: 0 }]]).heavy).toEqual([]);
    // Revit's glass door (duplex 'M_Single-Glass 1'): a glass line from mid-side to mid-side of the leaf's frame has loose ends; the frame is heavy, the glass thin.
    const frame: Pt[][] = [[{ x: 0, y: 0 }, { x: 0.051, y: 0 }], [{ x: 0.051, y: 0 }, { x: 0.051, y: 0.6 }], [{ x: 0.051, y: 0.6 }, { x: 0, y: 0.6 }], [{ x: 0, y: 0.6 }, { x: 0, y: 0 }]];
    const glass = [{ x: 0.0255, y: 0 }, { x: 0.0255, y: 0.6 }];
    expect(doorStrokePens([...frame, glass])).toEqual({ heavy: frame, thin: [glass] });
  });

  it('splits a double swing written as one composite per leaf: each leaf\'s line heavy, each swing thin', () => {
    // Two leaves of 0.6 hinged at (0, 0) and (1.2, 0), open to y = 0.6, each swinging back to the closed leaves meeting at (0.6, 0).
    const arc = (c: Pt, from: number, to: number): Pt[] => Array.from({ length: 13 }, (_, i) => {
      const a = ((from + ((to - from) * i) / 12) * Math.PI) / 180;
      return { x: c.x + 0.6 * Math.cos(a), y: c.y + 0.6 * Math.sin(a) };
    });
    const left = [{ x: 0, y: 0 }, ...arc({ x: 0, y: 0 }, 90, 0)], right = [{ x: 1.2, y: 0 }, ...arc({ x: 1.2, y: 0 }, 90, 180)];
    const pens = doorStrokePens([left, right]);
    expect(pens.heavy, 'the two leaves\' lines').toEqual([left.slice(0, 2), right.slice(0, 2)]);
    expect(pens.thin, 'the two swings').toEqual([left.slice(1), right.slice(1)]);
  });

  it('draws a sliding door\'s panels, closed rectangles, heavy', () => {
    const panel = (x: number, y: number): Pt[] => [{ x, y }, { x: x + 0.8, y }, { x: x + 0.8, y: y + 0.04 }, { x, y: y + 0.04 }, { x, y }];
    const panels = [panel(0, 0), panel(0.75, 0.04)];
    expect(doorStrokePens(panels)).toEqual({ heavy: panels, thin: [] });
  });
});
