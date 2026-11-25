/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall gap, one door symbol (`door-pieces.ts`). On schependomlaan a door (`merk F-R`, filling the wall's opening) has its sub-frame
 * and lining as IfcDoors of their own (`stelkozijn`, filling none) in the same gap, and the plan drew a leaf and a swing for each: 24 of
 * its 160 door symbols were such pieces (the measurement is in the pull request that added this test).
 *
 * `__fixtures__/door-pieces.ifc`: a 0.2 m wall with Door A (1.0 m, filling opening 1, x 1..2) and its 'stelkozijn' piece (two 40 mm
 * posts at x 0.96 and 2.04, filling nothing, crossing the 1.2 m cut); a double door as two 0.8 m leaves in opening 2 (x 4..5.6), L1
 * filling it and L2 filling nothing; and a narrow 0.6 m door filling nothing in opening 3 (x 6.5..7.1).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { openModel, sectionConfigFor, type OpenedModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openingHostsOf } from './opening-hosts.js';
import { openingSymbols, type OpeningSymbol } from './opening-symbols.js';
import { planOpeningSymbols } from './plan-openings.js';
import { inSameGap } from './door-pieces.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-pieces.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the door pieces test: ${missing}`);

const rect = (cx: number, width: number, depth = 0.1, cy = 0) => ({ c: { x: cx, y: cy }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width, depth });

describe('inSameGap', () => {
  it('takes a frame round a door, and a narrower piece inside it, as one gap', () => {
    expect(inSameGap(rect(1.5, 1.08, 0.2), rect(1.5, 1))).toBe(true);
    expect(inSameGap(rect(1.3, 0.5, 0.05), rect(1.5, 1))).toBe(true);
  });
  it('keeps two leaves side by side, a door across a corridor and a door at right angles apart', () => {
    expect(inSameGap(rect(5.2, 0.8), rect(4.4, 0.8))).toBe(false);
    expect(inSameGap(rect(1.5, 1, 0.1, 1.5), rect(1.5, 1))).toBe(false);
    expect(inSameGap({ ...rect(1.5, 1), u: { x: 0, y: 1 }, n: { x: -1, y: 0 } }, rect(1.5, 1))).toBe(false);
  });
});

describe.skipIf(missing !== null)('a door\'s pieces, IfcDoors of their own in its gap, draw no symbol of their own', () => {
  let model: OpenedModel;
  let plane: NonNullable<ReturnType<typeof sectionConfigFor>>['plane'];
  let symbols: OpeningSymbol[];
  const nameOf = (s: OpeningSymbol) => model.dataStore.entities.getName(s.id);

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
    plane = sectionConfigFor(view, set.levels, model.extent)!.plane;
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    symbols = planOpeningSymbols(model.buildingMeshes, plane, { live: { dataStore: model.dataStore, view: null }, project }, undefined, view.level);
  }, 120_000);

  it('the premise: the piece hosts in nothing, crosses the cut, and draws a door symbol when hosting is not read', () => {
    const hosted = new Set([...openingHostsOf(model.dataStore).keys()].map((id) => model.dataStore.entities.getName(id)));
    expect([...hosted].sort()).toEqual(['Door A', 'Leaf L1']);
    const geometryOnly = openingSymbols(model.buildingMeshes.filter((m) => /^IFCDOOR/i.test(m.ifcType ?? '')), plane);
    expect(geometryOnly.map(nameOf)).toContain('stelkozijn');
  });

  it('draws Door A once, and not its piece', () => {
    expect(symbols.map(nameOf).sort()).toEqual(['Door A', 'Leaf L1', 'Leaf L2', 'Narrow door']);
  });

  it('draws Door A in its opening: hinged at the x = 1 jamb, its swing 1.0 m', () => {
    const [door] = symbols.filter((s) => nameOf(s) === 'Door A');
    const leaf = door.heavy?.find((s) => s.type === 'polyline');
    const arc = door.shapes.find((s) => s.type === 'arc');
    if (leaf?.type !== 'polyline' || arc?.type !== 'arc') throw new Error('Door A has no leaf or no swing');
    expect(leaf.pts[0].x, 'SINGLE_SWING_LEFT: hinged on local -X, the x = 1 jamb').toBeCloseTo(1, 3);
    expect(arc.r, 'the swing as wide as the opening, not the piece\'s 1.08 m').toBeCloseTo(1, 3);
  });
});
