/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bonsai writes the plan symbol of furniture and sanitaryware as a `Body` representation in a `Plan` / PLAN_VIEW subcontext,
 * not as `FootPrint` (#680): `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Plan',...,.PLAN_VIEW.)`, an `IFCSHAPEREPRESENTATION(#24,'Body',
 * 'Curve2D')` on the type's representation map, mapped onto the occurrence. The fixture of the #489 tests with its FootPrint renamed.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { IfcParser } from '@ifc-lite/parser';
import { describe, expect, it } from 'vitest';
import { BOX, CHAIR_1, CHAIR_2, planSymbolIfc } from './__fixtures__/plan-symbol-model.js';
import { generateDefaultSet } from './index.js';
import { generateViewDrawings, openModel } from './headless.js';
import { readPlanSymbols, withPlanSymbols } from './plan-symbols.js';

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const BONSAI = planSymbolIfc().replace("('FootPrint','Plan',", "('Body','Plan',").replace("'FootPrint','GeometricCurveSet'", "'Body','GeometricCurveSet'").replace("'FootPrint','MappedRepresentation'", "'Body','MappedRepresentation'");
const bytes = (text: string) => new TextEncoder().encode(text);
const linePoints = (drawing: Drawing2D, id: number) => drawing.lines.filter((l) => l.entityId === id && l.visibility !== 'hidden').flatMap((l) => [l.line.start, l.line.end]);

describe('a plan symbol written as Body in a Plan subcontext (#680)', () => {
  it('is read like a FootPrint: the file really has no FootPrint, and both chairs get a symbol with the arc', async () => {
    expect(BONSAI).not.toContain("'FootPrint'");
    expect(BONSAI).toContain("('Body','Plan',");
    const store = await new IfcParser().parseColumnar(bytes(BONSAI).buffer as ArrayBuffer);
    const read = readPlanSymbols(store);
    expect([...read.symbols.keys()].sort((a, b) => a - b)).toEqual([CHAIR_1, CHAIR_2]);
    // Render frame z = -y: CHAIR_1's rectangle is 3..3.5 in the file and the half circle bulges to 3.7.
    const zs = read.symbols.get(CHAIR_1)!.curves.flat().map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(-3.7, 2);
    expect(Math.max(...zs)).toBeCloseTo(-3, 6);
  });

  it('does not take the 3D Body of the Model context for a symbol', async () => {
    const store = await new IfcParser().parseColumnar(bytes(planSymbolIfc().replace("('FootPrint','Plan',", "('FootPrint','Model',").replace("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Plan',2", "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',2")).buffer as ArrayBuffer);
    expect(readPlanSymbols(store).symbols.size).toBe(0);
  });
});

describe.skipIf(!existsSync(WASM))('the plan of a Bonsai-style model (#680)', () => {
  it('draws the symbol and not the cut body: the arc past the body is there, the box keeps its body', async () => {
    const model = await openModel(bytes(BONSAI));
    const set = generateDefaultSet(model, { now: Date.UTC(2026, 10, 4) });
    if (!set) throw new Error('no set');
    const plan = { ...set.document.views.find((v) => v.kind === 'plan')!, viewDepth: 3 };
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
    const drawn = withPlanSymbols(drawing, readPlanSymbols(model.dataStore, model.coordinateInfo).symbols);
    const ys = (d: Drawing2D, id: number) => linePoints(d, id).map((p) => p.y);
    // The arc bulges 0.2 m past the body's footprint, so the symbol is longer than the body in y.
    expect(Math.min(...ys(drawn, CHAIR_1))).toBeCloseTo(Math.min(...ys(drawing, CHAIR_1)) - 0.2, 2);
    expect(Math.min(...ys(drawn, CHAIR_2))).toBeCloseTo(Math.min(...ys(drawing, CHAIR_2)), 2);
    expect(drawn.lines.filter((l) => l.entityId === BOX)).toEqual(drawing.lines.filter((l) => l.entityId === BOX));
  });
});
