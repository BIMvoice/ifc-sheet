/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hiding one element and one line in one view, on a real model (#32, #33): AC20-FZK-Haus. The element is gone from that plan's
 * faces and lines, is still in a second plan of the same level and in the model the 3D view draws, and the view names it by
 * GlobalId (the drawing carries express ids, which change with every load).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, hiddenLineEntry, type DefaultSet, type ProjectDocument, type ProjectSheet, type ProjectView } from './index.js';
import { generateViewDrawings, openModel, sheetGraphic, type OpenedModel, type SheetGraphic } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus element graphics test: ${missing}`);

const inside = (box: { x: number; y: number; w: number; h: number }) => (pts: readonly { x: number; y: number }[]) =>
  pts.every((p) => p.x >= box.x - 1e-6 && p.x <= box.x + box.w + 1e-6 && p.y >= box.y - 1e-6 && p.y <= box.y + box.h + 1e-6);

describe.skipIf(missing !== null)('hide one wall in one plan of AC20-FZK-Haus (#33)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let ground: ProjectView;
  let copy: ProjectView;
  let sheet: ProjectSheet;
  let drawings: Map<string, Drawing2D>;
  let wall: { expressId: number; globalId: string };
  const globalIdOf = (id: number) => model.dataStore.entities.getGlobalId(id) || undefined;

  /** The sheet with the two plans side by side, `graphicsOfGround` on the first, nothing on the second. */
  const lay = (graphics: ProjectView['graphics']): SheetGraphic => {
    const views = set.document.views.map((v) => (v.id === ground.id ? { ...v, graphics } : v)).concat(copy);
    const doc: ProjectDocument = { ...set.document, views, sheets: [sheet] };
    return sheetGraphic(sheet, doc, drawings, model.extent, new Map(), globalIdOf);
  };
  const counts = (g: SheetGraphic) => g.viewports.map(({ box }) => {
    const within = inside(box);
    return g.cut.filter(within).length + g.lines.filter(within).length;
  });

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { now: 0 })!;
    ground = set.document.views.find((v) => v.name === 'Erdgeschoss')!;
    copy = { ...ground, id: 'view-ground-copy', name: 'Erdgeschoss (copy)' };
    const first = set.document.sheets.find((s) => s.number === 'A-101')!;
    const vp = first.viewports!.find((v) => v.viewId === ground.id)!;
    sheet = { ...first, viewports: [vp, { ...vp, id: 'vp-copy', viewId: copy.id, x: vp.x + 2000 }] };
    drawings = await generateViewDrawings([ground, copy], model.buildingMeshes, set.levels, model.extent!);
    drawings.set(copy.id, drawings.get(ground.id)!);
    const polygon = drawings.get(ground.id)!.cutPolygons.find((p) => p.ifcType === 'IfcWallStandardCase')!;
    wall = { expressId: polygon.entityId, globalId: globalIdOf(polygon.entityId)! };
  }, 300_000);

  it('has a wall with a GlobalId to hide', () => {
    expect(wall.globalId).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });

  it('takes the wall off that plan\'s faces and lines, and leaves a second plan of the same level untouched', () => {
    const [before, copyBefore] = counts(lay(undefined));
    expect(before).toBe(copyBefore);
    const [after, copyAfter] = counts(lay({ hiddenElements: [wall.globalId] }));
    expect(after).toBeLessThan(before);
    expect(copyAfter).toBe(copyBefore);
  });

  it('still has the wall in the model the 3D view draws, and does not touch the 3D view\'s graphics', () => {
    expect(model.meshes.some((m) => m.expressId === wall.expressId)).toBe(true);
    const threeD = set.document.views.find((v) => v.kind === '3d')!;
    lay({ hiddenElements: [wall.globalId] });
    expect(threeD.graphics?.hiddenElements).toBeUndefined();
  });

  it('is keyed by GlobalId: a hidden express id that is not the wall hides nothing', () => {
    const [before] = counts(lay(undefined));
    const [same] = counts(lay({ hiddenElements: [String(wall.expressId)] }));
    expect(same).toBe(before);
  });

  it('hides one line of the wall and no other', () => {
    const line = drawings.get(ground.id)!.lines.find((l) => l.entityId === wall.expressId && l.visibility !== 'hidden')!;
    expect(line).toBeDefined();
    const [before] = counts(lay(undefined));
    const [after] = counts(lay({ hiddenLines: [hiddenLineEntry(wall.globalId, line.line)] }));
    // A line is one polyline, unless the viewport clips it in two; never more than the lines that lie on it.
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(2);
  });
});
