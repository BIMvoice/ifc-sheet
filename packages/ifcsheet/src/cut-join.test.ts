/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #349: like cut faces join where they meet, so a plan shows no mitre diagonal at a wall corner and no line across a T.
 *
 * `__fixtures__/wall-joins.ifc` (3 m high walls on Level 0): brick walls A (x 0..8, y 0..0.3) and B (x 0..0.3, y 0..6) in a
 * mitred corner, both ending on the diagonal (0,0)-(0.3,0.3); brick wall C (x 4..4.2) butting into A's inner face, a T;
 * concrete wall D (x 6..6.2) butting into A the same way. The plan cut through the CLI's own path (`openModel`,
 * `generateViewDrawings`); a plan's drawing has y = -model y. The union itself is checked on plain rectangles too.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, Point2D } from '@ifc-lite/drawing-2d';
import { unionFaces, type Face, type Pt2 } from './cut-join.js';
import { joinLikeCuts, likeCutKey } from './cut-join-drawing.js';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import type { PlanProjectView } from './document.js';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { headlessMaterialSource } from './material-colour.js';
import { materialResolver } from './material-drawing.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';
import { PEN_TABLE } from './view-style.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/wall-joins.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the wall joins test: ${missing}`);

const rect = (x0: number, y0: number, x1: number, y1: number): Face => ({ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] });
const area = (ring: readonly Pt2[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

/** Whether the segment a-b passes within 1 mm of `p`. */
function through(a: Point2D, b: Point2D, p: Point2D): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < 1e-3;
}
const ringsThrough = (faces: readonly Face[], p: Pt2) => faces.some((f) => [f.outer, ...f.holes].some((r) => r.some((a, i) => through(a, r[(i + 1) % r.length], p))));

const cutRuns = (g: SheetGraphic) => [...g.cut, ...g.pens.filter((p) => p.layer === 'CUT').flatMap((p) => p.runs)];
/** Every wall edge of the fixture runs along x or y but the mitre's: a cut segment at 45 degrees is the corner's joint. */
const hasDiagonal = (g: SheetGraphic) => cutRuns(g).some((r) => r.some((a, i) => {
  const b = r[i + 1];
  if (!b) return false;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  return dx > 1e-3 && dy > 1e-3 && Math.abs(dx - dy) < 0.2 * Math.max(dx, dy);
}));

describe('unionFaces', () => {
  it('joins an L corner of two butting walls into one outline without the joint', () => {
    const out = unionFaces([rect(0, 0, 5, 0.3), rect(4.7, 0.3, 5, 4)])!;
    expect(out).toHaveLength(1);
    expect(out[0].outer).toHaveLength(6);
    expect(area(out[0].outer)).toBeCloseTo(5 * 0.3 + 0.3 * 3.7, 9);
    expect(ringsThrough(out, { x: 4.85, y: 0.3 })).toBe(false);
  });

  it('joins a T: the face of the through wall loses the stretch the other wall meets, and keeps the rest', () => {
    const out = unionFaces([rect(0, 0, 10, 0.3), rect(4.9, 0.3, 5.1, 3)])!;
    expect(out).toHaveLength(1);
    expect(out[0].outer).toHaveLength(8);
    expect(ringsThrough(out, { x: 5, y: 0.3 })).toBe(false);
    expect(ringsThrough(out, { x: 2, y: 0.3 })).toBe(true);
  });

  it('joins overlapping walls into their union and walls end to end into one', () => {
    const over = unionFaces([rect(0, 0, 5, 0.3), rect(4.7, 0, 5, 4)])!;
    expect(over).toHaveLength(1);
    expect(ringsThrough(over, { x: 4.7, y: 0.15 })).toBe(false);
    expect(unionFaces([rect(0, 0, 3, 0.2), rect(3, 0, 7, 0.2)])![0].outer).toHaveLength(4);
  });

  it('leaves faces that do not meet apart, and the room inside four walls as a hole', () => {
    expect(unionFaces([rect(0, 0, 1, 1), rect(3, 0, 4, 1)])).toHaveLength(2);
    const room = unionFaces([rect(0, 0, 6, 0.3), rect(0, 3.7, 6, 4), rect(0, 0.3, 0.3, 3.7), rect(5.7, 0.3, 6, 3.7)])!;
    expect(room).toHaveLength(1);
    expect(room[0].holes).toHaveLength(1);
    expect(area(room[0].holes[0])).toBeCloseTo(5.4 * 3.4, 9);
  });

  it('joins walls whose meeting points differ by single-precision noise, as model geometry arrives', () => {
    const f = (v: number) => Math.fround(v + 0.7) - 0.7;
    const a = rect(f(1.668), f(-0.946), f(6.12), f(-0.851));
    const b: Face = { outer: [{ x: 6.120000362, y: -4.409000397 }, { x: 6.410000324, y: -4.409000397 }, { x: 6.410000324, y: 1.101000071 }, { x: 6.120000362, y: 1.101000071 }], holes: [] };
    expect(unionFaces([a, b])).toHaveLength(1);
  });
});

describe.skipIf(missing !== null)('a plan of walls meeting at a corner and a T (#349, wall-joins.ifc)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let raw: Drawing2D;
  let joined: Drawing2D;

  /** Whether a cut line, or the outline of a cut face, passes through `p` (drawing coordinates). */
  const lineAt = (d: Drawing2D, p: Point2D) =>
    d.lines.some((l) => l.category === 'cut' && through(l.line.start, l.line.end, p)) || ringsThrough(d.cutPolygons.map((q) => q.polygon), p);

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made || !model.extent) throw new Error('no set: the model has no extent');
    set = made;
    const plan: PlanProjectView = { id: 'p', kind: 'plan', name: 'p', createdAt: 0, level: set.levels[0], cutHeight: 1.2, viewDepth: 0 };
    raw = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent)).get('p')!;
    const names = headlessMaterialSource(model.dataStore!);
    joined = joinLikeCuts(raw, (p) => likeCutKey(p, names.nameOf(p, true)));
  }, 120_000);

  it('the plan cuts the four walls, A and B meeting on the mitre diagonal', () => {
    expect(new Set(raw.cutPolygons.map((p) => p.entityId)).size).toBe(4);
    expect(lineAt(raw, { x: 0.15, y: -0.15 })).toBe(true);
    expect(lineAt(raw, { x: 4.1, y: -0.3 })).toBe(true);
  });

  it('no line on the corner\'s diagonal, where brick A meets brick B', () => {
    expect(lineAt(joined, { x: 0.15, y: -0.15 })).toBe(false);
    expect(lineAt(joined, { x: 0.05, y: -0.05 })).toBe(false);
    // The corner's outline is still drawn, outside and in.
    expect(lineAt(joined, { x: 0, y: -3 })).toBe(true);
    expect(lineAt(joined, { x: 3, y: 0 })).toBe(true);
    expect(lineAt(joined, { x: 0.3, y: -3 })).toBe(true);
  });

  it('no line across the T where brick C meets brick A; A\'s inner face is drawn on either side of it', () => {
    expect(lineAt(joined, { x: 4.1, y: -0.3 })).toBe(false);
    expect(lineAt(joined, { x: 4.02, y: -0.3 })).toBe(false);
    expect(lineAt(joined, { x: 3.9, y: -0.3 })).toBe(true);
    expect(lineAt(joined, { x: 4.3, y: -0.3 })).toBe(true);
    expect(lineAt(joined, { x: 4, y: -3 })).toBe(true);
  });

  it('concrete D against brick A keeps its joint: only like materials join', () => {
    expect(lineAt(joined, { x: 6.1, y: -0.3 })).toBe(true);
  });

  it('the headless sheet draws the plan with no mitre diagonal in its cut', async () => {
    const sheets = await sheetGraphics(set, model);
    const planSheet = sheets.find((s) => s.viewports.some((v) => set.document.views.find((w) => w.id === v.viewId)?.kind === 'plan'))!;
    expect(planSheet).toBeDefined();
    expect(cutRuns(planSheet).length).toBeGreaterThan(0);
    expect(hasDiagonal(planSheet)).toBe(false);
  }, 120_000);

  it('a colour scheme that paints A and B alike keeps them joined on the headless sheet, as the app\'s sheet joins them', async () => {
    const plan = set.document.views.find((v) => v.kind === 'plan')!;
    const sheet = set.document.sheets.find((s) => s.viewports?.some((v) => v.viewId === plan.id))!;
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, set.levels, model.extent!)).get(plan.id)!;
    // The two walls on the corner's diagonal, painted one colour: the app joins faces of one scheme colour (`schemeColour` in `likeCutKey`).
    const corner = drawing.cutPolygons.filter((p) => ringsThrough([p.polygon], { x: 0.15, y: -0.15 })).map((p) => p.entityId);
    expect(new Set(corner).size).toBe(2);
    const scheme = { fills: [], elementColours: new Map(corner.map((id) => [id, '#cc3333'])), entries: [] };
    const materials = materialResolver(headlessMaterialSource(model.dataStore!), []);
    const graphic = sheetGraphic(sheet, set.document, new Map([[plan.id, drawing]]), model.extent, new Map([[plan.id, scheme]]), undefined, undefined, PEN_TABLE, undefined, undefined, undefined, undefined, undefined, undefined, undefined, materials);
    expect(cutRuns(graphic).length).toBeGreaterThan(0);
    expect(hasDiagonal(graphic)).toBe(false);
  }, 120_000);
});
