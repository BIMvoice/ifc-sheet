/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #850: a wall of several layers cut in one piece takes the hatch of its thickest layer's material on the headless sheets. Before, an
 * element of several materials cut in one piece was named by no material, so a hatch the user set for any of its materials did nothing
 * at the default 1:100, where the wall is drawn by its outline (coarse detail).
 *
 * On `__fixtures__/layered-wall-window.ifc`, wall #48 of brick 0.14 (#50), insulation 0.12 (#51) and plaster 0.04 (#52), with its layers
 * put in the order plaster, brick, insulation, so the thickest layer is not the first. Its plan through the CLI's own path (`openModel`,
 * `generateViewDrawings`, `atDetailLevel` at the scale of the plan's sheet, `materialResolver(headlessMaterialSource)`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, resolveDetailLevel, type DetailLevel } from './detail-level.js';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { headlessMaterialSource } from './material-colour.js';
import { materialDrawing, materialResolver } from './material-drawing.js';
import type { ProjectMaterial } from './materials.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/layered-wall-window.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the dominant-material test: ${missing}`);

const WALL = 48;
const BRICK = 50;
/** The fixture with the wall's layers in the order plaster, brick, insulation. */
const reordered = (): Uint8Array => {
  const text = readFileSync(FIXTURE, 'utf8');
  const out = text.replace('IFCMATERIALLAYERSET((#53,#54,#55)', 'IFCMATERIALLAYERSET((#55,#53,#54)');
  if (out === text) throw new Error('the fixture no longer holds the layer set this test reorders');
  return new TextEncoder().encode(out);
};

const row = (name: string, hatch: string): ProjectMaterial => ({ id: name, name, hatch, hatchScale: 1, hatchPen: 'hairline' });
const BRICK_ROW = row('Brick', 'BRICKCUT');
const PLASTER_ROW = row('Plaster', 'ANSI31');

describe.skipIf(missing !== null)('a layered wall cut in one piece takes the hatch of its thickest layer (#850)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let plan: Drawing2D;
  let planScale: number | undefined;

  beforeAll(async () => {
    model = await openModel(reordered());
    const made = generateDefaultSet(model, { now: 0 });
    if (!made || !model.extent) throw new Error('no set: the model has no extent');
    const view = made.document.views.find((v) => v.kind === 'plan' && !('site' in v && v.site));
    if (!view) throw new Error(`no plan in ${made.document.views.map((v) => v.name).join(', ')}`);
    const sheet = made.document.sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id));
    const viewport = sheet?.viewports?.find((vp) => vp.viewId === view.id);
    if (!sheet || !viewport) throw new Error('the plan is on no sheet');
    // The plan's sheet with the plan alone, at 1:100, the scale of a real building's plans (the small model would fit a larger one).
    set = { ...made, document: { ...made.document, sheets: [{ ...sheet, viewports: [{ ...viewport, scale: 100 }] }] } };
    planScale = 100;
    plan = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent))!.get(view.id)!;
  }, 120_000);

  /** The wall's cut faces at `level`, each with the layer it is (or none) and the hatch the table gives it. */
  const wallCut = (level: DetailLevel, table: ProjectMaterial[]) => {
    const drawing = atDetailLevel(plan, level);
    const hatches = materialDrawing(drawing, materialResolver(headlessMaterialSource(model.dataStore!), table)).hatches;
    return drawing.cutPolygons.filter((p) => p.entityId === WALL).map((p) => ({ layer: p.materialId ?? null, hatch: hatches.find((h) => h.loops[0] === p.polygon.outer)?.pattern ?? null }));
  };

  /** The distinct (layer, hatch) of the wall's cut faces: the opening cuts the wall into two pieces either side of it. */
  const kinds = (faces: ReturnType<typeof wallCut>) => [...new Set(faces.map((f) => JSON.stringify(f)))].map((f) => JSON.parse(f) as (typeof faces)[number]);

  it('the plan at 1:100 draws the wall by its outline, in pieces of no layer', () => {
    expect(resolveDetailLevel(undefined, planScale)).toBe('coarse');
    expect(wallCut('coarse', []).length).toBeGreaterThanOrEqual(1);
    expect(kinds(wallCut('coarse', []))).toEqual([{ layer: null, hatch: null }]);
  });

  it('at 1:100 the outline takes the hatch of brick, the thickest layer, not of plaster, the first', () => {
    expect(kinds(wallCut('coarse', [PLASTER_ROW, BRICK_ROW]))).toEqual([{ layer: null, hatch: 'BRICKCUT' }]);
  });

  it('when only a thinner layer has a row, or none does, the outline stays plain', () => {
    expect(kinds(wallCut('coarse', [PLASTER_ROW]))).toEqual([{ layer: null, hatch: null }]);
    expect(kinds(wallCut('coarse', [row('Concrete', 'CONCRETE')]))).toEqual([{ layer: null, hatch: null }]);
  });

  it('cut layer by layer (fine), each band keeps the hatch of its own layer', () => {
    const bands = wallCut('fine', [PLASTER_ROW, BRICK_ROW]);
    expect(bands.length).toBeGreaterThanOrEqual(3);
    expect(bands.every((b) => b.layer !== null)).toBe(true);
    expect(new Set(bands.filter((b) => b.hatch === 'BRICKCUT').map((b) => b.layer))).toEqual(new Set([BRICK]));
    expect(bands.some((b) => b.hatch === 'ANSI31')).toBe(true);
  });

  it('the plan\'s sheet strokes the hatch with the brick row, and none without it', async () => {
    const hatchRuns = async (table: ProjectMaterial[]) => (await sheetGraphics(set, model, { materials: table }))
      .flatMap((s) => s.pens).filter((p) => p.layer === 'HATCH').reduce((n, p) => n + p.runs.length, 0);
    expect(await hatchRuns([PLASTER_ROW])).toBe(0);
    expect(await hatchRuns([BRICK_ROW])).toBeGreaterThan(0);
  }, 120_000);
});
