/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #218: an elevation is the outside of the building seen from in front, so
 * nothing is cut: no cut face, no cut line, no hatch. A section and a plan on
 * the same model still cut.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus elevation test: ${missing}`);

describe.skipIf(missing !== null)('the elevations and sections of AC20-FZK-Haus (#218)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!);
  }, 300_000);

  it.each(['south', 'north', 'east', 'west'] as const)('%s elevation: nothing is cut, and the facade is drawn', (direction) => {
    const view = set.document.views.find((v) => v.kind === 'elevation' && v.direction === direction)!;
    const drawing = drawings.get(view.id)!;
    expect(drawing.cutPolygons).toHaveLength(0);
    expect(drawing.lines.filter((l) => l.category === 'cut')).toHaveLength(0);
    expect(drawing.stats.cutLineCount).toBe(0);
    // The outline is the building's facade: its width and height are the extent's on that side.
    const e = model.extent!;
    const width = direction === 'south' || direction === 'north' ? e.max.x - e.min.x : e.max.z - e.min.z;
    const height = e.max.y - e.min.y;
    const w = drawing.bounds.max.x - drawing.bounds.min.x;
    const h = drawing.bounds.max.y - drawing.bounds.min.y;
    expect(w).toBeLessThanOrEqual(width + 0.1);
    expect(w).toBeGreaterThan(width * 0.9);
    expect(h).toBeLessThanOrEqual(height + 0.1);
    expect(h).toBeGreaterThan(height * 0.9);
  });

  it('sections still cut, and plans still cut', () => {
    for (const kind of ['section', 'plan'] as const) {
      const views = set.document.views.filter((v) => v.kind === kind);
      expect(views.length).toBeGreaterThan(0);
      for (const view of views) expect(drawings.get(view.id)!.cutPolygons.length, view.name).toBeGreaterThan(0);
    }
  });
});
