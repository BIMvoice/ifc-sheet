/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a door drawn from its own plan representation takes the generated door symbol's pens per stroke: its leaf and frame heavy, its
 * swing thin; a window stays thin, as the generated window symbol. The fixture (`__fixtures__/bonsai-door-symbols.ifc`) holds Bonsai's
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
import { leafStrokes } from './opening-plan-rep-pens.js';
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

  it('draws D02\'s jambs heavy and keeps its composite leaf-and-swing stroke thin', () => {
    const s = byName.get('Inner door')!;
    // Local (x, y) is IFC (5.05 - y, 3.3 + x): the jambs' outer corners at local (0, 0) and (0.8, 0); the swing, radius 0.715 about local
    // (0.74, 0.05), passes local (0.2344, 0.5556) at 135 degrees.
    expect(has(s.heavy, { x: 5.05, y: 3.3 }) && has(s.heavy, { x: 5.05, y: 4.1 }), 'both jambs, heavy').toBe(true);
    expect(has(s.shapes, { x: 4.4944, y: 3.5344 }), 'the stroke mixing a line and an arc, thin').toBe(true);
    expect(has(s.heavy, { x: 4.4944, y: 3.5344 })).toBe(false);
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
    expect([...leafStrokes(lines)].sort()).toEqual([1, 2, 3, 4]);
    // An open line that closes no loop is not classified: it stays thin.
    expect([...leafStrokes([swing, [{ x: 0, y: 0 }, { x: 1, y: 0 }]])]).toEqual([]);
    // Revit's glass door (duplex 'M_Single-Glass 1'): a glass line from mid-side to mid-side of the leaf's frame has loose ends; the frame is heavy, the glass thin.
    const frame: Pt[][] = [[{ x: 0, y: 0 }, { x: 0.051, y: 0 }], [{ x: 0.051, y: 0 }, { x: 0.051, y: 0.6 }], [{ x: 0.051, y: 0.6 }, { x: 0, y: 0.6 }], [{ x: 0, y: 0.6 }, { x: 0, y: 0 }]];
    expect([...leafStrokes([...frame, [{ x: 0.0255, y: 0 }, { x: 0.0255, y: 0.6 }]])].sort()).toEqual([0, 1, 2, 3]);
  });
});
