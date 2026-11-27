/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a window in a wall the elevation sees at an angle, on `__fixtures__/oblique-wall-window.ifc` through the CLI's own
 * path (`openModel`, `generateDefaultSet`, `generateViewDrawings`). Wall A runs along (2,1), so the north elevation sees it
 * at 26.6° and the west one at 63.4°; wall B runs along x and is the control the north elevation sees square on. Each has
 * an opening 1 m wide, 0.9..2.1 m up, filled by a window whose face is 50 mm in from the wall's face.
 *
 * Seen at an angle, one reveal of the opening turns toward the viewer. The elevation draws, between sill and head, three
 * vertical lines and no more: the wall's face edge on the far side (the other reveal is behind the wall), the window's
 * face edge against the near reveal, and the near reveal's edge at the wall's face. It used to draw the reveal's edge at
 * the wall's inside face (behind the window) instead of the one at its outside face, cut the window's edge and its head
 * and sill into pieces against the reveal, and leave stubs at the window's corners.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import type { ElevationDirection, ProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/oblique-wall-window.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the oblique-wall elevation test: ${missing}`);

const SILL = 0.9, HEAD = 2.1;
/** Wall A's point `along` the wall and `out` from its inside face, in plan (IFC x, y): its axis is (2,1), its outside (-1,2). */
const wallA = (along: number, out: number) => ({ x: (2 * along - out) / Math.sqrt(5), y: (along + 2 * out) / Math.sqrt(5) });
/** Where a plan point lands across the elevation: the north one looks south (x reversed), the west one looks east (y). */
const across = { north: (p: { x: number }) => -p.x, west: (p: { y: number }) => p.y } as const;

const visible = (d: Drawing2D) => d.lines.filter((l) => l.visibility === 'visible' && l.category !== 'hidden');
const isVertical = (l: DrawingLine) => Math.abs(l.line.start.x - l.line.end.x) < 1e-6;
const isLevel = (l: DrawingLine) => Math.abs(l.line.start.y - l.line.end.y) < 1e-6;
const minX = (l: DrawingLine) => Math.min(l.line.start.x, l.line.end.x);
const maxX = (l: DrawingLine) => Math.max(l.line.start.x, l.line.end.x);
const minY = (l: DrawingLine) => Math.min(l.line.start.y, l.line.end.y);
const maxY = (l: DrawingLine) => Math.max(l.line.start.y, l.line.end.y);
const length = (l: DrawingLine) => Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y);

/** The visible lines over the window's box (`x` from `lo` to `hi`, sill to head), widened by 5 cm. */
function aroundWindow(d: Drawing2D, lo: number, hi: number): DrawingLine[] {
  return visible(d).filter((l) => maxX(l) > lo - 0.05 && minX(l) < hi + 0.05 && maxY(l) > SILL - 0.05 && minY(l) < HEAD + 0.05);
}

/** The x of each vertical line among `lines` that runs from sill to head, rounded to the millimetre, once each. */
const fullHeightVerticals = (lines: DrawingLine[]) =>
  [...new Set(lines.filter((l) => isVertical(l) && minY(l) <= SILL + 1e-3 && maxY(l) >= HEAD - 1e-3).map((l) => Math.round(l.line.start.x * 1000) / 1000))].sort((a, b) => a - b);

/** Whether the level lines among `lines` at `y` cover `lo` to `hi` without a gap of a millimetre. */
function covers(lines: DrawingLine[], y: number, lo: number, hi: number): boolean {
  const spans = lines.filter((l) => isLevel(l) && Math.abs(l.line.start.y - y) < 1e-3).map((l) => [minX(l), maxX(l)] as const).sort((a, b) => a[0] - b[0]);
  let reached = lo;
  for (const [a, b] of spans) {
    if (a > reached + 1e-3) break;
    reached = Math.max(reached, b);
  }
  return reached >= hi - 1e-3;
}

describe.skipIf(missing !== null)('an elevation of a window in a wall seen at an angle (#831)', () => {
  const drawings = new Map<ElevationDirection, Drawing2D>();

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const views = set.document.views.filter((v): v is Extract<ProjectView, { kind: 'elevation' }> => v.kind === 'elevation');
    const out = await generateViewDrawings(views, model.buildingMeshes, set.levels, model.extent);
    for (const v of views) if (v.direction && out.has(v.id)) drawings.set(v.direction, out.get(v.id)!);
  }, 120_000);

  // North: the reveal at 1.5 m along faces the viewer; west: the one at 2.5 m does.
  const cases = [
    { view: 'north', near: 1.5, far: 2.5 },
    { view: 'west', near: 2.5, far: 1.5 },
  ] as const;

  for (const { view, near, far } of cases) {
    it(`${view}: draws the opening's edge at the wall's face on both sides, the window's face edge, and nothing else`, () => {
      const d = drawings.get(view)!;
      expect(d).toBeDefined();
      const at = across[view];
      const farFace = at(wallA(far, 0.3)), nearFace = at(wallA(near, 0.3)), windowFace = at(wallA(near, 0.25));
      const lo = Math.min(farFace, nearFace, at(wallA(far, 0))), hi = Math.max(farFace, nearFace, at(wallA(far, 0)));
      const lines = aroundWindow(d, lo, hi);
      const expected = [farFace, windowFace, nearFace].map((x) => Math.round(x * 1000) / 1000).sort((a, b) => a - b);
      // The reveal's edge at the wall's face is drawn; its edge at the inside face and the window's edges behind the wall are not.
      expect(fullHeightVerticals(lines)).toEqual(expected);
      expect(lines.filter((l) => isVertical(l) && !expected.some((x) => Math.abs(l.line.start.x - x) < 2e-3))).toEqual([]);
      // The opening's head and sill run whole from one face edge to the other.
      expect(covers(lines, HEAD, Math.min(farFace, nearFace), Math.max(farFace, nearFace))).toBe(true);
      expect(covers(lines, SILL, Math.min(farFace, nearFace), Math.max(farFace, nearFace))).toBe(true);
      // No stubs or pieces at the window's corners.
      expect(lines.filter((l) => length(l) < 0.1).map((l) => `${l.ifcType} ${JSON.stringify(l.line)}`)).toEqual([]);
    });
  }

  it('north: the window in the wall seen square on is drawn as it was, its outline and the opening on one rectangle', () => {
    const d = drawings.get('north')!;
    const lines = aroundWindow(d, -10.5, -9.5);
    expect(fullHeightVerticals(lines)).toEqual([-10.5, -9.5]);
    expect(covers(lines, HEAD, -10.5, -9.5)).toBe(true);
    expect(covers(lines, SILL, -10.5, -9.5)).toBe(true);
    expect(lines.filter((l) => length(l) < 0.1)).toEqual([]);
  });
});
