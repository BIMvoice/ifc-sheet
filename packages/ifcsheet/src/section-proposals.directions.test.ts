/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #665: the starting set's two sections look in different directions (one cuts across X, one across Y) and neither runs along the
 * thickness of a wall. On a plain house, and on AC20-FZK-Haus and Lloyd's Bonsai house through the engine the command line runs.
 * The app lays its set out from the same `proposeSections` (`apps/viewer/src/project/section-proposals.test.ts` pins that).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import type { SectionProjectView } from './document.js';
import { groundPlan } from './ground-plan.js';
import { openModel } from './model.js';
import { proposeSections, type Footprint, type ProposalInput } from './section-proposals.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const LLOYD = '/Users/petruc/dev/bimvoice/_workspace/models/lloyd/ifc-from-bonsai-2026-11-03.ifc';
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const wasmMissing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

/** The direction a cut line runs: 'x' for a line of constant x (a plane facing X), else 'z'. */
const facing = (line: { a: { x: number; z: number }; b: { x: number; z: number } }): 'x' | 'z' => (Math.abs(line.a.x - line.b.x) < 1e-9 ? 'x' : 'z');
/** The walls a line of constant `axis` coordinate `t` runs along (inside a thin wall that is longer the way the line runs). */
const runsAlong = (walls: readonly Footprint[], axis: 'x' | 'z', t: number): Footprint[] => {
  const other = axis === 'x' ? 'z' : 'x';
  return walls.filter((w) => w.max[axis] - w.min[axis] <= 0.6 && w.max[other] - w.min[other] > w.max[axis] - w.min[axis] && t > w.min[axis] && t < w.max[axis]);
};

/** The constant coordinate a section's plane stands at: its signed distance along its (axis-aligned) normal, back on the axis. */
const coordinateOf = (s: SectionProjectView): number => {
  const n = s.plane.custom?.normal ?? [0, 0, 0];
  return (s.plane.custom?.distance ?? 0) * Math.sign(Math.abs(n[0]) > 0.5 ? n[0] : n[2]);
};

const house =(extra: Partial<ProposalInput> = {}): ProposalInput => ({
  building: { min: { x: 0, z: 0 }, max: { x: 10, z: 7 } },
  rooms: [
    { name: 'Living Room', min: { x: 0, z: 0 }, max: { x: 6, z: 4 } },
    { name: 'Kitchen', min: { x: 6, z: 0 }, max: { x: 10, z: 3 } },
  ],
  stairs: [],
  ...extra,
});

describe('the first two proposed sections (#665)', () => {
  it('look in different directions: one across X, one across Y', () => {
    const [first, second] = proposeSections(house());
    expect(new Set([facing(first), facing(second)])).toEqual(new Set(['x', 'z']));
    expect(first.label).not.toBe(second.label);
  });

  it('keep that for a building long along Z, for one room, and for no room at all', () => {
    for (const input of [house({ building: { min: { x: 0, z: 0 }, max: { x: 7, z: 10 } } }), house({ rooms: house().rooms.slice(0, 1) }), house({ rooms: [] })]) {
      const [first, second] = proposeSections(input);
      expect(new Set([facing(first), facing(second)])).toEqual(new Set(['x', 'z']));
    }
  });

  it('are the same on every run, whatever order the rooms arrive in', () => {
    const rooms = house().rooms;
    expect(proposeSections(house({ rooms: [...rooms].reverse() }))).toEqual(proposeSections(house({ rooms })));
  });

  it('keep off a wall the room is centred on: a cut along a wall draws almost nothing', () => {
    // A 4 m room centred at x = 2, with a 0.2 m wall standing at x = 1.9 to 2.1.
    const walls: Footprint[] = [{ min: { x: 1.9, z: 0 }, max: { x: 2.1, z: 4 } }];
    const input = house({ rooms: [{ name: 'Living Room', min: { x: 0, z: 0 }, max: { x: 4, z: 4 } }], building: { min: { x: 0, z: 0 }, max: { x: 10, z: 7 } } });
    const blind = proposeSections(input).find((p) => p.key === 'room-Living Room-1');
    expect(blind?.a.x).toBe(2); // without the walls the cut is on the wall: the defect
    const cut = proposeSections({ ...input, walls }).find((p) => p.key === 'room-Living Room-1');
    expect(cut && runsAlong(walls, 'x', cut.a.x)).toEqual([]);
    expect(cut && cut.a.x > 0 && cut.a.x < 4).toBe(true); // still inside the room
  });
});

describe.skipIf(wasmMissing !== null || !existsSync(FZK))('the starting set on AC20-FZK-Haus (#665)', () => {
  it('has one section across X and one across Y, neither along a wall', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, {});
    expect(set).not.toBeNull();
    const views = set?.document.views ?? [];
    const sections = views.filter((v): v is SectionProjectView => v.kind === 'section');
    expect(sections).toHaveLength(2);
    const planes = sections.map((s) => s.plane.custom);
    expect(planes.every((p) => p !== undefined)).toBe(true);
    const dirs = planes.map((p) => (Math.abs(p?.normal[0] ?? 0) > 0.5 ? 'x' : 'z'));
    expect(new Set(dirs)).toEqual(new Set(['x', 'z']));
    const plan = groundPlan(views);
    const walls = (plan && model.proposalInput(plan.level)?.walls) ?? [];
    expect(walls.length).toBeGreaterThan(0);
    sections.forEach((s, i) => expect(runsAlong(walls, dirs[i] as 'x' | 'z', coordinateOf(s))).toEqual([]));
  }, 120_000);
});

describe.skipIf(wasmMissing !== null || !existsSync(LLOYD))("the starting set on Lloyd's Bonsai house (#665; reads a file that is not committed)", () => {
  it('has one section across X and one across Y, neither along a wall', async () => {
    const model = await openModel(new Uint8Array(readFileSync(LLOYD)));
    const set = generateDefaultSet(model, {});
    const views = set?.document.views ?? [];
    const sections = views.filter((v): v is SectionProjectView => v.kind === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const dirs = sections.map((s) => (Math.abs(s.plane.custom?.normal[0] ?? 0) > 0.5 ? 'x' : 'z'));
    expect(new Set(dirs)).toEqual(new Set(['x', 'z']));
    const plan = groundPlan(views);
    const walls = (plan && model.proposalInput(plan.level)?.walls) ?? [];
    expect(walls.length).toBeGreaterThan(0);
    sections.forEach((s, i) => expect(runsAlong(walls, dirs[i] as 'x' | 'z', coordinateOf(s))).toEqual([]));
  }, 120_000);
});
