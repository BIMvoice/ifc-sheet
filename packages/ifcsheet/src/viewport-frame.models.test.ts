/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * On every sheet of the starting set, each drawing lies inside the frame of its viewport: the box `fitViewportBox`
 * gives an auto-fit viewport about its `center`, which the app's sheet clips the drawing to, the drawing placed as
 * the sheet places it (`placer`: `center`, else the middle of its bounds). Before, a plan of a storey smaller than the
 * building ran past its frame: skolebygg A-102 Plan 03 by 36 mm, A-103 Plan 04 by 66 mm, schependomlaan A-103 by
 * 30 mm. A drawing that fitted keeps the box it had, and no drawing moves (the placement is not changed).
 *
 * FZK-Haus and bloc-p4 are in the repository. skolebygg (ISSUE_068) and schependomlaan come with `pnpm fixtures`
 * and are skipped without them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './index.js';
import { generateViewDrawings, openModel } from './headless.js';
import { placer } from './sheet-graphic.js';
import { fitViewportBox } from './viewport-fit.js';
import { terrainMeshesOf } from './view-drawings.js';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const WASM = here('../../wasm/pkg/ifc-lite_bg.wasm');
const MODELS: Record<string, string> = {
  'AC20-FZK-Haus': here('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc'),
  'bloc-p4': here('../../../apps/viewer/public/samples/bloc-p4.ifc'),
  skolebygg: here('../../../tests/models/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc'),
  schependomlaan: here('../../../tests/models/ara3d/schependomlaan.ifc'),
};

for (const [name, path] of Object.entries(MODELS)) {
  const missing = !existsSync(WASM) ? 'the wasm bundle is not built' : !existsSync(path) ? `${path} is absent (pnpm fixtures)` : null;
  if (missing) console.warn(`[ifcsheet] skipping the viewport frames of ${name}: ${missing}`);
  describe.skipIf(missing !== null)(`the viewport frames of ${name}`, () => {
    it('hold every drawing of the set, and a drawing that fitted keeps its box', async () => {
      const model = await openModel(new Uint8Array(readFileSync(path)));
      const set = generateDefaultSet(model, { now: Date.UTC(2026, 10, 25) });
      expect(set && model.extent, 'a set is laid out').toBeTruthy();
      if (!set || !model.extent) return;
      const terrain = terrainMeshesOf(model.meshes, model.dataStore);
      const drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent, undefined, undefined, null, terrain);
      let checked = 0;
      for (const sheet of set.document.sheets) {
        for (const vp of sheet.viewports ?? []) {
          const d = drawings.get(vp.viewId);
          if (!d || !Number.isFinite(d.bounds.min.x) || (vp.width > 0 && vp.height > 0)) continue;
          const at = placer(d, vp);
          const corners = [d.bounds.min, d.bounds.max, { x: d.bounds.min.x, y: d.bounds.max.y }, { x: d.bounds.max.x, y: d.bounds.min.y }].map(at);
          const box = fitViewportBox(d.bounds, vp.scale, vp.center);
          const past = Math.max(0, ...corners.flatMap((p) => [vp.x - box.width / 2 - p.x, p.x - vp.x - box.width / 2, vp.y - box.height / 2 - p.y, p.y - vp.y - box.height / 2]));
          expect(past, `${sheet.number} ${vp.viewId}: paper mm of the drawing past its frame`).toBeLessThan(1e-6);
          // Centred on its bounds within the margin, it fitted before: its box is the one it had.
          const k = 1000 / vp.scale;
          const off = vp.center ? Math.max(Math.abs((d.bounds.min.x + d.bounds.max.x) / 2 - vp.center.x), Math.abs((d.bounds.min.y + d.bounds.max.y) / 2 - vp.center.y)) * k : 0;
          if (off <= 10) expect(box, `${sheet.number} ${vp.viewId}: the box of a drawing that fitted`).toEqual(fitViewportBox(d.bounds, vp.scale));
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(5);
    }, 600_000);
  });
}
