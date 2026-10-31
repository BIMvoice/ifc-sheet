/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #634, the Wall against the engine: a starter set draws all the views of one kind at one scale (the most detailed at
 * which every one of them fits), so a building's elevations no longer print at two scales. Each model goes through the
 * app's own start (`startDrawingSet`) and through the engine's `generateDefaultSet`; the rows are paper and scale per
 * sheet, equal on both sides, one scale per kind, and every drawing inside its sheet's frame at that scale. A saved set
 * is not laid out again.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDefaultSet, type DefaultSet, type ModelExtent } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { drawingArea, overrun, sheetGroup, viewExtent } from './drawing-set';
import { ensureDrawingSet, startDrawingSet } from './drawing-set-actions';
import { modelLevels } from './model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { fitViewportBox } from './sheets';
import type { ProjectSheet, ProjectView } from './types';

const model = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
/** Row: the model, the kinds of sheet it must make, and the scale each kind is drawn at (pinned so a drift in the choice shows). */
const MODELS: { name: string; path: string; kinds: Record<string, number> }[] = [
  { name: 'FZK-Haus', path: FZK_HAUS, kinds: { plans: 100, elevations: 100, sections: 100 } },
  { name: 'IfcOpenHouse', path: model('../../../../tests/models/ara3d/IfcOpenHouse_IFC4.ifc'), kinds: { plans: 50, elevations: 100, sections: 50 } },
  { name: 'bloc-p4 (a multi-storey block)', path: model('../../public/samples/bloc-p4.ifc'), kinds: { plans: 100, elevations: 100, sections: 100 } },
];

/** What is compared per sheet: its number, kind, paper and the scales of its drawings. */
const rowsOf = (sheets: readonly ProjectSheet[]) => sheets.map((s) => [s.number, sheetGroup(s), s.paper, (s.viewports ?? []).map((vp) => vp.scale)]);

for (const { name, path, kinds } of MODELS) {
  describe(`the Wall and the engine give one scale per kind on ${name} (#634)`, { skip: planModelMissing(path) }, () => {
    let app: { views: ProjectView[]; sheets: ProjectSheet[]; extent: ModelExtent; meshes: Parameters<typeof ensureDrawingSet>[0] };
    let engine: DefaultSet;

    before(async () => {
      await loadPlanModel(path);
      resetProject();
      syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
      const { models, geometryResult } = useViewerStore.getState();
      const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
      const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
      assert.ok(extent, 'the app measures the building');
      assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');
      const { views, sheets } = useProjectStore.getState();
      app = { views, sheets, extent, meshes };
      const made = generateDefaultSet(await openModel(new Uint8Array(readFileSync(path))));
      assert.ok(made, 'the engine lays out a set');
      engine = made;
    });

    it('gives the same paper and scale on every sheet, on both sides', () => {
      if (process.env.DUMP_SCALES) console.log(`SCALES ${name} ${JSON.stringify(rowsOf(app.sheets))}`);
      assert.ok(app.sheets.length >= 2, 'a set with sheets to compare');
      assert.deepEqual(rowsOf(engine.document.sheets), rowsOf(app.sheets));
    });

    it('draws every view of a kind at one scale', () => {
      const scales = new Map<string, Set<number>>();
      for (const s of app.sheets) for (const vp of s.viewports ?? []) scales.set(`${sheetGroup(s)}`, (scales.get(`${sheetGroup(s)}`) ?? new Set()).add(vp.scale));
      assert.ok(scales.size > 0, 'an empty set proves nothing');
      for (const [kind, set] of scales) assert.equal(set.size, 1, `${kind} at ${[...set].join(' and ')}`);
      for (const [kind, scale] of Object.entries(kinds)) assert.deepEqual([...(scales.get(kind) ?? [])], [scale], kind);
    });

    it('keeps every drawing inside its sheet at the shared scale, measured from its box and the sheet frame', () => {
      let measured = 0;
      for (const s of app.sheets) {
        const area = drawingArea(s);
        let used = 0;
        for (const vp of s.viewports ?? []) {
          const size = viewExtent(app.views.find((v) => v.id === vp.viewId) as ProjectView, app.extent);
          const box = fitViewportBox({ min: { x: 0, y: 0 }, max: { x: size.w, y: size.h } }, vp.scale);
          assert.equal(overrun(box, s), null, `${s.number}: a ${box.width.toFixed(0)} x ${box.height.toFixed(0)} mm drawing in a ${area.w.toFixed(0)} x ${area.h.toFixed(0)} mm frame`);
          measured += 1;
          used += box.width;
        }
        // The estimate ignores the gaps between drawings; side by side they still fit the frame's width.
        if (area.w >= area.h) assert.ok(used <= area.w, `${s.number}: the drawings side by side take ${used.toFixed(0)} of ${area.w.toFixed(0)} mm`);
      }
      assert.ok(measured > 0);
    });

    it('does not lay out a saved set again: its scales stay as they were saved', () => {
      const saved = app.sheets.map((s, i) => ({ ...s, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, scale: i % 2 === 0 ? 200 : 25 })) }));
      useProjectStore.setState({ sheets: saved });
      assert.equal(startDrawingSet(app.meshes, app.extent), false);
      ensureDrawingSet(app.meshes, app.extent);
      assert.deepEqual(rowsOf(useProjectStore.getState().sheets).map((r) => r[3]), saved.map((s) => (s.viewports ?? []).map((vp) => vp.scale)));
    });
  });
}
