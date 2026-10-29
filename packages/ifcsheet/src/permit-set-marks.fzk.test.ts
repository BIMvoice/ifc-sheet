/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit set templates (Romanian PAC full and rural, Norway) on AC20-FZK-Haus turn on the north arrow and the graphic
 * scale bar (#425) on exactly the views they are meant for: a north arrow on the plans and the site plan, a scale bar on
 * every scaled view, and nothing on a sheet the template does not draw from a view.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, norwaySetTemplate, pacRuralSetTemplate, pacSetTemplate, parseSetTemplate, serializeSetTemplate, type DefaultSet, type SetTemplate } from './index.js';
import { openModel, sheetGraphics, type OpenedModel } from './headless.js';
import { ARROW_NEED_MM, siteMarkArea, viewportMarkFlags } from './viewport-marks.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the permit set marks test: ${missing}`);

const PAC_NAMES = { name: 'PAC', plans: 'Planuri', facades: 'Fatade', sections: 'Sectiuni' };
const NORWAY_NAMES = { name: 'Norway', plans: 'Plans', sections: 'Sections', facades: 'Facades', site: 'Site', siteNotes: ['scale note'] };

type Kind = 'plan' | 'site' | 'elevation' | 'section';
/** What each viewport of the set carries, by the kind of its view, as `[kind, northArrow, scaleBar]` rows (no repeats). */
function marksOf(set: DefaultSet): [Kind, boolean | undefined, boolean | undefined][] {
  const rows = new Map<string, [Kind, boolean | undefined, boolean | undefined]>();
  for (const sheet of set.document.sheets) {
    for (const vp of sheet.viewports ?? []) {
      const view = set.document.views.find((v) => v.id === vp.viewId)!;
      const kind: Kind = view.kind === 'plan' ? (view.site ? 'site' : 'plan') : (view.kind as Kind);
      rows.set(`${kind}|${vp.northArrow}|${vp.scaleBar}`, [kind, vp.northArrow, vp.scaleBar]);
    }
  }
  return [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

describe('the templates themselves', () => {
  it('survive the .bvset file with their marks', () => {
    for (const t of [pacSetTemplate(PAC_NAMES), pacRuralSetTemplate(PAC_NAMES), norwaySetTemplate(NORWAY_NAMES)]) {
      expect(parseSetTemplate(serializeSetTemplate(t))).toEqual(t);
      expect(t.sheets.flatMap((s) => s.slots).every((slot) => slot.scaleBar === true)).toBe(true);
    }
  });

  it('refuse a mark that is not true or false', () => {
    const t: SetTemplate = pacSetTemplate(PAC_NAMES);
    const bad = serializeSetTemplate(t).replace('"scaleBar": true', '"scaleBar": "yes"');
    expect(() => parseSetTemplate(bad)).toThrow(/scaleBar/);
  });
});

// #482 review: a site plan's outside marks stand right beside its box and keep off the rest of the sheet.
describe('siteMarkArea', () => {
  const area = { x: 0, y: 0, w: 400, h: 280 };
  const box = { x: 100, y: 100, w: 20, h: 20 };
  it('takes the strip right beside the box, as deep as the mark needs, not the far side of the sheet', () => {
    const r = siteMarkArea(box, area, ARROW_NEED_MM)!;
    expect(r).toEqual({ x: 120, y: 100, w: ARROW_NEED_MM.w, h: ARROW_NEED_MM.h });
  });
  it('skips a side another viewport sits on, and gives none when every side is taken', () => {
    const right = { x: 125, y: 90, w: 100, h: 100 };
    expect(siteMarkArea(box, area, ARROW_NEED_MM, [right])!.x).toBe(100 - ARROW_NEED_MM.w);
    const all = [right, { x: 0, y: 90, w: 98, h: 100 }, { x: 90, y: 0, w: 60, h: 98 }, { x: 90, y: 122, w: 60, h: 100 }];
    expect(siteMarkArea(box, area, ARROW_NEED_MM, all)).toBeNull();
  });
});

describe.skipIf(missing !== null)('the permit sets of AC20-FZK-Haus', () => {
  let model: OpenedModel;
  let pac: DefaultSet;
  let rural: DefaultSet;
  let norway: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    pac = generateDefaultSet(model, { setTemplate: pacSetTemplate(PAC_NAMES), now: 0 })!;
    rural = generateDefaultSet(model, { setTemplate: pacRuralSetTemplate(PAC_NAMES), now: 0 })!;
    norway = generateDefaultSet(model, { setTemplate: norwaySetTemplate(NORWAY_NAMES), now: 0 })!;
  }, 300_000);

  it('PAC (full): north arrow and scale bar on the plans, scale bar on the facades and sections', () => {
    expect(marksOf(pac)).toEqual([['elevation', undefined, true], ['plan', true, true], ['section', undefined, true]]);
  });

  it('PAC (rural): north arrow and scale bar on the plans, scale bar on the facades and sections', () => {
    expect(marksOf(rural)).toEqual([['elevation', undefined, true], ['plan', true, true], ['section', undefined, true]]);
  });

  it('Norway: north arrow and scale bar on the plans and the site plan, scale bar on the facades and sections', () => {
    expect(marksOf(norway)).toEqual([['elevation', undefined, true], ['plan', true, true], ['section', undefined, true], ['site', true, true]]);
  });

  it('puts a mark on every viewport the template drew a view into', () => {
    let withView = 0;
    for (const set of [pac, rural, norway]) {
      for (const sheet of set.document.sheets) {
        for (const vp of sheet.viewports ?? []) {
          if (!set.document.views.some((v) => v.id === vp.viewId)) continue;
          withView++;
          expect(vp.northArrow !== undefined || vp.scaleBar !== undefined, sheet.name).toBe(true);
        }
      }
    }
    expect(withView).toBeGreaterThan(0);
  });

  // #482 review: the FZK sets hold no viewport without a view, so this is a hand-made one asking for both marks.
  it('draws no mark on a viewport whose view is not in the project, even when it asks for both', async () => {
    const before = await sheetGraphics(norway, model);
    const sheet = norway.document.sheets[0];
    const orphan = { id: 'orphan', viewId: 'no-such-view', x: 50, y: 50, scale: 100, width: 60, height: 60, center: null, northArrow: true, scaleBar: true };
    const withOrphan: DefaultSet = { ...norway, document: { ...norway.document, sheets: norway.document.sheets.map((sh) => (sh.id === sheet.id ? { ...sh, viewports: [...(sh.viewports ?? []), orphan] } : sh)) } };
    const after = await sheetGraphics(withOrphan, model);
    const marksOn = (gs: typeof before) => gs.find((g) => g.sheetId === sheet.id)!;
    expect(marksOn(after).texts.filter((t) => t.text === 'N').length).toBe(marksOn(before).texts.filter((t) => t.text === 'N').length);
    expect(marksOn(after).symbols.strokes.length).toBe(marksOn(before).symbols.strokes.length);
  });

  it('a north arrow is only ever drawn on a plan: the facades and sections resolve to no arrow', () => {
    for (const set of [pac, rural, norway]) {
      for (const sheet of set.document.sheets) {
        for (const vp of sheet.viewports ?? []) {
          const view = set.document.views.find((v) => v.id === vp.viewId)!;
          const flags = viewportMarkFlags(vp, view);
          expect(flags.scaleBar, view.name).toBe(true);
          expect(flags.northArrow, view.name).toBe(view.kind === 'plan');
        }
      }
    }
  });

  it('draws them: the engine\'s sheets carry an arrow on every floor plan and a bar on every view', async () => {
    for (const set of [pac, rural, norway]) {
      const graphics = await sheetGraphics(set, model);
      const drawn = graphics.flatMap((g) => g.viewports);
      const arrows = graphics.reduce((n, g) => n + g.texts.filter((t) => t.text === 'N').length, 0);
      const bars = graphics.reduce((n, g) => n + g.symbols.strokes.filter((s) => s.length === 5 && s[0].y === s[1].y).length, 0);
      const planViews = set.document.sheets.flatMap((s) => s.viewports ?? []).map((vp) => set.document.views.find((v) => v.id === vp.viewId)).filter((v) => v?.kind === 'plan');
      const floorPlans = planViews.filter((v) => v?.kind === 'plan' && !v.site).length;
      expect(floorPlans).toBeGreaterThan(0);
      expect(arrows).toBe(planViews.length);
      expect(bars).toBe(drawn.length);
    }
  });

  it('Norway: the site plan of the FZK-Haus (a 13 m house at 1:500, a box smaller than the arrow) still prints its arrow and bar, beside the drawing', async () => {
    const graphics = await sheetGraphics(norway, model);
    const siteView = norway.document.views.find((v) => v.kind === 'plan' && v.site)!;
    const sheet = norway.document.sheets.find((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === siteView.id))!;
    const g = graphics.find((x) => x.sheetId === sheet.id)!;
    const box = g.viewports.find((v) => v.viewId === siteView.id)!.box;
    expect(box.w).toBeLessThan(34);
    // Only this view is a site plan on its sheet: its mark texts are the sheet's 'N' and its bar figures.
    const arrow = g.texts.find((t) => t.text === 'N');
    expect(arrow).toBeDefined();
    const bar = g.symbols.strokes.filter((s) => s.length === 5 && s[0].y === s[1].y);
    expect(bar.length).toBeGreaterThan(0);
    const inside = (p: { x: number; y: number }) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    expect(inside(arrow!.at)).toBe(false);
    expect(bar.flat().some(inside)).toBe(false);
    // #482 review: beside its own drawing, and on nothing else of the sheet (another viewport and its title).
    const others = g.viewports.filter((v) => v.viewId !== siteView.id).map((v) => ({ ...v.box, h: v.box.h + 12 }));
    const on = (r: { x: number; y: number; w: number; h: number }) => (p: { x: number; y: number }) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
    for (const r of others) expect([arrow!.at, ...bar.flat()].some(on(r))).toBe(false);
    const near = (p: { x: number; y: number }) => Math.max(box.x - p.x, p.x - (box.x + box.w), box.y - p.y, p.y - (box.y + box.h));
    expect(near(arrow!.at)).toBeLessThan(40);
    const frame = g.frame[0];
    const xs = frame.map((p) => p.x);
    const ys = frame.map((p) => p.y);
    for (const p of [arrow!.at, ...bar.flat()]) {
      expect(p.x).toBeGreaterThan(Math.min(...xs));
      expect(p.x).toBeLessThan(Math.max(...xs));
      expect(p.y).toBeGreaterThan(Math.min(...ys));
      expect(p.y).toBeLessThan(Math.max(...ys));
    }
  });
});
