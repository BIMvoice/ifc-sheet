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
import { viewportMarkFlags } from './viewport-marks.js';

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

  it('puts no mark on a sheet that holds no view of the template (schedules, a cover)', () => {
    for (const set of [pac, rural, norway]) {
      for (const sheet of set.document.sheets) {
        for (const vp of sheet.viewports ?? []) {
          const view = set.document.views.find((v) => v.id === vp.viewId);
          if (view) continue;
          expect(vp.northArrow, sheet.name).toBeUndefined();
          expect(vp.scaleBar, sheet.name).toBeUndefined();
        }
      }
    }
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
      // A mark that does not fit its viewport's box is not drawn (`viewport-marks.ts`): the FZK-Haus is a 13 m house, so at the
      // Norway site plan's 1:500 its box is smaller than the arrow and the shortest bar, and that one viewport's marks are left out. Every other plan has its arrow.
      const planViews = set.document.sheets.flatMap((s) => s.viewports ?? []).map((vp) => set.document.views.find((v) => v.id === vp.viewId)).filter((v) => v?.kind === 'plan');
      const floorPlans = planViews.filter((v) => v?.kind === 'plan' && !v.site).length;
      expect(floorPlans).toBeGreaterThan(0);
      expect(arrows).toBeGreaterThanOrEqual(floorPlans);
      expect(arrows).toBeLessThanOrEqual(planViews.length);
      const siteViews = set.document.views.filter((v) => v.kind === 'plan' && v.site).length;
      expect(bars).toBeGreaterThanOrEqual(drawn.length - siteViews);
      expect(bars).toBeLessThanOrEqual(drawn.length);
    }
  });
});
