/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #226: a plan whose cut lies outside the model's extent cuts nothing. The
 * cut is not moved onto the nearest face of the bounds, where it would land on
 * the top slab (or the bottom of the walls) and draw it as one grey cut.
 *
 * The fixture (`__fixtures__/plan-cut-above-top.ifc`): Nivel 1 at 0.0 m holds
 * four 3.0 m walls, 0.2 m thick, around an 8 x 6 m room; Nivel 2 at 3.0 m holds
 * only an 8 x 6 m slab from 3.0 to 3.3 m, so the model top is the slab's top
 * face. Each plan is made the way an open view makes it (`viewDrawing`).
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { sectionPlaneForView } from './view-plane';
import type { ProjectLevel, ProjectView } from './types';

const FIXTURE = new URL('./__fixtures__/plan-cut-above-top.ifc', import.meta.url);
const NIVEL_1: ProjectLevel = { name: 'Nivel 1', elevation: 0, storeyGlobalIds: [] };
const NIVEL_2: ProjectLevel = { name: 'Nivel 2', elevation: 3, storeyGlobalIds: [] };
const BASEMENT: ProjectLevel = { name: 'Basement', elevation: -3, storeyGlobalIds: [] };

/** The four walls' footprints, from the fixture: an 8 x 6 m outline less the 7.6 x 5.6 m room inside it. */
const WALL_FOOTPRINT_M2 = 8 * 6 - 7.6 * 5.6;

const plan = (level: ProjectLevel, cutHeight: number, viewDepth?: number): Exclude<ProjectView, { kind: '3d' }> =>
  ({ id: `plan-${level.name}-${cutHeight}`, name: `${level.name} @ ${cutHeight}`, createdAt: 0, kind: 'plan', level, cutHeight, ...(viewDepth === undefined ? {} : { viewDepth }) });

const area = (points: readonly { x: number; y: number }[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};
const cutArea = (d: Drawing2D): number => d.cutPolygons.reduce((sum, p) => sum + area(p.polygon.outer) - p.polygon.holes.reduce((h, hole) => h + area(hole), 0), 0);
const cutLines = (d: Drawing2D): number => d.lines.filter((l) => l.category === 'cut').length;
const projectionLines = (d: Drawing2D): number => d.lines.filter((l) => l.category === 'projection').length;

describe('a plan cut outside the model extent (#226)', () => {
  let geometry: GeometryResult | null = null;
  before(async () => { geometry = await meshFile(FIXTURE); });

  /** The drawing, or `null` (and the test skipped) when the wasm runtime is not built. */
  async function draw(t: { skip(message: string): void }, view: Exclude<ProjectView, { kind: '3d' }>): Promise<Drawing2D | null> {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return null; }
    const d = await viewDrawing(view, geometry);
    assert.ok(d, `${view.name} drew nothing`);
    return d;
  }

  it('the fixture tops out at the slab top face, 3.3 m', (t) => {
    if (!geometry) { t.skip('wasm bundle not built'); return; }
    const b = boundsOf(geometry)!;
    assert.ok(Math.abs(b.max.y - 3.3) < 1e-4, String(b.max.y));
    assert.ok(Math.abs(b.min.y) < 1e-4, String(b.min.y));
  });

  it('keeps a cut above the model top where it is: past 100 %, not on the top face', (t) => {
    if (!geometry) { t.skip('wasm bundle not built'); return; }
    const plane = sectionPlaneForView(plan(NIVEL_2, 1.2), boundsOf(geometry), [NIVEL_2]);
    // 4.2 m on the 0..3.3 m range.
    assert.ok(Math.abs((plane?.position ?? 0) - (4.2 / 3.3) * 100) < 1e-6, String(plane?.position));
  });

  it('a cut above the model top cuts nothing, and the slab below it still draws in projection', async (t) => {
    const d = await draw(t, plan(NIVEL_2, 1.2));
    if (!d) return;
    assert.equal(d.cutPolygons.length, 0, 'the slab under a 4.2 m cut is drawn as a cut');
    assert.equal(cutLines(d), 0);
    assert.ok(projectionLines(d) > 0, 'the slab below the cut is not drawn at all');
  });

  it('its view depth runs down into the model from the model top, not from the cut in the air above it', async (t) => {
    // 0.5 m down from a 4.2 m cut ends at 3.7 m, above the slab; from the model top, 3.3 m, it reaches 2.8 m and sees the slab.
    const d = await draw(t, plan(NIVEL_2, 1.2, 0.5));
    if (!d) return;
    assert.equal(d.cutPolygons.length, 0);
    assert.ok(projectionLines(d) > 0, 'the slab within the view depth below the model top is not drawn');
  });

  it('a cut below the model bottom cuts nothing', async (t) => {
    const d = await draw(t, plan(BASEMENT, 1.2));
    if (!d) return;
    assert.equal(d.cutPolygons.length, 0, 'the walls above a -1.8 m cut are drawn as a cut');
    assert.equal(cutLines(d), 0);
  });

  // On the face itself the plane is not moved; what the generator then draws for a plane touching the slab's top face is its own rule, unchanged here.
  it('a cut exactly on the top face stays on it, at 100 %', (t) => {
    if (!geometry) { t.skip('wasm bundle not built'); return; }
    const plane = sectionPlaneForView(plan(NIVEL_2, 0.3), boundsOf(geometry), [NIVEL_2]);
    assert.ok(Math.abs((plane?.position ?? 0) - 100) < 1e-6, String(plane?.position));
  });

  it('a cut a millimetre above the top face cuts nothing', async (t) => {
    const d = await draw(t, plan(NIVEL_2, 0.301));
    if (!d) return;
    assert.equal(d.cutPolygons.length, 0);
    assert.equal(cutLines(d), 0);
  });

  it('a mid-storey cut is unchanged: the four walls are cut, and only they', async (t) => {
    const d = await draw(t, plan(NIVEL_1, 1.2));
    if (!d) return;
    assert.ok(d.cutPolygons.length >= 4, String(d.cutPolygons.length));
    assert.ok(Math.abs(cutArea(d) - WALL_FOOTPRINT_M2) < 0.01, `cut area ${cutArea(d)} m², walls ${WALL_FOOTPRINT_M2} m²`);
  });
});
