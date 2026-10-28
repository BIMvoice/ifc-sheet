/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Germany set (#372) on AC20-FZK-Haus, per Land: Bauzeichnungen at 1:100 everywhere; the Lageplan at 1:1000 in Bayern (BayBauVorlV § 7),
 * 1:500 in Nordrhein-Westfalen (BauPrüfVO § 3) and Baden-Württemberg (LBOVVO § 4), and in Baden-Württemberg the Abstandsflächen on a sheet of
 * their own (LBOVVO § 4(4)). Literal expectations: a changed scale, a moved Land or a lost item fails.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GERMANY_LANDS, applySetTemplate, generateDefaultSet, germanyCoverage, germanyItems, germanySetTemplate, parseSetTemplate, serializeSetTemplate, type DefaultSet, type GermanyLand } from './index.js';
import { openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the Germany set test: ${missing}`);

const SITE = 'Site plan (Lageplan)';
const SETBACK = 'Abstandsflächenplan';
const NAMES = { name: 'Germany', plans: 'Floor plans', sections: 'Sections', elevations: 'Elevations', site: SITE, siteNotes: ['Scale note', 'To add note'], setback: SETBACK, setbackNotes: ['Setback note: the Abstandsflächen are to be drawn'] };

it('has the committed AC20-FZK-Haus fixture', () => {
  expect(existsSync(FZK), `${FZK} is committed; a missing file is a broken checkout`).toBe(true);
});

describe('the checklist, literally', () => {
  const row = (land: GermanyLand) => germanyItems(land).map((i) => [i.id, i.status, i.scale, i.scaleStatus, i.drawnBy]);
  const common = (site: number, siteStatus: string) => [
    ['plans', 'read', 100, 'read', 'plans'],
    ['sections', 'read', 100, 'read', 'sections'],
    ['sectionHeights', 'read', null, null, null],
    ['facades', 'read', 100, 'read', 'elevations'],
    ['facadeContent', 'read', null, null, null],
    ['sitePlan', 'read', site, siteStatus, 'site'],
    ['siteContent', 'read', null, null, null],
  ];
  // READ for a Land only where its own text was read: the scale bar, the single files and the PDF/A of Bayern (DBauV § 11), the PDF/A of BW (LBOVVO § 3). The rest cite the model text only.
  const tail = (land: 'bayern' | 'nrw' | 'bw') => [
    ['scaleBar', land === 'bayern' ? 'read' : 'unverified', null, null, null],
    ['pdfA', land === 'nrw' ? 'unverified' : 'read', null, null, null],
    ['oneFile', land === 'bayern' ? 'read' : 'unverified', null, null, null],
    ['fileName', 'unverified', null, null, null],
    ['designer', 'unverified', null, null, null],
  ];
  const tailOther = [
    ['scaleBar', 'read', null, null, null],
    ['pdfA', 'read', null, null, null],
    ['oneFile', 'read', null, null, null],
    ['fileName', 'read', null, null, null],
    ['designer', 'read', null, null, null],
  ];

  it('Bayern: Lageplan 1:1000, Abstandsflächen in the Lageplan, a declaration of its own, the use calculation a document of its own', () => {
    expect(row('bayern')).toEqual([
      ...common(1000, 'read'),
      ['setbackAreas', 'read', null, null, null],
      ['setbackDeclaration', 'read', null, null, null],
      ['useCalculation', 'read', null, null, null],
      ['symbolsColours', 'read', null, null, null],
      ...tail('bayern'),
      ['otherDocuments', 'unverified', null, null, null],
    ]);
  });

  it('NRW: Lageplan 1:500, Abstandsflächen in the Lageplan, the statewide filing duty unverified', () => {
    expect(row('nrw')).toEqual([
      ...common(500, 'read'),
      ['setbackAreas', 'read', null, null, null],
      ['useCalculation', 'read', null, null, null],
      ['symbolsColours', 'read', null, null, null],
      ...tail('nrw'),
      ['nrwFiling', 'unverified', null, null, null],
      ['otherDocuments', 'unverified', null, null, null],
    ]);
  });

  it('BW: Lageplan 1:500, the Abstandsflächen on a separate sheet the set draws', () => {
    expect(row('bw')).toEqual([
      ...common(500, 'read'),
      ['setbackSheet', 'read', null, null, 'setback'],
      ['useCalculation', 'read', null, null, null],
      ['symbolsColours', 'read', null, null, null],
      ...tail('bw'),
      ['otherDocuments', 'unverified', null, null, null],
    ]);
  });

  it('any other Land, and no Land: the Lageplan scale and the use calculation are unverified', () => {
    expect(row('other')).toEqual([
      ...common(500, 'unverified'),
      ['setbackAreas', 'read', null, null, null],
      ['useCalculation', 'unverified', null, null, null],
      ['symbolsColours', 'unverified', null, null, null],
      ...tailOther,
      ['otherDocuments', 'unverified', null, null, null],
    ]);
    expect(germanyItems()).toEqual(germanyItems('other'));
  });

  // The research's READ list, per Land: the text it read for each item, as the citation the row must carry. A row is `read` for a Land
  // only if it is here, and its source must contain this text (`permit-drawing-rules-europe.md`, section 2.3 and 2.5). The model text
  // (MBauVorlV) is READ as a model: it backs `other` only, never one of the three Länder.
  const READ_LIST: Record<GermanyLand, Record<string, string>> = {
    bayern: {
      plans: 'BayBauVorlV § 8', sections: 'BayBauVorlV § 8', sectionHeights: 'BayBauVorlV § 8', facades: 'BayBauVorlV § 8', facadeContent: 'BayBauVorlV § 8',
      sitePlan: 'BayBauVorlV § 7', siteContent: 'BayBauVorlV § 7(3)', setbackAreas: 'BayBauVorlV § 7(3) no. 13', setbackDeclaration: 'BayBauVorlV § 3 no. 8',
      useCalculation: 'BayBauVorlV § 3 no. 7', symbolsColours: 'BayBauVorlV § 7(5)', scaleBar: 'DBauV (digital Bauantrag only) § 11(2)', pdfA: 'DBauV (digital Bauantrag only) § 11', oneFile: 'DBauV (digital Bauantrag only) § 11',
    },
    nrw: {
      plans: 'BauPrüfVO § 4', sections: 'BauPrüfVO § 4', sectionHeights: 'BauPrüfVO § 4(3)', facades: 'BauPrüfVO § 4', facadeContent: 'BauPrüfVO § 4(4)',
      sitePlan: 'BauPrüfVO § 3', siteContent: 'BauPrüfVO § 3(1)', setbackAreas: 'BauPrüfVO § 3(1) nos. 6 and 12', useCalculation: 'BauPrüfVO § 3(2)', symbolsColours: 'BauPrüfVO § 3(5)',
    },
    bw: {
      plans: 'LBOVVO § 6', sections: 'LBOVVO § 6', sectionHeights: 'LBOVVO § 6', facades: 'LBOVVO § 6', facadeContent: 'LBOVVO § 6',
      sitePlan: 'LBOVVO § 4', siteContent: 'LBOVVO § 4', setbackSheet: 'LBOVVO § 4(4)', useCalculation: 'LBOVVO § 4(6) no. 6', symbolsColours: 'LBOVVO § 4(5)', pdfA: 'LBOVVO § 3',
    },
    other: {
      plans: 'MBauVorlV (model text, not law until a Land adopts it) § 8', sections: 'MBauVorlV (model text, not law until a Land adopts it) § 8', sectionHeights: 'MBauVorlV (model text, not law until a Land adopts it) § 8',
      facades: 'MBauVorlV (model text, not law until a Land adopts it) § 8', facadeContent: 'MBauVorlV (model text, not law until a Land adopts it) § 8',
      sitePlan: 'MBauVorlV (model text, not law until a Land adopts it) § 7', siteContent: 'MBauVorlV (model text, not law until a Land adopts it) § 7(2) to (4)', setbackAreas: 'MBauVorlV (model text, not law until a Land adopts it) § 7',
      scaleBar: 'MBauVorlV (model text, not law until a Land adopts it) § 3(2)', pdfA: 'MBauVorlV (model text, not law until a Land adopts it) § 2', oneFile: 'MBauVorlV (model text, not law until a Land adopts it) § 2',
      fileName: 'MBauVorlV (model text, not law until a Land adopts it) § 2', designer: 'MBauVorlV (model text, not law until a Land adopts it) § 3(3)',
    },
  };

  it('marks a row read for a Land only where the research read that Land\'s own text, and cites exactly that text', () => {
    for (const land of GERMANY_LANDS) {
      const read = germanyItems(land).filter((i) => i.status === 'read');
      expect(read.map((i) => i.id).sort(), `${land}: the rows marked read are the research's READ list`).toEqual(Object.keys(READ_LIST[land]).sort());
      for (const item of read) {
        expect(item.source, `${land} ${item.id}`).toContain(READ_LIST[land][item.id]);
        if (land !== 'other') expect(item.source, `${land} ${item.id} is not backed by the model text`).not.toMatch(/MBauVorlV/);
        if (land === 'bayern' && item.id === 'scaleBar') expect(item.source).not.toContain('BayBauVorlV');
      }
    }
    // The model-text rows are unverified for each Land, and say why.
    for (const land of ['bayern', 'nrw', 'bw'] as const) {
      for (const item of germanyItems(land).filter((i) => i.status === 'unverified' && /MBauVorlV/.test(i.source))) expect(item.source, `${land} ${item.id}`).toContain('this Land\'s own ordinance was not read');
    }
  });

  it('keeps the rows of the sources the research read', () => {
    const sourceOf = (land: GermanyLand, id: string) => germanyItems(land).find((i) => i.id === id)!.source;
    expect(sourceOf('bayern', 'sitePlan')).toBe('BayBauVorlV § 7: Lageplan not smaller than 1:1000');
    expect(sourceOf('nrw', 'useCalculation')).toContain('BauPrüfVO § 3(2)');
    expect(sourceOf('bw', 'setbackSheet')).toContain('LBOVVO § 4(4)');
    expect(sourceOf('bayern', 'useCalculation')).toContain('BayBauVorlV § 3 no. 7');
    expect(sourceOf('bw', 'useCalculation')).toContain('LBOVVO § 4(6) no. 6');
  });

  it('keeps every Land\'s item ids unique and the Lageplan scale only on the Lageplan', () => {
    for (const land of GERMANY_LANDS) {
      const items = germanyItems(land);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      expect(items.filter((i) => i.scale !== null && i.scale !== 100).map((i) => i.id)).toEqual(['sitePlan']);
    }
  });
});

