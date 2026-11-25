/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall gap, one door symbol, when the model hosts none of the doors in it (`door-loose-pieces.ts`). On schependomlaan's ground floor
 * the lift door is nine IfcDoors named `liftdeur` (one IfcDoorStyle, no OverallWidth/OverallHeight, no aggregation, hosted in nothing),
 * and plan A-101 drew a swing for each of the eight the cut passes through: two large, four small and two tilted (the jamb posts, whose
 * near-square footprint gives the leaf no direction). #890 left them as they were because nothing hosted told the door from its pieces.
 *
 * `__fixtures__/door-loose-pieces.ifc` (all doors hosted in no wall): gap 1, a lift door as six `liftdeur` IfcDoors (a 1.54 m leaf set,
 * two 0.5 m panels, two 0.25 m jamb posts, a 0.15 m profile); gap 2, a double door as two 0.8 m leaves; gap 3, Door S stating its
 * OverallWidth and Frame S round it stating none; gap 4, Door P and Lining P, which IfcRelAggregates makes a part of Door P.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { openModel, sectionConfigFor, type OpenedModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openingHostsOf } from './opening-hosts.js';
import type { OpeningRect, OpeningSymbol } from './opening-symbols.js';
import { planOpeningSymbols } from './plan-openings.js';
import { doorOfGroup, footprintsTouch, type DoorStated } from './door-loose-pieces.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-loose-pieces.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the loose door pieces test: ${missing}`);

const rect = (cx: number, width: number, depth = 0.1, cy = 0): OpeningRect => ({ c: { x: cx, y: cy }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width, depth });

describe('doorOfGroup reads the door from what the model states before the geometry', () => {
  const reads = new Map<number, OpeningRect>([[1, rect(0.5, 1.0)], [2, rect(0.5, 1.1, 0.2)], [3, rect(0.25, 0.5, 0.04)]]);
  const readOf = (id: number) => reads.get(id) ?? null;
  const tall = () => 2.1;
  const none = (): DoorStated => ({ statesSize: false });
  it('a part (IfcRelAggregates) names its whole, though the part is wider', () => {
    expect(doorOfGroup([1, 2], readOf, tall, (id) => (id === 2 ? { partOf: 1, statesSize: false } : none()))).toEqual({ door: 1, rule: 'part' });
  });
  it('the only one stating its size is the door, though another is wider', () => {
    expect(doorOfGroup([1, 2], readOf, tall, (id) => ({ statesSize: id === 1 }))).toEqual({ door: 1, rule: 'size' });
  });
  it('else the one a person passes through that spans the group; a panel or a post is not', () => {
    expect(doorOfGroup([1, 2, 3], readOf, tall, none)).toEqual({ door: 2, rule: 'span' });
    expect(doorOfGroup([1, 2], readOf, () => 1.2, none), 'too low to pass through').toBeNull();
  });
  it('two leaves side by side leave it open: each spans half', () => {
    const leaves = new Map([[1, rect(0.4, 0.8)], [2, rect(1.2, 0.8)]]);
    expect(footprintsTouch(leaves.get(1)!, leaves.get(2)!)).toBe(true);
    expect(doorOfGroup([1, 2], (id) => leaves.get(id) ?? null, tall, none)).toBeNull();
  });
});

describe.skipIf(missing !== null)('doors hosted in nothing that share a gap draw one symbol: the door, not its pieces', () => {
  let model: OpenedModel;
  let symbols: OpeningSymbol[];
  const names = () => symbols.filter((s) => s.kind === 'door').map((s) => model.dataStore.entities.getName(s.id)).sort();

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
    const plane = sectionConfigFor(view, set.levels, model.extent)!.plane;
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    symbols = planOpeningSymbols(model.buildingMeshes, plane, { live: { dataStore: model.dataStore, view: null }, project }, undefined, view.level);
  }, 120_000);

  it('hosts none of the doors (the premise)', () => {
    expect(openingHostsOf(model.dataStore).size).toBe(0);
  });

  it('draws the lift door once, from its 1.54 m leaf set, and none of its panels, posts or profile', () => {
    const lift = symbols.filter((s) => model.dataStore.entities.getName(s.id) === 'liftdeur');
    expect(lift, 'one symbol for the six liftdeur pieces').toHaveLength(1);
    const arcs = lift[0].shapes.filter((s) => s.type === 'arc');
    // Its type states OperationType NOTDEFINED, so it is drawn as an unstated door is: a 1.54 m opening as two 0.77 m leaves.
    expect(arcs.map((a) => (a.type === 'arc' ? +a.r.toFixed(3) : 0))).toEqual([0.77, 0.77]);
  });

  it('keeps both leaves of the double door, the door that states its size, and the whole a lining is part of', () => {
    expect(names()).toEqual(['Door P', 'Door S', 'Leaf 1', 'Leaf 2', 'liftdeur']);
  });
});
