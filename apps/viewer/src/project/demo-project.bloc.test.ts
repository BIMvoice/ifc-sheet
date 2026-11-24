/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #850: the demo project opens with its cut walls and slabs hatched by their materials, with nothing for the user to
 * set. Its walls and floor slabs are made of a material each (`tools/bloc-p4/derive-materials.mjs`), and the project
 * starts with a row for each of those materials (`demo-project.ts`; that `useProjectSync` puts them there is
 * `demo-project.sync.test.tsx`). Before, the walls and slabs had no material, so neither those rows nor a hatch the
 * user set for a material changed a drawing.
 *
 * The committed demo IFC, its starting set, and its plans and sections drawn as their sheets draw them: at the detail
 * level of their scale (coarse at 1:100), named by material through the engine's `materialResolver`, which the app's
 * sheets call too.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, generateDefaultSet, resolveDetailLevel, storeyFloorsOf, type DefaultSet } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { headlessMaterialSource } from '@bimvoice/ifcsheet/material-colour';
import { materialDrawing, materialResolver } from '@bimvoice/ifcsheet/material-drawing';
import { DEMO_MODEL } from '@/components/viewer/ifcsheet/demo-model';
import { DEMO_MATERIALS } from './demo-project';

const BLOC = fileURLToPath(new URL(`../../public${DEMO_MODEL.path}`, import.meta.url));
const WASM = fileURLToPath(new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) ? null : 'needs the wasm runtime (pnpm build:wasm:fetch)';
const table = [...DEMO_MATERIALS];

describe('the demo project hatches its cut walls and slabs by material (#850)', { skip: missing ?? false }, () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  before(async () => {
    model = await openModel(new Uint8Array(readFileSync(BLOC)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made || !model.extent) throw new Error('bloc-p4 gave no set');
    // The two sheets looked at, and the views on them: drawing the whole set twice is minutes on a slow machine.
    const sheets = made.document.sheets.filter((s) => s.number === 'A-101' || s.number === 'A-301');
    set = { ...made, document: { ...made.document, sheets } };
    const hung = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
    drawings = await generateViewDrawings(set.document.views.filter((v) => hung.has(v.id)), model.buildingMeshes, set.levels, model.extent, (_v, e) => { throw e; }, () => {}, storeyFloorsOf(model.buildingMeshes, model.dataStore.spatialHierarchy));
  });

  /** The hatch patterns of a view's cut by IFC type, drawn at the detail level of the sheet it is on. */
  const hatchesOf = (name: string): Map<string, Set<string>> => {
    const view = set.document.views.find((v) => v.name.startsWith(name));
    const made = view && drawings.get(view.id);
    if (!view || !made) throw new Error(`${name}: not drawn (${set.document.views.map((v) => v.name).join(', ')})`);
    const scale = set.document.sheets.flatMap((s) => s.viewports ?? []).find((vp) => vp.viewId === view.id)?.scale;
    const drawing = atDetailLevel(made, resolveDetailLevel(undefined, scale));
    const typeOf = new Map(drawing.cutPolygons.map((p) => [p.polygon.outer, p.ifcType ?? '']));
    const out = new Map<string, Set<string>>();
    for (const h of materialDrawing(drawing, materialResolver(headlessMaterialSource(model.dataStore), table)).hatches) {
      const type = typeOf.get(h.loops[0]) ?? '';
      out.set(type, (out.get(type) ?? new Set()).add(`${h.pattern}${h.scale === 1 ? '' : ` x${h.scale}`}`));
    }
    return out;
  };

  it('a plan: its cut walls are hatched as concrete, brick and block', () => {
    assert.deepEqual([...(hatchesOf('Parter').get('IfcWall') ?? [])].sort(), ['BRICKCUT', 'BRICKCUT x2', 'CONCRETE']);
  });

  it('a section: its walls and its floor slabs are hatched, the slabs as concrete', () => {
    const byType = hatchesOf('Section A-A');
    assert.ok((byType.get('IfcWall')?.size ?? 0) >= 1, 'the walls the section cuts are hatched');
    assert.deepEqual([...(byType.get('IfcSlab') ?? [])], ['CONCRETE']);
  });

  it('the sheets of the plans and the sections print the hatch lines', async () => {
    const sheets = await sheetGraphics(set, model, { materials: table });
    const lines = (number: string) => (sheets.find((s) => s.number === number)?.pens ?? []).filter((p) => p.layer === 'HATCH').reduce((n, p) => n + p.runs.length, 0);
    // About a thousand each (1067 and 1273 when written); none before the walls and slabs had materials.
    assert.deepEqual({ plans: lines('A-101') > 500, sections: lines('A-301') > 500 }, { plans: true, sections: true });
  });
});
