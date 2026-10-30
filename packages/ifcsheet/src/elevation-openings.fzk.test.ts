/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheets of AC20-FZK-Haus draw the door and window symbols of their elevations and sections (#587): the opening lines of the doors
 * the elevations see, and of the windows and doors a section cuts through, on the `SYMBOLS` pens the plans' symbols use, over the drawing
 * (an elevation or section keeps the bodies of its doors and windows, as the app's does). The app and the engine make the symbols alike
 * (`apps/viewer/src/project/elevation-symbols-parity.fzk.test.ts`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { sheetGraphic } from './sheet-graphic.js';
import { viewOpeningSymbols } from './plan-openings.js';
import { defaultWindowSpec } from '@ifc-lite/create';
import type { ViewGraphics } from './view-graphics-types.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import type { ProjectView, SheetViewport } from './document.js';
import { PEN_TABLE } from './view-style.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;

describe.skipIf(missing !== null)('the sheets of AC20-FZK-Haus draw the door and window symbols of their elevations and sections (#587)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  const section = (id: string, axis: 'front' | 'side', offset: number): ProjectView => ({ id, kind: 'section', name: id, plane: { axis, offset, flipped: false }, createdAt: 0 }) as ProjectView;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model);
    if (!made) throw new Error('no set');
    set = made;
  }, 120_000);

  /** One sheet that carries `views` only, each in a viewport of its own. */
  const only = (views: readonly ProjectView[]): DefaultSet => {
    const viewport = (v: ProjectView, i: number): SheetViewport => ({ id: `vp${i}`, viewId: v.id, x: 200 + i * 20, y: 150, scale: 100, width: 0, height: 0, center: null });
    const sheet = { ...set.document.sheets[0], viewports: views.map(viewport) };
    return { ...set, document: { ...set.document, views: [...set.document.views.filter((v) => !views.some((w) => w.id === v.id)), ...views], sheets: [sheet] } };
  };
  const symbolRuns = async (views: readonly ProjectView[]) => {
    const [sheet] = await sheetGraphics(only(views), model);
    return { sheet, pens: sheet.pens.filter((p) => p.layer === 'SYMBOLS') };
  };

  it('puts the doors\' opening lines of the elevations on SYMBOLS pens at the thin weight', async () => {
    const elevations = set.document.views.filter((v) => v.kind === 'elevation');
    expect(elevations).toHaveLength(4);
    const { sheet, pens } = await symbolRuns(elevations);
    expect(pens.length, 'symbol pens').toBeGreaterThan(0);
    expect(pens.every((p) => p.stroke === '#000000' && p.fill === null && p.runs.length > 0)).toBe(true);
    expect(new Set(pens.map((p) => p.width)), 'an unconfigured door has thin lines only').toEqual(new Set([PEN_TABLE.pens.hatch]));
    expect(pens.some((p) => !p.dash), 'a solid pen').toBe(true);
    expect(exportDxf(sheet)).toContain('VIEW-SYMBOLS-013');
  });

  it('draws the symbols over the elevation: its doors and windows are not taken off it, as a plan\'s are', async () => {
    const elevations = set.document.views.filter((v) => v.kind === 'elevation');
    const doc = only(elevations).document;
    const drawings = await generateViewDrawings(elevations, model.buildingMeshes, set.levels, model.extent!);
    const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    const openings = new Map(elevations.map((v) => [v.id, viewOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, drawings.get(v.id)!, sources, undefined)]));
    expect([...openings.values()].reduce((n, o) => n + o.length, 0), 'symbols').toBeGreaterThan(0);
    const draw = (symbols?: typeof openings) => sheetGraphic(doc.sheets[0], doc, drawings, model.extent, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, symbols);
    const without = draw(), within = draw(openings);
    const own = (g: typeof without) => g.pens.filter((p) => p.layer !== 'SYMBOLS').map((p) => p.runs.length);
    expect(own(without).reduce((n, r) => n + r, 0), 'the elevations\' lines').toBeGreaterThan(0);
    expect(own(within), 'every pen of the drawing is as it was').toEqual(own(without));
    expect(within.cut.length + within.lines.length).toBe(without.cut.length + without.lines.length);
    expect(without.pens.some((p) => p.layer === 'SYMBOLS'), 'no symbols unless asked').toBe(false);
    expect(within.pens.some((p) => p.layer === 'SYMBOLS'), 'symbols over them').toBe(true);
  }, 120_000);

  it('draws the symbols of a window and a door that a section cuts, over the cut', async () => {
    const south = section('Section through the south wall', 'front', -0.16);
    const { pens } = await symbolRuns([south]);
    // A window has no symbol without a type, a door with a stated operation has its opening lines: the section cuts the south wall's door.
    expect(pens.reduce((n, p) => n + p.runs.length, 0), 'symbol runs on a section').toBeGreaterThan(0);
  }, 120_000);

  it('draws no symbols on the custom-plane sections the default set proposes, as the app draws none there', async () => {
    const custom = set.document.views.filter((v) => v.kind === 'section');
    expect(custom.length).toBeGreaterThan(0);
    const { pens } = await symbolRuns(custom);
    expect(pens, 'the sections the default set proposes are on a custom plane: the app draws no symbols there').toHaveLength(0);
  }, 120_000);

  describe('a class the view hides has no symbol (the app and the engine hide it alike)', () => {
    const south = section('Section through the south wall', 'front', -0.16);
    const hiding = (id: 'doors' | 'windows'): ViewGraphics => ({ categories: { [id]: { visible: false } } }) as ViewGraphics;
    /** Every window of the model mapped to one configured type, so that the windows draw symbols too. */
    const symbols = async (graphics: ViewGraphics | undefined) => {
      const type = { ...defaultWindowSpec('Fenster'), id: 'type-T1' };
      const elements: Record<string, string> = {};
      for (const m of model.buildingMeshes) {
        const guid = /^IFCWINDOW/i.test(m.ifcType ?? '') ? model.dataStore.entities?.getGlobalId(m.expressId) : undefined;
        if (guid) elements[guid] = type.id;
      }
      const views = [...set.document.views.filter((v) => v.kind === 'elevation'), south];
      const drawings = await generateViewDrawings(views, model.buildingMeshes, set.levels, model.extent!);
      const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [type], joineryMapping: { ...DEFAULT_JOINERY_MAPPING, elements } } };
      return views.flatMap((v) => viewOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, drawings.get(v.id)!, sources, graphics));
    };

    it('IfcDoor hidden: no door symbol, the windows keep theirs', async () => {
      const all = await symbols(undefined), hidden = await symbols(hiding('doors'));
      expect(all.filter((s) => s.kind === 'door').length, 'doors drawn when shown').toBeGreaterThan(0);
      expect(hidden.filter((s) => s.kind === 'door')).toHaveLength(0);
      expect(hidden.filter((s) => s.kind === 'window').length).toBe(all.filter((s) => s.kind === 'window').length);
    }, 120_000);

    it('IfcWindow hidden: no window symbol, the doors keep theirs', async () => {
      const all = await symbols(undefined), hidden = await symbols(hiding('windows'));
      expect(all.filter((s) => s.kind === 'window').length, 'windows drawn when shown').toBeGreaterThan(0);
      expect(hidden.filter((s) => s.kind === 'window')).toHaveLength(0);
      expect(hidden.filter((s) => s.kind === 'door').length).toBe(all.filter((s) => s.kind === 'door').length);
    }, 120_000);
  });
});
