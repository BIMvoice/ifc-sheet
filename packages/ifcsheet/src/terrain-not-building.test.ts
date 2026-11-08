/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A terrain the model contains in a storey is not the building (#683): Bonsai puts its 20 x 20 m ground box in the
 * storey, and it set the extent, was cut in every section as a block and was drawn in every elevation. A hand-written
 * model: a 4 m wall, and a terrain box 20 x 20 x 3 m with its top 200 mm under the storey, and a VEGETATION tree (also an IfcGeographicElement) at x = 6 m, all contained in the storey.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import { openModel, type OpenedModel } from './headless.js';
import { storeyElementIds } from './storey-elements.js';

const IFC = readFileSync(new URL('../test-support/terrain-in-storey.ifc', import.meta.url));

const WALL = 48;
const TERRAIN = 59;
const TREE = 67;

describe('storeyElementIds leaves a terrain out of the building (#683)', () => {
  const types = new Map<number, IfcTypeEnum>([[10, IfcTypeEnum.IfcWall], [11, IfcTypeEnum.IfcGeographicElement], [12, IfcTypeEnum.IfcGeographicElement]]);
  // The terrain (11) is contained in the storey, a tree (12) hangs under the wall through an aggregate.
  const hierarchy = { byStorey: new Map([[1, [10, 11]]]), elementToStorey: new Map([[10, 1], [11, 1], [12, 1]]) };

  it('takes the wall and neither geographic element when none states a PredefinedType', () => {
    expect(storeyElementIds(hierarchy, [1], (id) => types.get(id)!)).toEqual([10]);
  });

  it('keeps a VEGETATION, a SOIL_BORING_POINT and a USERDEFINED geographic element, drops TERRAIN and NOTDEFINED', () => {
    const predefined = new Map([[11, 'TERRAIN'], [12, 'VEGETATION'], [13, 'SOIL_BORING_POINT'], [14, 'USERDEFINED'], [15, 'NOTDEFINED']]);
    for (const id of [13, 14, 15]) types.set(id, IfcTypeEnum.IfcGeographicElement);
    const h = { byStorey: new Map([[1, [10, 11, 12, 13, 14, 15]]]), elementToStorey: new Map([[10, 1]]) };
    expect(storeyElementIds(h, [1], (id) => types.get(id)!, (id) => predefined.get(id) ?? null)).toEqual([10, 12, 13, 14]);
  });
});

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the terrain test: ${missing}`);

describe.skipIf(missing !== null)('a terrain contained in a storey does not frame or cut the building (#683)', () => {
  let model: OpenedModel;
  beforeAll(async () => { model = await openModel(new Uint8Array(IFC)); }, 120_000);

  it('the terrain is a mesh of the model but not of the building', () => {
    expect((model.meshes ?? []).map((m) => m.expressId)).toContain(TERRAIN);
    expect(model.buildingMeshes.map((m) => m.expressId).sort()).toEqual([WALL, TREE]);
  });

  it('the extent holds the wall and the tree (6.25 m), not the terrain\'s 20 m', () => {
    const e = model.extent!;
    expect(e.max.x - e.min.x).toBeCloseTo(6.25, 1);
    expect(e.max.z - e.min.z).toBeLessThan(1);
  });
});
