/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cut bands of a section or plan are filled and hatched by their material the same on the app's sheet and in the engine's
 * headless sheets (#645). `duplex.ifc` (fetched to `tests/models/ara3d/` by `pnpm fixtures`) has walls and slabs of several layers. It is
 * loaded into the app's stores (`viewMaterials` names a band's material through the loaded model) and opened by the engine
 * (`sheetGraphics`, which names it through `headlessMaterialSource`); both read the generated set's drawings with the same materials
 * table. The rows are the plans and sections of the set, for two tables. Each row compares what the app's `viewMaterials` makes of the
 * view with what the engine's `materialDrawing` makes (bands filled, bands hidden, lines dropped, hatches, membranes), then checks the
 * engine's sheet carries them: the band fills among the FILL pens and the hatch strokes on the HATCH pen. A row with nothing to compare
 * would pass for any code, so the table asserts that the model has bands, fills and hatches to compare.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from '@bimvoice/ifcsheet';
import { headlessMaterialSource } from '@bimvoice/ifcsheet/material-colour';
import { materialDrawing, materialFaces, materialResolver, type MaterialDrawing } from '@bimvoice/ifcsheet/material-drawing';
import { IFC_FILL, type ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { resetProject, useProjectStore } from './project-store';
import { viewMaterials } from './material-resolver';
import type { ProjectView } from './types';

const DUPLEX = fileURLToPath(new URL('../../../../tests/models/ara3d/duplex.ifc', import.meta.url));

/** What a side makes of one view, as numbers that must agree. */
const summary = (m: MaterialDrawing | null, drawing: Drawing2D) => ({
  filled: m ? [...m.fills.values()].filter((f) => f !== undefined).length : 0,
  fills: m ? [...m.fills.values()].map((f) => f ?? 'none').sort() : [],
  hidden: m?.hidePolygons.size ?? 0,
  dropped: m?.dropLines.size ?? 0,
  hatches: m ? m.hatches.map((h) => `${h.pattern}:${h.scale}:${h.pen}:${h.loops.length}`).sort() : [],
  membranes: m?.membranes.length ?? 0,
  polygons: drawing.cutPolygons.length,
});

describe('the cut bands of duplex take their material the same in the app and the engine', { skip: planModelMissing(DUPLEX) || (existsSync(DUPLEX) ? false : 'duplex.ifc not found: run `pnpm fixtures`') }, () => {
  let engine: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  before(async () => {
    await loadPlanModel(DUPLEX);
    engine = await openModel(new Uint8Array(readFileSync(DUPLEX)));
    set = generateDefaultSet(engine)!;
    assert.ok(set && engine.extent, 'the engine lays out a set');
    // The set's 1:100 sheets draw a wall by its outline (coarse detail, `atDetailLevel`), which has no layers to fill: draw them as built.
    for (const view of set.document.views) view.graphics = { ...view.graphics, detailLevel: 'fine' };
    drawings = await generateViewDrawings(set.document.views, engine.buildingMeshes, set.levels, engine.extent!);
  });
  beforeEach(() => resetProject());

  const hung = (): Set<string> => new Set(set.document.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const cutViews = (): ProjectView[] => set.document.views.filter((v) => (v.kind === 'plan' || v.kind === 'section') && hung().has(v.id) && drawings.get(v.id)?.cutPolygons.length);
  const tables: Record<string, ProjectMaterial[]> = {
    'no rows (the names suggest)': [],
    'colours set': [{ id: 'a', name: 'Concrete', fill: IFC_FILL, hatch: 'CONCRETE' }, { id: 'b', name: 'Masonry - Brick', fill: '#aa4433' }, { id: 'c', name: 'Insulation / Thermal Barriers - Rigid insulation', fill: '#ffe680' }, { id: 'd', name: 'Plasterboard', fill: '#d0d0d0' }],
  };

  for (const [label, table] of Object.entries(tables)) {
    it(`${label}: each plan and section is filled, hatched and cleaned alike, and the sheet carries it`, async () => {
      useProjectStore.setState({ materials: table });
      const rows = cutViews().map((view) => {
        const drawing = drawings.get(view.id)!;
        const app = viewMaterials(drawing);
        const eng = materialDrawing(drawing, materialResolver(headlessMaterialSource(engine.dataStore!), table));
        return { view: view.name, drawing, app: summary(app, drawing), eng: summary(eng, drawing), faces: materialFaces(drawing, eng) };
      });
      assert.ok(rows.length >= 3, 'plans and sections to compare');
      for (const r of rows) assert.deepEqual(r.eng, r.app, `${r.view}: the materials of the cut, engine vs app`);
      assert.ok(rows.some((r) => r.app.hatches.length > 0 && r.app.dropped > 0 && (table.length > 0 || r.app.membranes > 0)), 'some view has hatches, dropped lines (and, from the names alone, membranes) to compare (else this compares nothing)');
      if (table.length > 0) assert.ok(rows.some((r) => r.app.filled > 0), 'some view has bands the table fills');

      // The engine's sheets carry what the function made: the fills among the FILL pens, the hatch strokes on the HATCH pen.
      const sheets = await sheetGraphics(set, engine, { materials: table });
      const fills = new Set(sheets.flatMap((s) => s.pens.filter((p) => p.layer === 'FILL' && p.fill).map((p) => p.fill!.toLowerCase())));
      const wanted = new Set(rows.flatMap((r) => r.faces.cutPolygons.map((p) => p.materialFill).filter((f): f is string => typeof f === 'string').map((f) => f.toLowerCase())));
      if (table.length > 0) assert.ok(wanted.size > 0, 'the table gives some band a colour');
      for (const colour of wanted) assert.ok(fills.has(colour), `a band of ${colour} is filled on a sheet`);
      const hatchRuns = sheets.flatMap((s) => s.pens.filter((p) => p.layer === 'HATCH')).reduce((n, p) => n + p.runs.length, 0);
      assert.ok(hatchRuns > 0, 'the hatches are stroked on a sheet');
    });
  }
});
