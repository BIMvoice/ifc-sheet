/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheets of AC20-FZK-Haus draw the door and window symbols of their plans in place of the doors' and windows' cut (#587): the
 * symbols are on the `SYMBOLS` pens the app's sheets give them (the thin pen the hatch pen, a configured type's cut parts the cut pen,
 * what lies above the cut dashed), the bodies they replace are off the sheet, and the DXF carries the layer. The app and the engine
 * make the symbols alike (`apps/viewer/src/project/opening-symbols-parity.fzk.test.ts`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { sheetGraphic } from './sheet-graphic.js';
import { planOpeningSymbols } from './plan-openings.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { PEN_TABLE } from './view-style.js';
import { resolveViewGraphics } from './view-templates.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;

describe.skipIf(missing !== null)('the sheets of AC20-FZK-Haus draw the door and window symbols (#587)', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model);
    if (!made) throw new Error('no set');
    set = made;
  }, 120_000);

  it('puts the symbols on SYMBOLS pens at the thin and the cut weights, and writes the layer to the DXF', async () => {
    const sheets = await sheetGraphics(set, model);
    const pens = sheets.flatMap((s) => s.pens.filter((p) => p.layer === 'SYMBOLS'));
    expect(pens.length, 'symbol pens').toBeGreaterThan(0);
    expect(pens.every((p) => p.stroke === '#000000' && p.fill === null && p.runs.length > 0)).toBe(true);
    // The pens of the app's overlays: thin is the hatch pen, a configured type's cut parts the cut pen. A door's leaf is cut-pen weight, its swing and a window's lines thin.
    expect(new Set(pens.map((p) => p.width))).toEqual(new Set([PEN_TABLE.pens.hatch, PEN_TABLE.pens.cut]));
    const withSymbols = sheets.find((s) => s.pens.some((p) => p.layer === 'SYMBOLS'))!;
    expect(exportDxf(withSymbols)).toContain('VIEW-SYMBOLS-013');
  });

  it('leaves the bodies of the doors and windows off the plan: they are drawn from their symbols, as the app\'s plans do', async () => {
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    const openings = new Map(plans.map((v) => [v.id, planOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(v, set.document.viewTemplates))]));
    const bodies = [...drawings.values()].flatMap((d) => [...d.lines, ...d.cutPolygons]).filter((e) => /^IfcDoor|^IfcWindow/.test(e.ifcType)).length;
    expect(bodies, 'the plans cut doors and windows').toBeGreaterThan(0);
    expect([...openings.values()].reduce((n, s) => n + s.length, 0), 'symbols').toBeGreaterThan(0);
    const strokes = (withOpenings: boolean) => set.document.sheets.map((sheet) => {
      const g = sheetGraphic(sheet, set.document, drawings, model.extent, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, withOpenings ? openings : undefined);
      return { cut: g.cut.length, lines: g.lines.length, symbols: g.pens.filter((p) => p.layer === 'SYMBOLS').reduce((n, p) => n + p.runs.length, 0) };
    });
    const without = strokes(false), within = strokes(true);
    expect(without.every((s) => s.symbols === 0), 'no symbols unless asked').toBe(true);
    expect(within.reduce((n, s) => n + s.symbols, 0), 'symbol runs').toBeGreaterThan(0);
    // A sheet with symbols draws fewer cut rings and lines than the same sheet with the bodies.
    const sheet = within.findIndex((s) => s.symbols > 0);
    expect(within[sheet].cut + within[sheet].lines).toBeLessThan(without[sheet].cut + without[sheet].lines);
  }, 120_000);
});
