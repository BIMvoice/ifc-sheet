/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #499: an elevation of AC20-FZK-Haus in the coloured style shows the colours of the facade's materials, under the linework; the
 * plain style is unchanged, and the switch off takes the fills away again.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { sheetGraphics } from './set-sheets.js';
import { surfaceFills } from './surface-fills.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus coloured-surfaces test: ${missing}`);

/** The colour the model authors for a class, `#rrggbb`, read from the meshes by their own channels (not through `surfaceColourOf`). */
const authored = (model: OpenedModel, ifcType: string): string[] => [...new Set(model.buildingMeshes.filter((m) => m.ifcType === ifcType && m.color[3] >= 0.999)
  .map((m) => `#${[0, 1, 2].map((i) => Math.round(m.color[i] * 255).toString(16).padStart(2, '0')).join('')}`))];

describe.skipIf(missing !== null)('the coloured elevations of AC20-FZK-Haus (#499)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 27) })!;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!);
  }, 300_000);

  const south = () => set.document.views.find((v) => v.kind === 'elevation' && v.direction === 'south')!;
  const coloured = (on: boolean): DefaultSet => ({ ...set, document: { ...set.document, views: set.document.views.map((v) => (v.id === south().id ? { ...v, graphics: { ...v.graphics, colouredSurfaces: on } } : v)) } });

  it('the south elevation shows the colours of the facade materials', () => {
    const fills = surfaceFills(model.buildingMeshes, drawings.get(south().id)!.config);
    expect(fills.length).toBeGreaterThan(0);
    const shown = new Set(fills.map((f) => f.surfaceColour));
    const wall = authored(model, 'IfcWallStandardCase');
    expect(wall).toHaveLength(1);
    expect(shown.has(wall[0])).toBe(true);
    // The windows' frames and the roof beams are on the facade too.
    expect(authored(model, 'IfcWindow').length).toBeGreaterThan(0);
    for (const colour of authored(model, 'IfcWindow')) expect(shown.has(colour), colour).toBe(true);
  });

  it('the sheet carries the fills in the coloured style, and none in the plain style or with the switch off', async () => {
    const wall = authored(model, 'IfcWallStandardCase')[0];
    const on = await sheetGraphics(coloured(true), model);
    const sheetOf = (sheets: typeof on) => sheets.find((s) => s.viewports.some((v) => v.viewId === south().id))!;
    expect(sheetOf(on).fills.some((f) => f.colour === wall)).toBe(true);
    const off = await sheetGraphics(coloured(false), model);
    expect(sheetOf(off).fills).toHaveLength(0);
    const plain = await sheetGraphics(set, model);
    expect(sheetOf(plain).fills).toHaveLength(0);
    expect(sheetOf(plain).lines).toEqual(sheetOf(on).lines);
    expect(sheetOf(plain).pens).toEqual(sheetOf(on).pens);
  });
});
