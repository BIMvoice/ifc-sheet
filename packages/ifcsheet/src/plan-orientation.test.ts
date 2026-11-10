/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan drawn square to the building (Revit's project north), on `__fixtures__/rotated-site.ifc`: four walls round a
 * 4 x 2 m box in a site turned 48 degrees about Z, no TrueNorth (north is +Y). Through the CLI's own path (`openModel`,
 * `generateDefaultSet`, `generateViewDrawings`): a new plan draws the walls along the drawing's axes with its north arrow
 * turned by the 48 degrees reduced to a quarter turn (-42, so 42 counter-clockwise on the paper); `orientation: 'true-north'`, and a plan saved without the field, draw them at 48 degrees.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import type { PlanProjectView } from './document.js';
import { drawingToWorld, worldToDrawing } from './drawing-frame.js';
import { viewExtent } from './drawing-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { squareTurn } from './plan-orientation.js';
import { viewCentre } from './view-centre.js';
import { northDegrees } from './viewport-marks.js';
import { crossReferenceMarks } from './cross-ref/plan.js';
import { tableMeasure } from './dimall/measure.js';
import { turnOf } from './drawing-frame.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/rotated-site.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the plan orientation test: ${missing}`);

const DEG = Math.PI / 180;

/** The directions, degrees in [0, 180), of every cut edge longer than 5 cm. */
function cutEdgeAngles(d: Drawing2D): number[] {
  const out: number[] = [];
  for (const p of d.cutPolygons) {
    const r = p.polygon.outer;
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) return;
      out.push(((Math.atan2(b.y - a.y, b.x - a.x) / DEG) % 180 + 180) % 180);
    });
  }
  return out;
}
/** How far `deg` is from the nearest multiple of `step`. */
const offStep = (deg: number, step: number) => Math.abs(deg - Math.round(deg / step) * step);

describe('squareTurn', () => {
  it('is the site rotation reduced to (-45, 45] degrees, and none within half a degree of a quarter turn', () => {
    expect(squareTurn(48 * DEG)).toBeCloseTo(-42 * DEG, 12);
    // rvt01's site: -132 degrees turns by its -42 residual, not by 132.
    expect(squareTurn(-132 * DEG)).toBeCloseTo(-42 * DEG, 12);
    expect(squareTurn(-30 * DEG)).toBeCloseTo(-30 * DEG, 12);
    expect(squareTurn(400 * DEG)).toBeCloseTo(40 * DEG, 12);
    expect(squareTurn(45 * DEG)).toBeCloseTo(45 * DEG, 12);
    expect(squareTurn(-45 * DEG)).toBeCloseTo(45 * DEG, 12);
    for (const square of [0, 0.4, -0.4, 90, 90.3, 90.4, 179.6, -90.45, 270]) expect(squareTurn(square * DEG)).toBe(0);
    expect(squareTurn(91 * DEG)).toBeCloseTo(1 * DEG, 12);
    expect(squareTurn(90.6 * DEG)).toBeCloseTo(0.6 * DEG, 12);
    expect(squareTurn(undefined)).toBe(0);
    expect(squareTurn(Number.NaN)).toBe(0);
  });

  it('turns a plan frame that drawingToWorld undoes exactly', () => {
    const plane = { axis: 'y' as const, position: 1.2, flipped: false, turn: 48 * DEG };
    const w = { x: 3.25, y: 1.2, z: -7.5 };
    const back = drawingToWorld(plane, worldToDrawing(plane, w));
    expect(back.x).toBeCloseTo(w.x, 12);
    expect(back.y).toBeCloseTo(w.y, 12);
    expect(back.z).toBeCloseTo(w.z, 12);
  });
});

