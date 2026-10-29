/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Norway set (#372) on AC20-FZK-Haus: the sheets SAK10 § 5-4 asks for, plans, sections and facades at 1:100 (DiBK), and the
 * situasjonsplan at 1:500 with the note that no regulation sets that scale. Literal expectations: a changed scale or a lost item fails.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { NORWAY_ITEMS, applySetTemplate, generateDefaultSet, norwayCoverage, norwaySetTemplate, parseSetTemplate, serializeSetTemplate, type DefaultSet } from './index.js';
import { openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the Norway set test: ${missing}`);

const SCALE_NOTE = 'Scale 1:500 is usual; the regulation sets none.';
const TO_ADD_NOTE = 'Plot, distances and terrain must be drawn in (tomt, avstander og terreng).';
const NAMES = { name: 'Norway', plans: 'Floor plans', sections: 'Sections', facades: 'Facades', site: 'Site plan (situasjonsplan)', siteNotes: [SCALE_NOTE, TO_ADD_NOTE] };

it('has the committed AC20-FZK-Haus fixture', () => {
  expect(existsSync(FZK), `${FZK} is committed; a missing file is a broken checkout`).toBe(true);
});

describe('the checklist', () => {
  it('lists exactly these items, with their status and scale', () => {
    expect(NORWAY_ITEMS.map((i) => [i.id, i.status, i.scale, i.scaleStatus, i.drawnBy])).toEqual([
      ['plans', 'read', 100, 'read', 'plans'],
      ['roomUse', 'read', null, null, null],
      ['sections', 'read', 100, 'read', 'sections'],
      ['floorHeights', 'read', null, null, null],
      ['facades', 'read', 100, 'read', 'elevations'],
      ['facadeTerrain', 'read', null, null, null],
      ['mainDimensions', 'read', null, null, null],
      ['sitePlan', 'read', 500, 'unverified', 'site'],
      ['siteDistances', 'read', null, null, null],
      ['terrainLines', 'read', null, null, null],
      ['neighbourNotice', 'read', null, null, null],
      ['eaveRidgeHeights', 'unverified', null, null, null],
    ]);
  });

  it('names a source for every item, the law paragraph or the DiBK page', () => {
    for (const item of NORWAY_ITEMS) expect(item.source, item.id).toMatch(/SAK10|DiBK|draft/);
    expect(NORWAY_ITEMS.find((i) => i.id === 'sitePlan')?.source).toContain('SAK10 § 5-4 (3) m');
    expect(NORWAY_ITEMS.find((i) => i.id === 'siteDistances')?.source).toContain('road centreline');
    expect(NORWAY_ITEMS.find((i) => i.id === 'eaveRidgeHeights')?.source).toContain('not in force');
  });
});

describe('the template file', () => {
  it('survives the .bvset file, with the site rule', () => {
    const template = norwaySetTemplate(NAMES);
    expect(parseSetTemplate(serializeSetTemplate(template))).toEqual(template);
    expect(template.sheets.map((s) => [s.name, s.slots.map((sl) => [sl.view.kind, sl.scale])])).toEqual([
      ['Floor plans', [['allPlans', 100]]],
      ['Sections', [['section', 100], ['section', 100]]],
      ['Facades', [['elevation', 100], ['elevation', 100], ['elevation', 100], ['elevation', 100]]],
      [NAMES.site, [['site', 500]]],
    ]);
    expect(template.sheets[3].notes).toEqual([SCALE_NOTE, TO_ADD_NOTE]);
    expect(template.sheets.slice(0, 3).every((s) => s.notes === undefined)).toBe(true);
  });
});

describe.skipIf(missing !== null)('the Norway set of AC20-FZK-Haus', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    set = generateDefaultSet(model, { setTemplate: norwaySetTemplate(NAMES), now: 0 })!;
  });

  const sheet = (name: string) => set.document.sheets.find((s) => s.name === name)!;
  const viewsOf = (name: string) => (sheet(name).viewports ?? []).map((vp) => set.document.views.find((v) => v.id === vp.viewId)!);

  it('lists the sheets: plans, sections, facades, then the situasjonsplan', () => {
    expect(set.document.sheets.map((s) => s.name)).toEqual(['Floor plans', 'Sections', 'Facades', NAMES.site]);
  });

  it('draws plans, sections and facades at 1:100', () => {
    for (const name of ['Floor plans', 'Sections', 'Facades']) {
      const scales = (sheet(name).viewports ?? []).map((vp) => vp.scale);
      expect(scales.length, name).toBeGreaterThan(0);
      expect(new Set(scales), name).toEqual(new Set([100]));
    }
    expect(set.notes.filter((n) => n.key === 'setTemplate.note.rescaled')).toEqual([]);
    // The four facades side by side do not fit A2 at 1:100: that sheet steps up to A1 and keeps the scale.
    expect(set.document.sheets.map((s) => [s.name, s.paper])).toEqual([['Floor plans', 'A2'], ['Sections', 'A2'], ['Facades', 'A1'], [NAMES.site, 'A2']]);
  });

  it('puts a plan of every storey, the four facades and the sections on their sheets', () => {
    expect(viewsOf('Floor plans').length).toBe(set.levels.length);
    expect(viewsOf('Facades').map((v) => (v.kind === 'elevation' ? v.direction : null))).toEqual(['north', 'east', 'south', 'west']);
    expect(viewsOf('Sections').every((v) => v.kind === 'section')).toBe(true);
  });

  it('puts the site plan, cut on the ground storey, on its own sheet at 1:500, named plainly, with the notes printed on the sheet', () => {
    const [site] = viewsOf(NAMES.site);
    expect(viewsOf(NAMES.site).length).toBe(1);
    expect(site.kind === 'plan' && site.site).toBe(true);
    expect(site.scale).toBe(500);
    expect(sheet(NAMES.site).viewports?.[0].scale).toBe(500);
    expect(sheet(NAMES.site).name).toBe('Site plan (situasjonsplan)');
    expect(sheet(NAMES.site).notes).toEqual([SCALE_NOTE, TO_ADD_NOTE]);
    // The notes are on the sheet, not in the name the title block and the drawing list print.
    expect(set.document.sheets.map((s) => s.name).join('|')).not.toContain('1:500');
    expect(sheet('Floor plans').notes).toBeUndefined();
    expect(sheet(NAMES.site).series).toBe('plans');
    // The site plan is not one of the floor plans.
    expect(viewsOf('Floor plans').some((v) => v.kind === 'plan' && v.site)).toBe(false);
  });

  it('marks plans, sections, facades and the site plan drawn, and the rest to be supplied', () => {
    const rows = norwayCoverage(set.document.sheets, set.document.views);
    // Only the views are drawn: room use, floor heights, terrain, the plot and the distances are for the person to add.
    expect(rows.filter((r) => r.drawn).map((r) => r.item.id)).toEqual(['plans', 'sections', 'facades', 'sitePlan']);
    expect(rows.filter((r) => !r.drawn).map((r) => r.item.id)).toEqual(['roomUse', 'floorHeights', 'facadeTerrain', 'mainDimensions', 'siteDistances', 'terrainLines', 'neighbourNotice', 'eaveRidgeHeights']);
    expect(rows.every((r) => r.missingStoreys.length === 0)).toBe(true);
    expect(norwayCoverage([], set.document.views).some((r) => r.drawn)).toBe(false);
  });

  it('does not hold the plans when a storey has none on a sheet, and names it', () => {
    const lastLevel = set.levels[set.levels.length - 1].name;
    const top = set.document.views.find((v) => v.kind === 'plan' && !v.site && v.level.name === lastLevel)!;
    const sheets = set.document.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId !== top.id) }));
    const plans = norwayCoverage(sheets, set.document.views).find((r) => r.item.id === 'plans')!;
    expect(plans.drawn).toBe(false);
    expect(plans.missingStoreys).toEqual([lastLevel]);
  });

  it('applies to views without a site plan by leaving the site sheet out, silently', () => {
    const views = set.document.views.filter((v) => !(v.kind === 'plan' && v.site));
    const applied = applySetTemplate(norwaySetTemplate(NAMES), { views, extent: model.extent!, now: 0 });
    expect(applied.sheets.map((s) => s.name)).toEqual(['Floor plans', 'Sections', 'Facades']);
    expect(applied.notes).toEqual([]);
  });
});
