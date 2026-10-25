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
import { captureSetTemplate, generateDefaultSet, parseSetTemplate, serializeSetTemplate, type SetModel, type SetTemplate } from './index.js';

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
