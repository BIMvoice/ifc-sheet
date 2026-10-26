/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A set template (#21) carried between real models. An office's set is made on
 * AC20-FZK-Haus (two storeys): the plans on A1 at 1:200 under their own name,
 * the east and west elevations before the south and north ones, the sections
 * on A2. Applied to Duplex (a foundation, two levels and a roof) and bloc-p4
 * (five storeys), the sheets, slots and scales follow the rules; a storey the
 * template did not foresee gets the automatic set's treatment; a rule the
 * model cannot meet is skipped and reported. Duplex is read from the ifc-lite
 * checkout when it is there (`IFC_LITE_MODELS`) and skipped when not.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEQUENTIAL_SCHEME, captureSetTemplate, generateDefaultSet, parseSetTemplate, serializeSetTemplate, type DefaultSet, type SetTemplate } from './index.js';
import { openModel, type OpenedModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const DUPLEX = join(process.env.IFC_LITE_MODELS ?? join(homedir(), 'dev/ifclite/tests/models'), 'ara3d', 'duplex.ifc');
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const noWasm = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
const NOW = Date.UTC(2026, 9, 25);

/** What a sheet is, as the layout made it: number, name, paper, orientation and each slot's view name, scale and place. */
function rows(set: DefaultSet) {
  const { views, sheets } = set.document;
  return sheets.map((s) => ({
    number: s.number, name: s.name, paper: s.paper, orientation: s.orientation,
    slots: (s.viewports ?? []).map((vp) => ({ view: views.find((v) => v.id === vp.viewId)?.name, scale: vp.scale, x: +vp.x.toFixed(6), y: +vp.y.toFixed(6) })),
  }));
}

/**
 * The office's set: FZK-Haus's automatic set, then changed by hand the way an office would: the plans renamed, on A1 at 1:200,
 * the east and west elevations first, the sections on A2.
 */
function officeSet(auto: DefaultSet): DefaultSet {
  const sheets = auto.document.sheets.map((s) => {
    const retarget = (paper: 'A1' | 'A2', scale: number) => ({ ...s, paper, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, scale })) });
    if (s.series === 'plans') return { ...retarget('A1', 200), name: 'Office plans' };
    if (s.series === 'sections') return retarget('A2', 200);
    return s;
  });
  const [plans, southNorth, eastWest, sections] = sheets;
  return { ...auto, document: { ...auto.document, sheets: [plans, eastWest, southNorth, sections] } };
}

const set = (model: OpenedModel, setTemplate?: SetTemplate): DefaultSet => {
  const made = generateDefaultSet(model, { now: NOW, ...(setTemplate ? { setTemplate } : {}) });
  if (!made) throw new Error('no set: the model has no extent');
  return made;
};

