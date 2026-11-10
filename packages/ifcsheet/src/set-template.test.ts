/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Set template rules (#21) on buildings made of numbers, so they run without a
 * model file: a storey is found from the ground storey, not by its place in
 * the list (a basement shifts every place by one), a section by its place
 * among the set's sections, and a rule that finds nothing is skipped and said.
 */

import { describe, expect, it } from 'vitest';
import { captureSetTemplate, findAllByRule, findByRule, generateDefaultSet, parseSetTemplate, serializeSetTemplate, type SetModel, type SetTemplate } from './index.js';

const EXTENT = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 9, z: 8 } };
const model = (...storeys: [string, number][]): SetModel => ({
  projectName: 'Block', storeys: storeys.map(([name, elevation]) => ({ name, elevation })), extent: EXTENT, proposalInput: () => null,
});

/** The office's plans: the ground storey and the one above, on A1 at 1:200. */
const OFFICE: SetTemplate = {
  name: 'Office', schedules: [], annotations: {},
  sheets: [{ name: 'Office plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [{ view: { kind: 'plan', storey: 0 }, scale: 200 }, { view: { kind: 'plan', storey: 1 }, scale: 200 }] }],
};

const planSheets = (made: ReturnType<typeof generateDefaultSet>) => made!.document.sheets.filter((s) => s.series === 'plans').map((s) => [s.name, (s.viewports ?? []).map((vp) => made!.document.views.find((v) => v.id === vp.viewId)?.name)]);

describe('a plan is found from the ground storey, not by its place in the list', () => {
  it('a basement is a storey the template did not foresee; it does not push the ground storey out of its slot', () => {
    const made = generateDefaultSet(model(['Basement', -3], ['Ground', 0], ['First', 3], ['Roof', 6]), { setTemplate: OFFICE, now: 0 });
    expect(planSheets(made)).toEqual([['Office plans', ['Ground', 'First']], ['Floor plans', ['Basement', 'Roof']]]);
    expect(made!.notes.find((n) => n.key === 'setTemplate.note.defaulted')?.params).toEqual({ series: 'plans', names: 'Basement, Roof' });
  });

  it('a building of one storey meets the first rule and not the second, which is skipped and said', () => {
    const made = generateDefaultSet(model(['Ground', 0]), { setTemplate: OFFICE, now: 0 });
    expect(planSheets(made)).toEqual([['Office plans', ['Ground']]]);
    expect(made!.notes.filter((n) => n.key.startsWith('setTemplate.note.skipped')).map((n) => [n.key, n.params])).toEqual([['setTemplate.note.skipped.plan', { sheet: 'Office plans', storey: '+1' }]]);
  });

  it('a rule below the ground finds a basement; the same template on a building without one skips it', () => {
    const withBasement: SetTemplate = { ...OFFICE, sheets: [{ ...OFFICE.sheets[0], slots: [{ view: { kind: 'plan', storey: -1 } }, ...OFFICE.sheets[0].slots] }] };
    expect(planSheets(generateDefaultSet(model(['Basement', -3], ['Ground', 0], ['First', 3]), { setTemplate: withBasement, now: 0 }))).toEqual([['Office plans', ['Basement', 'Ground', 'First']]]);
    const made = generateDefaultSet(model(['Ground', 0], ['First', 3]), { setTemplate: withBasement, now: 0 });
    expect(planSheets(made)).toEqual([['Office plans', ['Ground', 'First']]]);
    expect(made!.notes.map((n) => [n.key, n.params.storey])).toContainEqual(['setTemplate.note.skipped.plan', -1]);
  });
});

describe('a template is taken out of a project by the same rule', () => {
  it('a basement is storey -1 and the storey above the ground +1, whatever the list holds below', () => {
    const made = generateDefaultSet(model(['Basement', -3], ['Ground', 0], ['First', 3]), { now: 0 })!;
    const template = captureSetTemplate({ name: 'T', views: made.document.views, sheets: made.document.sheets });
    expect(template.sheets.flatMap((s) => s.slots.flatMap((sl) => (sl.view.kind === 'plan' ? [sl.view.storey] : [])))).toEqual([-1, 0, 1]);
  });

  it('a view no rule can name (a detail, the site plan, a 3D view) is left out; a sheet of nothing else is not saved', () => {
    const made = generateDefaultSet(model(['Ground', 0]), { now: 0 })!;
    const views = made.document.views.map((v) => (v.kind === 'plan' ? { ...v, detail: { of: 'x', min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, number: 1 } } : v));
    const template = captureSetTemplate({ name: 'T', views, sheets: made.document.sheets });
    expect(template.sheets.some((s) => s.series === 'plans')).toBe(false);
  });
});

describe('the file', () => {
  it('keeps a rule, a scale and a layout through a round trip', () => {
    const text = serializeSetTemplate(OFFICE, new Date(0));
    expect(parseSetTemplate(text)).toEqual(OFFICE);
  });

  it('is refused with the place of the problem, and a file from a newer version says so', () => {
    expect(() => parseSetTemplate(JSON.stringify({ format: 'bvset', version: 1, name: 'x', sheets: [{ name: 'P', series: 'details', layout: { paper: 'A1' }, slots: [] }] }))).toThrow('/sheets/0/series');
    expect(() => parseSetTemplate(JSON.stringify({ format: 'bvset', version: 9, name: 'x' }))).toThrow('made by a newer version');
  });
});

describe('the site rule finds the site plan, never a detail of it', () => {
  const level = { name: 'Ground', elevation: 0, storeyGlobalIds: ['g0'] };
  const site = { id: 'site-1', name: 'Site', kind: 'plan' as const, createdAt: 0, level, cutHeight: 1.2, site: true as const };
  const detailOfSite = { ...site, id: 'site-detail', name: 'Site detail', detail: { number: 1, sourceViewId: 'site-1', area: { min: { x: 0, y: 0 }, max: { x: 2, y: 2 } } } } as unknown as typeof site;

  it('skips a detail even when it comes first, and finds none when only a detail exists', () => {
    expect(findByRule({ kind: 'site' }, [detailOfSite, site])?.id).toBe('site-1');
    expect(findAllByRule({ kind: 'site' }, [detailOfSite, site]).map((v) => v.id)).toEqual(['site-1']);
    expect(findByRule({ kind: 'site' }, [detailOfSite])).toBeNull();
    expect(findByRule({ kind: 'site' }, [])).toBeNull();
  });

  it('finds a further site plan by `nth`, in the order the views are in, and none past the last', () => {
    const second = { ...site, id: 'site-2', name: 'Site 2' };
    expect(findByRule({ kind: 'site', nth: 1 }, [site, detailOfSite, second])?.id).toBe('site-2');
    expect(findByRule({ kind: 'site', nth: 1 }, [site])).toBeNull();
    expect(findByRule({ kind: 'site', nth: 0 }, [site, second])?.id).toBe('site-1');
  });

  it('reads `nth` from the file as a whole number from 1, and refuses anything else', () => {
    const file = (nth: unknown) => JSON.stringify({ format: 'bvset', version: 1, name: 'x', sheets: [{ name: 'S', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [{ view: { kind: 'site', nth } }] }] });
    expect(parseSetTemplate(file(1)).sheets[0].slots[0].view).toEqual({ kind: 'site', nth: 1 });
    expect(parseSetTemplate(file(undefined)).sheets[0].slots[0].view).toEqual({ kind: 'site' });
    for (const bad of [0, -1, 1.5, '1']) expect(() => parseSetTemplate(file(bad)), String(bad)).toThrow('/nth');
  });
});

describe('a sheet rule\'s notes', () => {
  const rule = (notes?: string[]): SetTemplate => ({
    name: 'Notes', schedules: [], annotations: {},
    sheets: [{ name: 'Site', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [{ view: { kind: 'allPlans' }, scale: 200 }], ...(notes ? { notes } : {}) }],
  });

  it('are printed on the sheet, survive the .bvset file, and are absent when the rule has none', () => {
    const made = generateDefaultSet(model(['Ground', 0]), { setTemplate: rule(['First line', 'Second line']), now: 0 })!;
    expect(made.document.sheets.map((s) => [s.name, s.notes])).toEqual([['Site', ['First line', 'Second line']]]);
    expect(parseSetTemplate(serializeSetTemplate(rule(['First line', 'Second line']))).sheets[0].notes).toEqual(['First line', 'Second line']);
    expect(generateDefaultSet(model(['Ground', 0]), { setTemplate: rule(), now: 0 })!.document.sheets[0].notes).toBeUndefined();
    expect('notes' in parseSetTemplate(serializeSetTemplate(rule())).sheets[0]).toBe(false);
  });
});
