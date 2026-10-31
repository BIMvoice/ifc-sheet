/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #586, curtain walls, the engine half: a door in a curtain wall the plan cuts is drawn on the plan though it stands above the cut,
 * whether it fills an opening in the curtain wall (#75, in #48) or is an aggregated part of it (#85, in #57, a body-less container
 * whose plate #58 spans it). `__fixtures__/host-curtain-wall.ifc` has the walls 3 m high; `host-curtain-wall-above.ifc` lifts them to
 * 1.5 to 3 m, wholly above the 1.2 m cut. The app's twin is `apps/viewer/src/project/opening-curtain-hosts-parity.test.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PlanProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { openModel, sectionConfigFor } from './headless.js';
import { openingHostsOf } from './opening-hosts.js';
import { planOpeningSymbols } from './plan-openings.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';

const fixture = (name: string) => fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
const CURTAIN_A = 48, CURTAIN_B = 57, OPENING_DOOR = 75, PART_DOOR = 85;

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the curtain wall host test: ${missing}`);

async function plan(name: string) {
  const model = await openModel(new Uint8Array(readFileSync(fixture(name))));
  const set = generateDefaultSet(model, { now: 0 });
  if (!set || !model.extent) throw new Error('no set: the model has no extent');
  const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
  const plane = sectionConfigFor(view, set.levels, model.extent)!.plane;
  const symbols = planOpeningSymbols(model.buildingMeshes, plane, { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } }, undefined, view.level);
  return { model, symbols };
}

describe.skipIf(missing !== null)('a door in a curtain wall the plan cuts is on the plan (#586)', () => {
  it('reads both hosts: the opening\'s curtain wall, and the curtain wall that aggregates the door', async () => {
    const { model } = await plan('host-curtain-wall.ifc');
    expect([...openingHostsOf(model.dataStore)].sort()).toEqual([[OPENING_DOOR, CURTAIN_A], [PART_DOOR, CURTAIN_B]]);
  }, 120_000);

  it('draws both doors above the cut, with shapes, when the curtain walls span it', async () => {
    const { symbols } = await plan('host-curtain-wall.ifc');
    expect(symbols.map((s) => s.id).sort()).toEqual([OPENING_DOOR, PART_DOOR]);
    for (const s of symbols) { expect(s.kind).toBe('door'); expect(s.shapes.length).toBeGreaterThan(0); }
  }, 120_000);

  it('draws neither when the curtain walls are wholly above the cut too', async () => {
    const { model, symbols } = await plan('host-curtain-wall-above.ifc');
    expect([...openingHostsOf(model.dataStore)].map(([door]) => door).sort()).toEqual([OPENING_DOOR, PART_DOOR]);
    expect(symbols).toEqual([]);
  }, 120_000);
});