describe.skipIf(missing !== null)('a plan square to a building its site turns 48 degrees (rotated-site.ifc)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let plan: PlanProjectView;
  const drawings = new Map<string, Drawing2D>();

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made || !model.extent) throw new Error('no set: the model has no extent');
    set = made;
    plan = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && !v.site)!;
    const trueNorth: PlanProjectView = { ...plan, id: 'true-north', orientation: 'true-north' };
    const { orientation: _left, ...saved } = { ...plan, id: 'saved' };
    const views = [plan, trueNorth, saved];
    for (const [id, d] of await generateViewDrawings(views, model.buildingMeshes, set.levels, model.extent)) drawings.set(id, d);
  }, 120_000);

  it('reads the site rotation and the building\'s footprint, 2 x 4 m in its turned frame', () => {
    expect(model.coordinateInfo?.buildingRotation).toBeCloseTo(48 * DEG, 6);
    // 48 degrees reduced to a quarter turn: the plan turns -42, so north stays within 45 degrees of up.
    expect(model.extent?.square?.turn).toBeCloseTo(-42 * DEG, 6);
    expect(plan.orientation).toBe('building');
    // Turned -42 degrees, the building's 4 m side runs down the sheet.
    const size = viewExtent(plan, model.extent!);
    expect(size.w).toBeCloseTo(2, 3);
    expect(size.h).toBeCloseTo(4, 3);
  });

  it('a new plan draws every cut edge along the drawing\'s axes, the box 2 x 4 m', () => {
    const d = drawings.get(plan.id)!;
    const angles = cutEdgeAngles(d);
    expect(angles.length).toBeGreaterThanOrEqual(8);
    for (const a of angles) expect(offStep(a, 90)).toBeLessThan(1e-4);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(2, 3);
    expect(d.bounds.max.y - d.bounds.min.y).toBeCloseTo(4, 3);
    // The viewport is centred on the box's middle, in the same turned frame.
    const centre = viewCentre(plan, model.extent!)!;
    expect(centre.x).toBeCloseTo((d.bounds.min.x + d.bounds.max.x) / 2, 3);
    expect(centre.y).toBeCloseTo((d.bounds.min.y + d.bounds.max.y) / 2, 3);
  });

  it('its north arrow is turned 42 degrees counter-clockwise on the paper, to real north (project +Y)', () => {
    expect(northDegrees(drawings.get(plan.id)!.config.plane, null)).toBeCloseTo(42, 4);
    expect(northDegrees(drawings.get('true-north')!.config.plane, null)).toBe(0);
  });

  it('orientation true-north draws the walls at 48 degrees, as the world has them', () => {
    const angles = cutEdgeAngles(drawings.get('true-north')!);
    expect(angles.length).toBeGreaterThanOrEqual(8);
    // Drawing y runs down the paper (-model y), so the site's 48 degrees reads as 132 and its walls' other side as 42.
    for (const a of angles) expect(Math.min(offStep(a - 132, 180), offStep(a - 42, 180))).toBeLessThan(1e-3);
  });

  it('a plan saved without the field draws exactly as true north', () => {
    const saved = drawings.get('saved')!, trueNorth = drawings.get('true-north')!;
    expect(saved.cutPolygons.map((p) => p.polygon)).toEqual(trueNorth.cutPolygons.map((p) => p.polygon));
    expect(saved.lines.map((l) => l.line)).toEqual(trueNorth.lines.map((l) => l.line));
    expect(saved.config.plane).toEqual(trueNorth.config.plane);
  });

  it('its elevation marks stand on the sides the elevations look from, through the turned frame', () => {
    const d = drawings.get(plan.id)!;
    const marks = crossReferenceMarks({
      drafts: [], view: plan, views: set.document.views, sheets: set.document.sheets, groundPlanId: plan.id, bounds: d.bounds,
      viewportScale: 100, measure: tableMeasure, turn: turnOf(d.config.plane),
    });
    const mid = { x: (d.bounds.min.x + d.bounds.max.x) / 2, y: (d.bounds.min.y + d.bounds.max.y) / 2 };
    const looks = { north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as const;
    const elevations = set.document.views.filter((v) => v.kind === 'elevation' && !v.detail);
    expect(elevations.length).toBe(4);
    for (const e of elevations) {
      if (e.kind !== 'elevation') continue;
      const tip = marks.find((m) => m.id.startsWith(`${plan.id}:elevation:${e.id}`) && m.shape.type === 'line');
      if (!tip || tip.shape.type !== 'line') throw new Error(`no mark for the ${e.direction} elevation`);
      // The tip, seen from the plan's middle, lies the way the world direction runs on this drawing.
      const want = worldToDrawing(d.config.plane, looks[e.direction]);
      const got = { x: tip.shape.a.x - mid.x, y: tip.shape.a.y - mid.y };
      const len = Math.hypot(got.x, got.y);
      expect(got.x / len, e.direction).toBeCloseTo(want.x, 6);
      expect(got.y / len, e.direction).toBeCloseTo(want.y, 6);
    }
  });
});
