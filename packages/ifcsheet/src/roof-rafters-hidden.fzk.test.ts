/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rafters of AC20-FZK-Haus ("Sparren-N", 42 IfcMember) lie under the roof
 * slabs and are hidden by them (Refs #557). Each rafter runs 5.5 m deep into
 * the South elevation, from the eave to the ridge; while its outline carried
 * one depth, the eave's, the slab in front never hid it, and the South and
 * North elevations and the Dachgeschoss plan showed the rafters as lines
 * through the roof. The roof slab itself stays whole.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { storeyFloorsOf } from './plan-projection.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;

const length = (lines: DrawingLine[]) => lines.reduce((n, l) => n + Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y), 0);

describe.skipIf(missing !== null)('the rafters of AC20-FZK-Haus are hidden under its roof (Refs #557)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;
  const names = new Map<number, string>();
  const nameOf = (id: number) => names.get(id) ?? '';
  const drawingOf = (view: string) => {
    const v = set.document.views.find((x) => x.name === view);
    const d = v && drawings.get(v.id);
    if (!d) throw new Error(`no drawing for ${view}`);
    return d;
  };
  const projected = (d: Drawing2D, name: RegExp, visibility: 'visible' | 'hidden') =>
    d.lines.filter((l) => l.category === 'projection' && l.visibility === visibility && name.test(nameOf(l.entityId)));

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model);
    if (!made) throw new Error('no set');
    set = made;
    for (const m of model.buildingMeshes) {
      const name = model.dataStore.getEntity?.(m.expressId)?.attributes?.[2];
      if (typeof name === 'string') names.set(m.expressId, name);
    }
    expect([...names.values()].filter((n) => /^Sparren-/.test(n)), 'the rafters').toHaveLength(42);
    const views = set.document.views.filter((v) => ['South Elevation', 'North Elevation', 'Dachgeschoss'].includes(v.name));
    expect(views, 'the three views').toHaveLength(3);
    drawings = await generateViewDrawings(views, model.buildingMeshes, set.levels, model.extent!, () => {}, () => {}, storeyFloorsOf(model.buildingMeshes, model.dataStore?.spatialHierarchy));
  }, 180_000);

  it.each(['South Elevation', 'North Elevation'])('%s: draws no rafter through the roof slab, only their tails under the eave', (view) => {
    const d = drawingOf(view);
    const visible = length(projected(d, /^Sparren-/, 'visible'));
    // 21 rafters of the near slope, each two 3.36 m verticals: 144 m of line before, nearly all behind the slab. What is
    // left (17 m) is their ends under the eave, flush with the slab's eave face.
    expect(visible, 'the rafter ends are drawn').toBeGreaterThan(5);
    expect(visible, 'visible rafter lines, metres').toBeLessThan(25);
  });

  it.each(['South Elevation', 'North Elevation'])('%s: keeps the roof slab in front whole, and no purlin shows through its verge', (view) => {
    const d = drawingOf(view);
    expect(length(projected(d, /^Dach-/, 'visible')), 'the slab outline, 2 x (13 + 3.4) m').toBeGreaterThan(32.5);
    // The purlins and the ridge beam end flush with the verge, on the far edge of the drawing: 4.4 m of stubs showed there
    // when a point on that edge read the raster's last column, which nothing fills.
    expect(length(d.lines.filter((l) => l.category === 'projection' && l.visibility === 'visible' && l.ifcType === 'IfcBeam')), 'visible beam lines, metres').toBeLessThan(0.5);
  });

  it('Dachgeschoss: draws no solid rafter line through the roof slab below the cut', () => {
    const d = drawingOf('Dachgeschoss');
    // 42 rafters, each two solid lines from the eave to the cut: 150 m before, nearly all under the slab (37 m left).
    expect(length(projected(d, /^Sparren-/, 'visible')), 'solid rafter lines, metres').toBeLessThan(60);
  });
});
