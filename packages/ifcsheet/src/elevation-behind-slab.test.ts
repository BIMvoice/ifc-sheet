/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557, the south elevation of a Bonsai house (`__fixtures__/bonsai-house-2-storey.ifc`: two storeys of 2.7 m walls, 0.3 m
 * thick in three layers, on 0.2 m slabs that stand 0.15 m proud of the walls). The slab's front face (view depth 0.5) lies in
 * front of the foot of each wall (0.65), so nothing of a wall shows below the slab's top at z = 0.2. The classifier took ten
 * samples along each edge and put the end of a hidden stretch halfway between the two samples that disagreed, 0.135 m off on
 * a 2.7 m edge: the wall's corner edges and the door's frame were drawn 0.065 m and 0.1 m down over the slab, and the inner
 * layers' edges stood as ticks at the wall's head.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/bonsai-house-2-storey.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the elevation-behind-slab test: ${missing}`);

/** Slab top of the ground floor, metres, and the slack of one raster pixel (a tenth of a millimetre at 1:100 is nothing). */
const SLAB_TOP = 0.2;

describe.skipIf(missing !== null)('an elevation shows nothing of a wall below the top of the slab in front of it (#557)', () => {
  let south: Drawing2D;

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v) => v.kind === 'elevation' && v.name === 'South Elevation');
    if (!view) throw new Error('no south elevation in the set');
    south = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
  }, 120_000);

  it('the premise: the wall edges and the slab are in the drawing', () => {
    expect(south.lines.some((l) => l.ifcType === 'IfcWall' && l.visibility === 'visible')).toBe(true);
    expect(south.lines.some((l) => l.ifcType === 'IfcSlab' && l.visibility === 'visible')).toBe(true);
  });

  it('no visible edge of a wall or the door starts partway down the slab', () => {
    const inSlab = south.lines
      .filter((l) => l.visibility === 'visible' && (l.ifcType === 'IfcWall' || l.ifcType === 'IfcDoor'))
      .filter((l) => Math.abs(l.line.start.x - l.line.end.x) < 1e-6)
      .map((l) => Math.min(l.line.start.y, l.line.end.y))
      .filter((y) => y > 0.02 && y < SLAB_TOP - 0.03);
    expect(inSlab).toEqual([]);
  });

  it('the layers of a wall behind its face leave no tick at its head, only a sliver of a few millimetres (0.03 mm on paper)', () => {
    const length = (l: Drawing2D['lines'][number]) => Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y);
    const ticks = south.lines.filter((l) => l.visibility === 'visible' && l.ifcType === 'IfcWall' && l.depth > 0.7 && length(l) > 0.02 && length(l) < 0.2);
    expect(ticks.length, JSON.stringify(ticks.map((l) => l.line))).toBe(0);
  });
});