describe('the template file', () => {
  it('survives the .bvset file in every Land, the second site plan of BW with its `nth`', () => {
    for (const land of GERMANY_LANDS) {
      const template = germanySetTemplate(NAMES, land);
      expect(parseSetTemplate(serializeSetTemplate(template)), land).toEqual(template);
    }
    const bw = germanySetTemplate(NAMES, 'bw');
    expect(bw.sheets.map((s) => [s.name, s.slots.map((sl) => [sl.view.kind, sl.view.kind === 'site' ? sl.view.nth ?? 0 : null, sl.scale])])).toEqual([
      ['Floor plans', [['allPlans', null, 100]]],
      ['Sections', [['section', null, 100], ['section', null, 100]]],
      ['Elevations', [['elevation', null, 100], ['elevation', null, 100], ['elevation', null, 100], ['elevation', null, 100]]],
      [SITE, [['site', 0, 500]]],
      [SETBACK, [['site', 1, 500]]],
    ]);
    expect(bw.sheets[4].notes).toEqual(['Setback note: the Abstandsflächen are to be drawn']);
    expect(germanySetTemplate(NAMES, 'bayern').sheets.map((s) => s.name)).toEqual(['Floor plans', 'Sections', 'Elevations', SITE]);
  });
});

describe.skipIf(missing !== null)('the Germany set of AC20-FZK-Haus', () => {
  let model: OpenedModel;
  const sets = new Map<GermanyLand, DefaultSet>();

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    for (const land of GERMANY_LANDS) sets.set(land, generateDefaultSet(model, { setTemplate: germanySetTemplate(NAMES, land), now: 0 })!);
  });

  const sheetOf = (land: GermanyLand, name: string) => sets.get(land)!.document.sheets.find((s) => s.name === name)!;
  const viewsOf = (land: GermanyLand, name: string) => (sheetOf(land, name).viewports ?? []).map((vp) => sets.get(land)!.document.views.find((v) => v.id === vp.viewId)!);

  it.each([
    ['bayern', 1000],
    ['nrw', 500],
    ['bw', 500],
    ['other', 500],
  ] as const)('%s: the Lageplan is a site plan cut on the ground storey, drawn at 1:%i, with its notes printed on the sheet', (land, scale) => {
    const [site] = viewsOf(land, SITE);
    expect(viewsOf(land, SITE).length).toBe(1);
    expect(site.kind === 'plan' && site.site).toBe(true);
    expect(site.scale).toBe(scale);
    expect(sheetOf(land, SITE).viewports?.[0].scale).toBe(scale);
    expect(sheetOf(land, SITE).notes).toEqual(['Scale note', 'To add note']);
    expect(sheetOf(land, SITE).series).toBe('plans');
    expect(viewsOf(land, 'Floor plans').some((v) => v.kind === 'plan' && v.site)).toBe(false);
    expect(sets.get(land)!.document.sheets.map((s) => s.name).join('|')).not.toMatch(/1:\d/);
  });

  it.each(GERMANY_LANDS)('%s: floor plans of every storey, sections and the four elevations at 1:100, stepping the paper up, never the scale', (land) => {
    for (const name of ['Floor plans', 'Sections', 'Elevations']) {
      const scales = (sheetOf(land, name).viewports ?? []).map((vp) => vp.scale);
      expect(scales.length, name).toBeGreaterThan(0);
      expect(new Set(scales), name).toEqual(new Set([100]));
    }
    expect(viewsOf(land, 'Floor plans').length).toBe(sets.get(land)!.levels.length);
    expect(viewsOf(land, 'Elevations').map((v) => (v.kind === 'elevation' ? v.direction : null))).toEqual(['north', 'east', 'south', 'west']);
    expect(sets.get(land)!.notes.filter((n) => n.key === 'setTemplate.note.rescaled')).toEqual([]);
    expect(sets.get(land)!.document.sheets.find((s) => s.name === 'Elevations')!.paper).toBe('A1');
  });

  it('lists the sheets: Bayern and NRW have no Abstandsflächenplan, BW has one after the Lageplan', () => {
    const names = (land: GermanyLand) => sets.get(land)!.document.sheets.map((s) => s.name);
    expect(names('bayern')).toEqual(['Floor plans', 'Sections', 'Elevations', SITE]);
    expect(names('nrw')).toEqual(['Floor plans', 'Sections', 'Elevations', SITE]);
    expect(names('bw')).toEqual(['Floor plans', 'Sections', 'Elevations', SITE, SETBACK]);
  });

  it('BW: the Abstandsflächenplan is its own site plan at 1:500 on its own sheet, with its own note', () => {
    const [setback] = viewsOf('bw', SETBACK);
    const [site] = viewsOf('bw', SITE);
    expect(viewsOf('bw', SETBACK).length).toBe(1);
    expect(setback.kind === 'plan' && setback.site).toBe(true);
    expect(setback.id).not.toBe(site.id);
    expect(setback.scale).toBe(500);
    // The note is printed on the sheet itself: the sheet holds the ground-floor cut a second time, the Abstandsflächen are the person's to draw.
    expect(sheetOf('bw', SETBACK).notes).toEqual(['Setback note: the Abstandsflächen are to be drawn']);
    expect(sets.get('bw')!.document.views.filter((v) => v.kind === 'plan' && v.site).length).toBe(2);
    expect(sets.get('bayern')!.document.views.filter((v) => v.kind === 'plan' && v.site).length).toBe(1);
  });

  it('marks what the model produces as drawn; the Lageplan and the Abstandsflächenplan are sheets made, never drawn', () => {
    const rows = (land: GermanyLand, sheets = sets.get(land)!.document.sheets) => germanyCoverage(sheets, sets.get(land)!.document.views, land);
    const drawn = (land: GermanyLand) => rows(land).filter((r) => r.drawn).map((r) => r.item.id);
    const made = (land: GermanyLand, sheets?: DefaultSet['document']['sheets']) => rows(land, sheets).filter((r) => r.sheetMade).map((r) => r.item.id);
    for (const land of ['bayern', 'nrw', 'bw'] as const) expect(drawn(land), land).toEqual(['plans', 'sections', 'facades']);
    expect(made('bayern')).toEqual(['sitePlan']);
    expect(made('nrw')).toEqual(['sitePlan']);
    expect(made('bw')).toEqual(['sitePlan', 'setbackSheet']);
    // Neither site-plan item is `drawn`, whatever is placed: the plot, the distances and the Abstandsflächen are not in the model.
    for (const id of ['sitePlan', 'setbackSheet']) expect(rows('bw').find((r) => r.item.id === id)!.state, id).toBe('no');
    const bw = sets.get('bw')!.document;
    expect(germanyCoverage([], bw.views, 'bw').some((r) => r.drawn || r.sheetMade)).toBe(false);
    // The second site plan is not enough for the sheet if it is on no sheet: only the Lageplan sheet is placed.
    const withoutSetback = bw.sheets.filter((s) => s.name !== SETBACK);
    expect(made('bw', withoutSetback)).toEqual(['sitePlan']);
  });

  it('does not hold the plans when a storey has none on a sheet, and names it', () => {
    const { document: doc, levels } = sets.get('bayern')!;
    const lastLevel = levels[levels.length - 1].name;
    const top = doc.views.find((v) => v.kind === 'plan' && !v.site && v.level.name === lastLevel)!;
    const sheets = doc.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId !== top.id) }));
    const plans = germanyCoverage(sheets, doc.views, 'bayern').find((r) => r.item.id === 'plans')!;
    expect(plans.drawn).toBe(false);
    expect(plans.missingStoreys).toEqual([lastLevel]);
  });

  it('applies to views that already hold one site plan: BW says the Abstandsflächenplan was left out, never drops it silently', () => {
    const one = sets.get('bayern')!.document.views;
    const applied = applySetTemplate(germanySetTemplate(NAMES, 'bw'), { views: one, extent: model.extent!, now: 0 });
    expect(applied.sheets.map((s) => s.name)).toEqual(['Floor plans', 'Sections', 'Elevations', SITE]);
    expect(applied.notes).toEqual([{ key: 'setTemplate.note.skipped.site', params: { sheet: SETBACK, place: 2 } }]);
    // With the second site plan in the project, the sheet is made and nothing is said.
    const both = applySetTemplate(germanySetTemplate(NAMES, 'bw'), { views: sets.get('bw')!.document.views, extent: model.extent!, now: 0 });
    expect(both.sheets.map((s) => s.name)).toEqual(['Floor plans', 'Sections', 'Elevations', SITE, SETBACK]);
    expect(both.notes).toEqual([]);
  });
});
