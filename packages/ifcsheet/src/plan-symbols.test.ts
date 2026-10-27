/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plan symbol of a type or an element is drawn in a plan instead of its body (#489): a furniture type with a FootPrint
 * representation mapped onto two chairs, and a box without one (`__fixtures__/plan-symbol-model.ts`).
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { IfcParser } from '@ifc-lite/parser';
import { describe, expect, it } from 'vitest';
import { BOX, CHAIR_1, CHAIR_2, planSymbolIfc } from './__fixtures__/plan-symbol-model.js';
import { generateDefaultSet } from './index.js';
import { generateViewDrawings, openModel, sheetGraphics } from './headless.js';
import { planSymbolsOn, readPlanSymbols, withPlanSymbols, type PlanSymbol } from './plan-symbols.js';

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const bytes = () => new TextEncoder().encode(planSymbolIfc());

type Box = { minX: number; maxX: number; minY: number; maxY: number };
const boxOf = (points: { x: number; y: number }[]): Box => ({
  minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)),
});
/** The drawing's points of one entity: lines only, the faces are counted apart. */
const linePoints = (drawing: Drawing2D, id: number) => drawing.lines.filter((l) => l.entityId === id && l.visibility !== 'hidden').flatMap((l) => [l.line.start, l.line.end]);
const facesOf = (drawing: Drawing2D, id: number) => [...drawing.cutPolygons, ...drawing.projectionPolygons].filter((p) => p.entityId === id).length;
/** `digits` 2 where a tessellated arc's chord is measured against the true curve (its sagitta here is 0.4 mm). */
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe('reading the plan symbols of a model (#489)', () => {
  it('reads the symbol of the occurrence and the one of the type, placed in the render frame, and none for the box', async () => {
    const store = await new IfcParser().parseColumnar(bytes().buffer as ArrayBuffer);
    const read = readPlanSymbols(store);
    expect([...read.symbols.keys()].sort((a, b) => a - b)).toEqual([CHAIR_1, CHAIR_2]);
    expect(read.skipped).toEqual([]);
    // Render frame: x east, z = -y. CHAIR_1's rectangle is (2..2.8, 3..3.5) in the file, and the arc bulges 0.2 past y = 3.5.
    const one = boxOf(read.symbols.get(CHAIR_1)!.curves.flat().map((p) => ({ x: p.x, y: p.z })));
    close(one.minX, 2); close(one.maxX, 2.8); close(one.maxY, -3); close(one.minY, -3.7, 2);
    // CHAIR_2 is turned a quarter turn about its origin (6, 3): local +x runs to world +y, local +y to world -x.
    const two = boxOf(read.symbols.get(CHAIR_2)!.curves.flat().map((p) => ({ x: p.x, y: p.z })));
    close(two.minX, 5.3, 2); close(two.maxX, 6); close(two.minY, -3.8); close(two.maxY, -3);
  });

  it('draws the arc as a curve through its trims, in the file\'s angle unit (degrees here)', async () => {
    const store = await new IfcParser().parseColumnar(bytes().buffer as ArrayBuffer);
    const arc = readPlanSymbols(store).symbols.get(CHAIR_1)!.curves.find((c) => c.length > 5)!;
    // From (0.4 + 0.2, 0.5) to (0.4 - 0.2, 0.5) over the +y side, every point 0.2 from the centre (2.4, 3.5).
    expect(arc[0].x).toBeCloseTo(2.6, 6);
    expect(arc[arc.length - 1].x).toBeCloseTo(2.2, 6);
    for (const p of arc) expect(Math.hypot(p.x - 2.4, p.z - -3.5)).toBeCloseTo(0.2, 6);
  });

  it('reads nothing from a model whose representations are not in a Plan context', async () => {
    const text = planSymbolIfc().replace("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Plan',2", "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',2").replace("('FootPrint','Plan',", "('FootPrint','Model',");
    const store = await new IfcParser().parseColumnar(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(readPlanSymbols(store).symbols.size).toBe(0);
  });

  it('leaves a reflected plan symbol to the ceiling plan', async () => {
    const text = planSymbolIfc().replace('.PLAN_VIEW.,$);', '.REFLECTED_PLAN_VIEW.,$);');
    const store = await new IfcParser().parseColumnar(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(readPlanSymbols(store).symbols.size).toBe(0);
  });

  it('is on unless a view says otherwise', () => {
    expect(planSymbolsOn(undefined)).toBe(true);
    expect(planSymbolsOn({})).toBe(true);
    expect(planSymbolsOn({ usePlanSymbols: false })).toBe(false);
  });
});

describe('putting the symbols into a plan drawing (#489)', () => {
  const line = (entityId: number, a: [number, number], b: [number, number]) => ({ line: { start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } }, category: 'projection' as const, visibility: 'visible' as const, entityId, ifcType: 'IfcFurniture', modelIndex: 0, depth: 1 });
  const drawing = (plane: { axis: 'x' | 'y' | 'z'; flipped?: boolean } = { axis: 'y' }): Drawing2D => ({
    config: { plane: { axis: plane.axis, position: 1.2, flipped: plane.flipped ?? false }, projectionDepth: 3 },
    lines: [line(CHAIR_1, [2, -3], [2.8, -3]), line(BOX, [10, -3], [11, -3])], cutPolygons: [], projectionPolygons: [],
    bounds: { min: { x: 2, y: -3 }, max: { x: 11, y: -3 } }, stats: { cutLineCount: 0, projectionLineCount: 2, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
  } as unknown as Drawing2D);
  const symbols = new Map<number, PlanSymbol>([[CHAIR_1, { expressId: CHAIR_1, curves: [[{ x: 2, y: 0, z: -3 }, { x: 2.8, y: 0, z: -3 }, { x: 2.8, y: 0, z: -3.5 }]] }], [CHAIR_2, { expressId: CHAIR_2, curves: [[{ x: 6, y: 0, z: -3 }, { x: 6, y: 0, z: -4 }]] }]]);

  it('replaces the lines of an element that has a symbol and keeps the rest; an element the drawing does not show gets none', () => {
    const out = withPlanSymbols(drawing(), symbols);
    expect(linePoints(out, CHAIR_1)).toHaveLength(4);
    expect(boxOf(linePoints(out, CHAIR_1)).minY).toBe(-3.5);
    expect(out.lines.filter((l) => l.entityId === BOX)).toHaveLength(1);
    expect(out.lines.some((l) => l.entityId === CHAIR_2)).toBe(false);
    expect(out.bounds.min.y).toBe(-3.5);
  });

  it('is the drawing itself when nothing is drawn from a symbol, or the view is not a plan', () => {
    const plan = drawing();
    expect(withPlanSymbols(plan, new Map())).toBe(plan);
    expect(withPlanSymbols(plan, new Map([[CHAIR_2, symbols.get(CHAIR_2)!]]))).toBe(plan);
    const section = drawing({ axis: 'z' });
    expect(withPlanSymbols(section, symbols)).toBe(section);
  });
});

describe.skipIf(!existsSync(WASM))('the plan of the model, from its bodies and from its symbols (#489)', () => {
  const setup = async () => {
    const model = await openModel(bytes());
    const set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 27) });
    if (!set) throw new Error('no set');
    // The chairs stand below the 1.2 m cut: a plan with a view depth shows them, as a plan of furniture does.
    const plan = { ...set.document.views.find((v) => v.kind === 'plan')!, viewDepth: 3 };
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
    return { model, set, plan, drawing };
  };

  it('puts the symbol where the body is: the same footprint, and the arc past it; the box keeps its body', async () => {
    const { model, drawing } = await setup();
    const symbols = readPlanSymbols(model.dataStore, model.coordinateInfo).symbols;
    const drawn = withPlanSymbols(drawing, symbols);
    // Both chairs and the box are in the plan as bodies.
    for (const id of [CHAIR_1, CHAIR_2, BOX]) expect(linePoints(drawing, id).length).toBeGreaterThan(0);
    const body1 = boxOf(linePoints(drawing, CHAIR_1)), symbol1 = boxOf(linePoints(drawn, CHAIR_1));
    close(symbol1.minX, body1.minX); close(symbol1.maxX, body1.maxX); close(symbol1.maxY, body1.maxY);
    // The arc bulges 0.2 m beyond the body, on the file's +y side, the drawing's -y.
    close(symbol1.minY, body1.minY - 0.2, 2);
    const body2 = boxOf(linePoints(drawing, CHAIR_2)), symbol2 = boxOf(linePoints(drawn, CHAIR_2));
    close(symbol2.minX, body2.minX - 0.2, 2); close(symbol2.maxX, body2.maxX); close(symbol2.minY, body2.minY); close(symbol2.maxY, body2.maxY);
    // The body's faces are gone with its lines, and the box is untouched.
    expect(facesOf(drawn, CHAIR_1) + facesOf(drawn, CHAIR_2)).toBe(0);
    expect(drawn.lines.filter((l) => l.entityId === BOX)).toEqual(drawing.lines.filter((l) => l.entityId === BOX));
    expect(facesOf(drawn, BOX)).toBe(facesOf(drawing, BOX));
  });

  it('prints the symbols on the sheet, and the bodies when the view says not to', async () => {
    const { model, set, plan } = await setup();
    const withView = (graphics: { usePlanSymbols?: boolean }) => ({
      ...set,
      document: { ...set.document, views: set.document.views.map((v) => (v.id === plan.id ? { ...plan, graphics } : v)) },
    });
    const sheetWith = async (graphics: { usePlanSymbols?: boolean }) => (await sheetGraphics(withView(graphics), model)).flatMap((s) => s.lines).length;
    const on = await sheetWith({});
    const off = await sheetWith({ usePlanSymbols: false });
    // The symbols are polylines of single segments (rectangle 4, arc 48 chords), a body's outline a few edges.
    expect(on).not.toBe(off);
    const bodiesAgain = await sheetWith({ usePlanSymbols: true });
    expect(bodiesAgain).toBe(on);
  });
});