describe.skipIf(noWasm !== null)('a set template carried between FZK-Haus, Duplex and bloc-p4 (#21)', () => {
  let fzk: OpenedModel;
  let bloc: OpenedModel;
  let duplex: OpenedModel | null = null;
  let template: SetTemplate;
  let blocTemplate: SetTemplate;

  beforeAll(async () => {
    fzk = await openModel(new Uint8Array(readFileSync(FZK)));
    bloc = await openModel(new Uint8Array(readFileSync(BLOC)));
    if (existsSync(DUPLEX)) duplex = await openModel(new Uint8Array(readFileSync(DUPLEX)));
    const office = officeSet(set(fzk));
    template = captureSetTemplate({ name: 'Office', views: office.document.views, sheets: office.document.sheets });
    const blocAuto = set(bloc);
    blocTemplate = captureSetTemplate({ name: 'Bloc', views: blocAuto.document.views, sheets: blocAuto.document.sheets });
  }, 300_000);

  it('saves rules, not views: a plan per storey from the ground, the elevations by direction, the sections by place', () => {
    expect(template.sheets.map((s) => [s.name, s.series, s.layout.paper, s.slots.map((sl) => [JSON.stringify(sl.view), sl.scale])])).toEqual([
      ['Office plans', 'plans', 'A1', [['{"kind":"plan","storey":0}', 200], ['{"kind":"plan","storey":1}', 200]]],
      ['Elevations, east and west', 'elevations', 'A3', [['{"kind":"elevation","direction":"east"}', 100], ['{"kind":"elevation","direction":"west"}', 100]]],
      ['Elevations, south and north', 'elevations', 'A3', [['{"kind":"elevation","direction":"south"}', 100], ['{"kind":"elevation","direction":"north"}', 100]]],
      ['Sections', 'sections', 'A2', [['{"kind":"section","place":0}', 200], ['{"kind":"section","place":1}', 200]]],
    ]);
    expect(JSON.stringify(template)).not.toMatch(/view-|"id"/);
  });

  it('round-trips through the file unchanged', () => {
    const text = serializeSetTemplate(template, new Date(NOW));
    expect(parseSetTemplate(text)).toEqual(template);
    expect(serializeSetTemplate(parseSetTemplate(text), new Date(NOW))).toBe(text);
  });

  it('applied to the model it was saved from, makes the same set; nothing is added by a template that says what the automatic set says', () => {
    const auto = set(fzk);
    const same = captureSetTemplate({ name: 'Same', views: auto.document.views, sheets: auto.document.sheets });
    expect(rows(set(fzk, same))).toEqual(rows(auto));
    expect(set(fzk, same).notes.map((n) => n.key)).toEqual(auto.notes.map((n) => n.key));
  });

  it.skipIf(!existsSync(DUPLEX))('on Duplex: the sheets, slots and scales follow the rules; storeys the template did not foresee get the default', () => {
    const made = set(duplex!, template);
    const r = rows(made);
    // The ground storey is Level 1 (the foundation is -1): Level 1 and Level 2 take the template's two plan slots.
    expect(r.map((s) => [s.number, s.name, s.paper])).toEqual([
      ['A-101', 'Office plans', 'A1'], ['A-102', 'Floor plans', 'A1'], ['A-201', 'Elevations, east and west', 'A3'], ['A-202', 'Elevations, south and north', 'A3'], ['A-301', 'Sections', 'A2'],
    ]);
    expect(r[0].slots.map((s) => [s.view, s.scale])).toEqual([['Level 1', 200], ['Level 2', 200]]);
    // The foundation and the roof: on the plans series' paper, at its scale, as the automatic set pairs them.
    expect(r[1].slots.map((s) => [s.view, s.scale])).toEqual([['T/FDN', 200], ['Roof', 200]]);
    // The office's A3 sheet holds Duplex's elevations at 1:200 only, not at its 1:100: the sheet says so.
    expect(r[2].slots.map((s) => [s.view, s.scale])).toEqual([['East Elevation', 200], ['West Elevation', 200]]);
    expect(made.notes.filter((n) => n.key === 'setTemplate.note.rescaled').map((n) => n.params)).toContainEqual({ sheet: 'Elevations, east and west', wanted: 100, used: 200 });
    expect(r[4].slots.map((s) => s.scale)).toEqual([200, 200]);
    // What the template does not say is the automatic set's; what it does say differs from it.
    expect(rows(set(duplex!)).map((s) => s.name)).not.toEqual(r.map((s) => s.name));
    const defaulted = made.notes.find((n) => n.key === 'setTemplate.note.defaulted');
    expect(defaulted?.params).toEqual({ series: 'plans', names: 'T/FDN, Roof' });
    expect(made.notes.filter((n) => n.key.startsWith('setTemplate.note.skipped'))).toEqual([]);
    // A plan is drawn at the scale of its sheet.
    expect(made.document.views.filter((v) => v.kind === 'plan').map((v) => v.scale)).toEqual([200, 200, 200, 200]);
  });

  it('on bloc-p4 (five storeys): the storeys beyond the template get the default, on its paper at its scale', () => {
    const made = set(bloc, template);
    const r = rows(made);
    expect(r.slice(0, 3).map((s) => [s.number, s.name, s.paper, s.slots.map((sl) => `${sl.view}@${sl.scale}`)])).toEqual([
      ['A-101', 'Office plans', 'A1', ['Parter@200', 'Etaj 1@200']],
      ['A-102', 'Floor plans 1', 'A1', ['Etaj 2@200', 'Etaj 3@200']],
      ['A-103', 'Floor plans 2', 'A1', ['Etaj 4@200']],
    ]);
    expect(made.notes.find((n) => n.key === 'setTemplate.note.defaulted')?.params).toEqual({ series: 'plans', names: 'Etaj 2, Etaj 3, Etaj 4' });
  });

  it('a rule the model cannot meet is skipped and reported; a sheet that found nothing is not made', () => {
    const made = set(fzk, blocTemplate);
    const r = rows(made);
    expect(r.filter((s) => s.number.startsWith('A-1')).map((s) => [s.number, s.slots.map((sl) => sl.view)])).toEqual([['A-101', ['Erdgeschoss', 'Dachgeschoss']]]);
    const skipped = made.notes.filter((n) => n.key === 'setTemplate.note.skipped.plan');
    expect(skipped.map((n) => n.params.storey)).toEqual(['+2', '+3', '+4']);
    expect(skipped.map((n) => n.params.sheet)).toEqual(['Floor plans 2', 'Floor plans 2', 'Floor plans 3']);
  });

  it('a section the model does not offer is skipped, and a view in a series the template lacks is left off and said', () => {
    const noSections: SetTemplate = { ...template, sheets: template.sheets.filter((s) => s.series !== 'sections') };
    const made = set(fzk, noSections);
    expect(made.document.sheets.some((s) => s.series === 'sections')).toBe(false);
    expect(made.notes.find((n) => n.key === 'setTemplate.note.unplaced')?.params).toEqual({ series: 'sections', names: 'Section A-A, Section B-B' });
    const three: SetTemplate = { ...template, sheets: template.sheets.map((s) => (s.series === 'sections' ? { ...s, slots: [...s.slots, { view: { kind: 'section', place: 2 }, scale: 50 }] } : s)) };
    expect(set(fzk, three).notes.filter((n) => n.key === 'setTemplate.note.skipped.section').map((n) => n.params.place)).toEqual([3]);
  });

  it('a scale the drawings do not fit at is not forced: the sheet takes the one that fits, and says so', () => {
    const huge: SetTemplate = { ...template, sheets: template.sheets.map((s) => (s.series === 'plans' ? { ...s, layout: { ...s.layout, paper: 'A3' as const }, slots: s.slots.map((sl) => ({ ...sl, scale: 20 })) } : s)) };
    const made = set(fzk, huge);
    const plans = rows(made)[0];
    expect(plans.slots.every((s) => s.scale === 100)).toBe(true);
    expect(made.notes.find((n) => n.key === 'setTemplate.note.rescaled')?.params).toEqual({ sheet: 'Office plans', wanted: 20, used: 100 });
  });

  it('without a template the set is the automatic one, as before', () => {
    const auto = set(fzk);
    expect(rows(auto).map((s) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
    expect(auto.notes).toEqual([]);
    expect(rows(generateDefaultSet(fzk, { now: NOW })!)).toEqual(rows(auto));
  });

  it('numbers the sheets by the template\'s numbering, which the project then keeps', () => {
    const made = set(fzk, { ...template, numbering: SEQUENTIAL_SCHEME });
    expect(made.document.sheetNumbering).toEqual(SEQUENTIAL_SCHEME);
    expect(made.document.sheets.map((s) => s.number)).toEqual(['A01', 'A02', 'A03', 'A04']);
    expect(parseSetTemplate(serializeSetTemplate({ ...template, numbering: SEQUENTIAL_SCHEME })).numbering).toEqual(SEQUENTIAL_SCHEME);
  });
});

describe('the set template file refuses what it cannot use, with the place of the problem', () => {
  const good = (): Record<string, unknown> => JSON.parse(serializeSetTemplate({
    name: 'T', annotations: {}, schedules: [],
    sheets: [{ name: 'Plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [{ view: { kind: 'plan', storey: 0 }, scale: 50 }] }],
  }));
  const parse = (o: Record<string, unknown>): SetTemplate => parseSetTemplate(JSON.stringify(o));

  it.each([
    ['not JSON', 'nope', 'invalid JSON'],
    ['another format', JSON.stringify({ ...good(), format: 'bvlib' }), '/format'],
    ['a newer version', JSON.stringify({ ...good(), version: 2 }), 'newer version'],
    ['a slot without a rule', JSON.stringify({ ...good(), sheets: [{ ...(good().sheets as object[])[0], slots: [{ scale: 50 }] }] }), '/sheets/0/slots/0/view'],
    ['a storey that is not a whole number', JSON.stringify({ ...good(), sheets: [{ ...(good().sheets as object[])[0], slots: [{ view: { kind: 'plan', storey: 1.5 } }] }] }), '/sheets/0/slots/0/view/storey'],
    ['a sheet with no slots', JSON.stringify({ ...good(), sheets: [{ ...(good().sheets as object[])[0], slots: [] }] }), '/sheets/0/slots'],
    ['a scale of zero', JSON.stringify({ ...good(), sheets: [{ ...(good().sheets as object[])[0], slots: [{ view: { kind: 'plan', storey: 0 }, scale: 0 }] }] }), '/sheets/0/slots/0/scale'],
  ])('%s', (_what, text, place) => {
    expect(() => parseSetTemplate(text)).toThrow(place);
  });

  it('keeps what it carries but does not read, unchanged', () => {
    const carried = { titleBlockTemplate: { items: [{ kind: 'text', text: 'x' }] }, tagFields: { door: 'Mark' } };
    expect(parse({ ...good(), carried }).carried).toEqual(carried);
  });
});
