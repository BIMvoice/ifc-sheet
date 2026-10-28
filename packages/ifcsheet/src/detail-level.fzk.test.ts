/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Detail level per view (#444) on a real model, AC20-FZK-Haus: a 1:100 plan draws each wall as one closed outline with no layer
 * lines; fine brings them back; the sheet's shapes (what the PDF and the DXF are written from) follow the same level.
 *
 * The sample's walls are each ONE layer (its four layer sets hold one layer apiece), so as shipped it has no layer lines to take away. The
 * test therefore builds the sample with the interior wall #15042 in three layers (plaster, lightweight concrete, insulation: the same 0.24 m),
 * the one change it makes to the file, and checks the unchanged sample draws the same at every level.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { beforeAll, describe, expect, it } from 'vitest';
import { atDetailLevel, generateDefaultSet, type DefaultSet, type ProjectDocument, type ProjectSheet, type ProjectView } from './index.js';
import { exportDxf, generateViewDrawings, openModel, sheetGraphic, type OpenedModel, type SheetGraphic } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus detail level test: ${missing}`);


/** The sample with the wall #15042 (Wand-Int-ERDG-4) in three layers of 0.02, 0.2 and 0.02 m instead of one of 0.24 m. */
function layered(): Uint8Array {
  const text = readFileSync(FZK, 'latin1')
    .replace('#15067= IFCMATERIALLAYER(#15046,0.24,', '#15067= IFCMATERIALLAYER(#15046,0.2,')
    .replace('#15069= IFCMATERIALLAYERSET((#15067),', '#15069= IFCMATERIALLAYERSET((#90011,#15067,#90012),')
    .replace(/\nENDSEC;\s*END-ISO-10303-21;\s*$/, "\n#90001= IFCMATERIAL('Plaster',$,$);\n#90002= IFCMATERIAL('Insulation',$,$);\n#90011= IFCMATERIALLAYER(#90001,0.02,.U.,$,$,$,$);\n#90012= IFCMATERIALLAYER(#90002,0.02,.U.,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n");
  return new Uint8Array(Buffer.from(text, 'latin1'));
}
const WALL = 15042;

interface Loaded { model: OpenedModel; set: DefaultSet; ground: ProjectView; drawing: Drawing2D }
async function load(bytes: Uint8Array): Promise<Loaded> {
  const model = await openModel(bytes);
  const set = generateDefaultSet(model, { now: 0 })!;
  const ground = set.document.views.find((v) => v.name === 'Erdgeschoss')!;
  const drawing = (await generateViewDrawings([ground], model.buildingMeshes, set.levels, model.extent!)).get(ground.id)!;
  return { model, set, ground, drawing };
}

/** The sheet of the plan at 1:`scale`, the view's graphics `graphics`. */
function sheetAt({ model, set, ground, drawing }: Loaded, scale: number, graphics?: ProjectView['graphics']): SheetGraphic {
  const first = set.document.sheets.find((s) => s.viewports?.some((v) => v.viewId === ground.id))!;
  const sheet: ProjectSheet = { ...first, viewports: [{ ...first.viewports!.find((v) => v.viewId === ground.id)!, scale }] };
  const views = set.document.views.map((v) => (v.id === ground.id ? { ...v, graphics } : v));
  const doc: ProjectDocument = { ...set.document, views, sheets: [sheet] };
  return sheetGraphic(sheet, doc, new Map([[ground.id, drawing]]), model.extent);
}
const dxfEntities = (sheet: SheetGraphic) => (exportDxf(sheet).match(/\n(LWPOLYLINE|POLYLINE|LINE)\r?\n/g) ?? []).length;

describe.skipIf(missing !== null)('detail level of a 1:100 plan of AC20-FZK-Haus (#444)', () => {
  let one: Loaded;
  let three: Loaded;
  const of = (d: Drawing2D, id = WALL) => d.cutPolygons.filter((p) => p.entityId === id);

  beforeAll(async () => {
    three = await load(layered());
    one = await load(new Uint8Array(readFileSync(FZK)));
  }, 300_000);

  /** The walls cut in layers: five of them share the layer set the test changed. */
  const layeredIds = (d: Drawing2D) => [...new Set(d.cutPolygons.filter((p) => p.materialId !== undefined && /^IfcWall/i.test(p.ifcType)).map((p) => p.entityId))];
  const area = (pts: readonly { x: number; y: number }[]) => Math.abs(pts.reduce((sum, a, i) => { const b = pts[(i + 1) % pts.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
  const net = (ps: readonly Drawing2D['cutPolygons'][number][]) => ps.reduce((sum, p) => sum + area(p.polygon.outer) - p.polygon.holes.reduce((h, hole) => h + area(hole), 0), 0);

  it('cuts walls in three layers (the test is not vacuous)', () => {
    expect(of(three.drawing)).toHaveLength(3);
    expect(layeredIds(three.drawing)).toContain(WALL);
    expect(layeredIds(three.drawing).length).toBeGreaterThanOrEqual(2);
  });

  it('coarse: each layered wall is one closed outline of the same area, with no layer, and nothing else changes', () => {
    const coarse = atDetailLevel(three.drawing, 'coarse');
    expect(of(coarse)).toHaveLength(1);
    expect(of(coarse)[0].polygon.outer.length).toBeGreaterThanOrEqual(3);
    for (const id of layeredIds(three.drawing)) {
      expect(of(coarse, id).every((p) => p.materialId === undefined && p.color === undefined && p.isLayerBase === undefined), `wall ${id}`).toBe(true);
      expect(net(of(coarse, id)), `area of wall ${id}`).toBeCloseTo(net(of(three.drawing, id)), 3);
      expect(of(coarse, id).length).toBeLessThan(of(three.drawing, id).length);
    }
    const layered = new Set(layeredIds(three.drawing));
    expect(coarse.cutPolygons.filter((p) => !layered.has(p.entityId))).toEqual(three.drawing.cutPolygons.filter((p) => !layered.has(p.entityId)));
    // No cut line runs across a wall between two layers: each lies on the outline.
    expect(coarse.lines.length).toBeLessThanOrEqual(three.drawing.lines.length);
  });

  it('fine brings the layers back: the drawing as the generator made it', () => {
    expect(atDetailLevel(three.drawing, 'fine')).toBe(three.drawing);
  });

  it('the sample as shipped has no layer to take away: every level draws it the same', () => {
    expect(of(one.drawing, WALL)).toHaveLength(1);
    expect(atDetailLevel(one.drawing, 'coarse').cutPolygons).toEqual(one.drawing.cutPolygons);
    expect(sheetAt(one, 100).cut.length).toBe(sheetAt(one, 100, { detailLevel: 'fine' }).cut.length);
  });

  it('the sheet follows the level: 1:100 draws each wall as one outline, 1:50 and a view set to fine bring the layers back', () => {
    const at100 = sheetAt(three, 100), at50 = sheetAt(three, 50), fineAt100 = sheetAt(three, 100, { detailLevel: 'fine' }), coarseAt50 = sheetAt(three, 50, { detailLevel: 'coarse' });
    expect(fineAt100.cut.length).toBeGreaterThan(at100.cut.length);
    expect(fineAt100.cut.length).toBe(at50.cut.length);
    expect(coarseAt50.cut.length).toBe(at100.cut.length);
    // The pens (what the PDF strokes, their faces and runs counted: the coordinates move with the scale) follow the level and not the scale: the same level at two scales strokes the same, two levels do not.
    const pens = (scale: number, level: 'coarse' | 'fine') => JSON.stringify(sheetAt(three, scale, { detailLevel: level }).pens.map((p) => [p.layer, p.stroke, p.width, p.fill, p.regions.length, p.runs.length]));
    expect(pens(50, 'coarse')).toBe(pens(100, 'coarse'));
    expect(pens(50, 'fine')).toBe(pens(100, 'fine'));
    expect(pens(100, 'fine')).not.toBe(pens(100, 'coarse'));
  });

  it('the DXF is written from the same shapes: it has fewer entities at 1:100 than the view set to fine', () => {
    expect(dxfEntities(sheetAt(three, 100))).toBeGreaterThan(0);
    expect(dxfEntities(sheetAt(three, 100))).toBeLessThan(dxfEntities(sheetAt(three, 100, { detailLevel: 'fine' })));
    expect(dxfEntities(sheetAt(three, 100, { detailLevel: 'fine' }))).toBe(dxfEntities(sheetAt(three, 50)));
  });
});
