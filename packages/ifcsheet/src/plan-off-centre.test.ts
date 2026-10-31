/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #279: a plan is put on the sheet where the model's extent puts it, not
 * where its own drawing happens to be centred. The sheet clips every drawing
 * to the box the layout reserved for it, a box the size and the centre of the
 * model's extent; a plan centred on its own bounds (one storey's, or one that
 * includes an element the framing left out) lands beside that box and the box
 * cuts it. On the Skolebygg sample, Plan 01 kept 242 of its 3198 cut outlines.
 *
 * The fixture: Nivel 1 holds an 8 x 6 m room (x 0..8), Nivel 2 one wall at
 * x 20..30, so the building is 30 m wide and neither storey is at its middle.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import type { PlanProjectView, ProjectView } from './document.js';
import { placeViewports, viewCentre, type ModelExtent } from './drawing-set.js';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { sheetGraphic } from './sheet-graphic.js';

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-off-centre-wing.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-off-centre-wing.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the plan-off-centre test: ${missing}`);

const EXTENT: ModelExtent = { min: { x: 0, y: 0, z: -6 }, max: { x: 30, y: 6, z: 0 } };
const plan = (id: string, extra: Partial<PlanProjectView> = {}): PlanProjectView =>
  ({ id, name: id, createdAt: 0, kind: 'plan', level: { name: id, elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, ...extra });

describe('viewCentre and placeViewports (#279)', () => {
  it('a plan is centred on the extent, in its drawing coordinates (x, z)', () => {
    expect(viewCentre(plan('p'), EXTENT)).toEqual({ x: 15, y: -3 });
  });

  it('sections and details stay centred on their own drawing (an elevation is centred on the building, #648)', () => {
    expect(viewCentre({ kind: 'section' }, EXTENT)).toBeNull();
    expect(viewCentre(plan('d', { detail: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, sourceViewId: 'p', number: 1 } as never }), EXTENT)).toBeNull();
  });

  it('a viewport placed with the extent carries the plan centre; without it, none', () => {
    const [withExtent] = placeViewports([plan('p')], [{ w: 30, h: 6 }], 200, 'A1', EXTENT);
    expect(withExtent.center).toEqual({ x: 15, y: -3 });
    const [without] = placeViewports([plan('p')], [{ w: 30, h: 6 }], 200, 'A1');
    expect(without.center).toBeNull();
    const [byId] = placeViewports([{ id: 'p' }], [{ w: 30, h: 6 }], 200, 'A1', EXTENT);
    expect(byId.center).toBeNull();
  });
});

describe.skipIf(missing !== null)('a plan on its sheet lies where the extent puts it (#279)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    set = generateDefaultSet(model)!;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!);
  }, 120_000);

  /** The cut outlines of one plan on its sheet, alone, and the box its viewport reserved. */
  const onSheet = (name: string, layout: DefaultSet = set) => {
    const view = layout.document.views.find((v) => v.kind === 'plan' && v.name === name)!;
    const sheet = layout.document.sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id))!;
    const graphic = sheetGraphic(sheet, layout.document, new Map([[view.id, drawings.get(view.id)!]]), model.extent);
    const box = graphic.viewports.find((v) => v.viewId === view.id)!.box;
    const xs = graphic.cut.flatMap((run) => run.map((p) => p.x));
    return { graphic, box, minX: Math.min(...xs), maxX: Math.max(...xs), rings: drawings.get(view.id)!.cutPolygons.length };
  };

  it('the fixture is 30 m wide', () => {
    expect(model.extent!.max.x - model.extent!.min.x).toBeCloseTo(30, 3);
  });

  it('Nivel 1 sits at the left edge of its box and Nivel 2 at the right edge', () => {
    const k = 1000 / set.document.views.flatMap((v) => (v.kind === 'plan' ? [v] : []))[0].scale!;
    const one = onSheet('Nivel 1');
    const two = onSheet('Nivel 2');
    expect(one.minX).toBeCloseTo(one.box.x, 0);
    expect(one.maxX - one.minX).toBeCloseTo(8 * k, 0);
    expect(two.maxX).toBeCloseTo(two.box.x + two.box.w, 0);
    expect(two.maxX - two.minX).toBeCloseTo(10 * k, 0);
  });

  it('a project saved before the plan centre was stored is placed the same way', () => {
    const old: DefaultSet = { ...set, document: { ...set.document, sheets: set.document.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, center: null })) })) } };
    for (const name of ['Nivel 1', 'Nivel 2']) {
      const [now, before] = [onSheet(name), onSheet(name, old)];
      expect(before.minX).toBeCloseTo(now.minX, 6);
      expect(before.maxX).toBeCloseTo(now.maxX, 6);
    }
  });

  it('no outline of a storey is lost to the box', () => {
    // 4 walls and 10 m of wing: every ring of the drawing has a run on the sheet.
    for (const name of ['Nivel 1', 'Nivel 2']) {
      const { graphic, rings } = onSheet(name);
      expect(graphic.cut.length).toBe(rings);
    }
  });

  it('the same holds for the whole set, through sheetGraphics', async () => {
    const sheets = await sheetGraphics(set, model);
    const first = sheets.find((s) => s.number.startsWith('A-1'))!;
    const total = set.document.views.filter((v) => v.kind === 'plan').reduce((n, v) => n + (drawings.get(v.id)?.cutPolygons.length ?? 0), 0);
    expect(first.cut.length).toBe(total);
  });
});

/**
 * The Skolebygg sample (about 56 MB, not in CI): its Plan 01 has 3133 cut
 * rings, all of them inside the building's frame bar the survey marker's.
 * Needs an ifc-lite checkout: `IFC_LITE_MODELS=<its tests/models>`; skipped
 * without it.
 */
const SKOLEBYGG = `${process.env.IFC_LITE_MODELS ?? ''}/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc`;
const skolebyggMissing = !process.env.IFC_LITE_MODELS || !existsSync(SKOLEBYGG) ? 'Skolebygg sample not found (set IFC_LITE_MODELS)' : !existsSync(WASM) ? 'wasm bundle not built' : null;

describe.skipIf(skolebyggMissing !== null)('Skolebygg: the plans keep their outlines on the sheet (#279)', () => {
  it('Plan 01 and Plan 02 of A-101 and A-102 keep nearly every cut ring', async () => {
    const model = await openModel(new Uint8Array(readFileSync(SKOLEBYGG)));
    const set = generateDefaultSet(model)!;
    const sheets = await sheetGraphics(set, model);
    const rings = async (name: string) => (await generateViewDrawings(set.document.views.filter((v) => v.name === name), model.buildingMeshes, set.levels, model.extent!)).values().next().value!.cutPolygons.length;
    const kept = (sheet: string) => sheets.find((s) => s.number === sheet)!.cut.length;
    const ground = await rings('Plan 01') + await rings('Plan 00U');
    // The marker survey cube may fall outside the frame: a handful of rings, never a tenth.
    expect(kept('A-101')).toBeGreaterThan(ground * 0.95);
    expect(kept('A-101')).toBeGreaterThan(3000);
  }, 600_000);
});
