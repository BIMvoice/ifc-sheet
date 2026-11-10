/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A wall the model contains in its IfcSite but that stands inside the building is drawn with it (#557): Rhino's ASIFC export of
 * ISSUE_034_HouseZ holds 42 of its walls in the site, and its ground plan showed only a few wall stubs. A hand-written model: an
 * L of two 3 m walls (6 m and 5 m) in the storey, an inner wall inside that L contained in the site, standing from 0.5 m under
 * the floor as HouseZ's lower walls do, and a 1.2 m garden wall 16 m east of the house, also in the site.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import type { PlanProjectView } from './document.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { siteElementsInBuilding } from './site-in-building.js';
import { levelsFromStoreys } from './view-defaults.js';

const IFC = readFileSync(new URL('../test-support/walls-in-site.ifc', import.meta.url));

const SOUTH = 47;
const WEST = 57;
const INNER = 67;
const GARDEN = 77;

describe('siteElementsInBuilding', () => {
  /** A box mesh of element `expressId` spanning x0..x1 and z0..z1 in plan, y0..y1 in height. */
  const mesh = (expressId: number, [x0, x1]: [number, number], [z0, z1]: [number, number], [y0, y1]: [number, number] = [0, 3]) => ({
    expressId, positions: new Float32Array([x0, y0, z0, x1, y1, z1, x0, y1, z0]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), color: [1, 1, 1, 1] as [number, number, number, number],
  });
  // 1 and 2 are the storey's walls, a 10 x 8 m footprint. The site holds 10 (inside, from 1 m under the floor), 11 (beside the house),
  // 12 (a terrain under it), 13 (a space) and 14, which a storey also holds.
  const types = new Map<number, IfcTypeEnum>([[1, IfcTypeEnum.IfcWall], [2, IfcTypeEnum.IfcWall], [10, IfcTypeEnum.IfcWall], [11, IfcTypeEnum.IfcWall], [12, IfcTypeEnum.IfcGeographicElement], [13, IfcTypeEnum.IfcSpace], [14, IfcTypeEnum.IfcWall]]);
  const typeOf = (id: number) => types.get(id)!;
  const hierarchy = { bySite: new Map([[100, [10, 11, 12, 13, 14]]]), byBuilding: new Map<number, number[]>(), elementToStorey: new Map([[1, 5], [2, 5], [14, 5]]) };
  const meshes = [mesh(1, [0, 10], [0, 0.2]), mesh(2, [0, 0.2], [0, 8]), mesh(10, [4, 4.2], [0.2, 8], [-1, 3]), mesh(11, [14, 18], [2, 2.2]), mesh(12, [-5, 15], [-5, 13], [-2, -1]), mesh(13, [1, 2], [1, 2]), mesh(14, [1, 2], [1, 2])];

  it('takes a site element on the footprint at any height, not one beside it, a terrain, a space or one a storey holds', () => {
    expect(siteElementsInBuilding(hierarchy, [1, 2], { meshes }, typeOf)).toEqual([10]);
  });

  it('reads the meshes of a federated model by its id offset', () => {
    const shifted = meshes.map((m) => ({ ...m, expressId: m.expressId + 1000 }));
    expect(siteElementsInBuilding(hierarchy, [1, 2], { meshes: shifted, idOffset: 1000 }, typeOf)).toEqual([10]);
  });

  it('takes nothing without geometry', () => {
    expect(siteElementsInBuilding(hierarchy, [1, 2], { meshes: null }, typeOf)).toEqual([]);
  });
});

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the walls-in-site test: ${missing}`);

describe.skipIf(missing !== null)('a wall the model contains in its site but inside the building is drawn (#557)', () => {
  let model: OpenedModel;
  beforeAll(async () => { model = await openModel(new Uint8Array(IFC)); }, 120_000);

  it('the inner wall is a mesh of the building, the garden wall is not', () => {
    const drawn = new Set(model.buildingMeshes.map((m) => m.expressId));
    expect([SOUTH, WEST, INNER].every((id) => drawn.has(id))).toBe(true);
    expect(drawn.has(GARDEN)).toBe(false);
  });

  it('the frame is the storey\'s L, 6 m by 5 m, not stretched to the garden wall 16 m away, and reaches down to the inner wall', () => {
    const e = model.extent!;
    expect(e.max.x - e.min.x).toBeCloseTo(6, 1);
    expect(Math.abs(e.max.z - e.min.z)).toBeCloseTo(5, 1);
    expect(e.min.y).toBeCloseTo(-0.5, 2);
  });

  it('the ground plan cuts the inner wall', async () => {
    const levels = levelsFromStoreys(model.storeys);
    const plan: PlanProjectView = { id: 'p', kind: 'plan', name: 'Ground Floor', createdAt: 0, level: levels[0], cutHeight: 1.2, viewDepth: 0 };
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, levels, model.extent!)).get('p')!;
    const cut = new Set(drawing.cutPolygons.map((p) => p.entityId));
    expect(cut.has(INNER)).toBe(true);
    expect(cut.has(SOUTH)).toBe(true);
  });
});
