/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831, two things a Bonsai user saw on a plan, read from the DXF `ifcsheet build` writes by element in model units (metres, at the
 * IFC's own x and y). The fixture (`__fixtures__/bonsai-door-flipped.ifc`) is `bonsai-door-symbols.ifc` with D03, the entrance door's
 * type flipped as Bonsai's "Flip" leaves it: turned 180 degrees about Z, its origin on the wall's inner face, so it opens outwards.
 *
 * 1. The flipped door lost its leaf and swing: they lie south of the south wall, past the model's extent, which is the box a plan
 *    viewport clips to, so only the jambs (inside the wall) were left. A plan's door and window symbols are no longer clipped to it.
 * 2. With element layers, the window symbols were written on A-DOOR-SYMB with the doors' (every `SYMBOLS` pen went there). Now a
 *    door's symbol is on A-DOOR-SYMB and a window's on A-GLAZ-SYMB.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dxfEntities } from './__fixtures__/dxf-text.js';
import { EXIT, run } from './cli.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/bonsai-door-flipped.ifc', import.meta.url));

type P = { x: number; y: number };
const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-flipped-door-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let points: (layer: string) => P[];
beforeAll(async () => {
  const code = await run(['build', FIXTURE, '--out', join(dir, 'set.pdf'), '--dxf', join(dir, 'dxf'), '--dxf-layers', 'element', '--dxf-units', 'model'], { stdout: () => undefined, stderr: () => undefined });
  expect(code).toBe(EXIT.ok);
  const entities = dxfEntities(readFileSync(join(dir, 'dxf', 'A-101.dxf'), 'latin1'));
  points = (layer) => entities.filter((e) => e.layer === layer).flatMap((e) => e.points);
}, 200_000);

const near = (pts: readonly P[], q: P) => Math.min(...pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));

describe('a flipped door and the window symbols in a plan\'s DXF by element (#831)', () => {
  it('draws the flipped door\'s leaf and swing outside the wall, not only its jambs', () => {
    const door = points('A-DOOR-SYMB');
    // D03's local (x, y) is IFC (4.9 - x, 0.3 - y): the leaf runs from local y 0.05 to 0.9, the swing (an ellipse about (0.06, 0.05)) ends at (0.875, 0.05).
    expect(near(door, { x: 4.875, y: 0.25 }), 'the jamb, inside the wall').toBeLessThan(0.001);
    expect(near(door, { x: 4.84, y: -0.6 }), 'the open leaf\'s tip, 0.6 m south of the wall').toBeLessThan(0.001);
    expect(near(door, { x: 4.025, y: 0.25 }), 'the swing\'s end at the closed leaf').toBeLessThan(0.001);
    const swing = door.filter((p) => p.y < -0.05 && Math.abs(((p.x - 4.84) / 0.815) ** 2 + ((p.y - 0.25) / 0.85) ** 2 - 1) < 0.01);
    expect(swing.length, 'the swing\'s points south of the wall').toBeGreaterThan(4);
  });

  it('puts the window symbols on A-GLAZ-SYMB and leaves A-DOOR-SYMB to the doors', () => {
    const glaz = points('A-GLAZ-SYMB'), door = points('A-DOOR-SYMB');
    // W02 (north wall, x 5.1 to 6.0): its generated frame. W01 (oblique wall from (6, 0) at 45 degrees): its own glass line's start, local (0.05, 0.1075).
    expect(near(glaz, { x: 5.1, y: 7.0 }), 'the north window\'s frame').toBeLessThan(0.001);
    const c = Math.SQRT1_2;
    expect(near(glaz, { x: 6 + (1.5 + 0.05 - 0.1075) * c, y: (1.5 + 0.05 + 0.1075) * c }), 'the oblique window\'s glass line').toBeLessThan(0.001);
    // Every door stands south of y 4.2; the windows are north of it or in the oblique wall (x past 6).
    for (const p of door) expect(p.y < 4.2 && p.x < 6, `a door symbol point at (${p.x}, ${p.y})`).toBe(true);
    for (const p of glaz) expect(p.y > 6.5 || p.x > 6, `a window symbol point at (${p.x}, ${p.y})`).toBe(true);
  });
});
