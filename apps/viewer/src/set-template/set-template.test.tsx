/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A set template in the app (#21): an office's set is saved from a project of
 * two storeys, goes through its file, and makes the set of a project of four.
 * The sheets follow the rules; a rule the new building cannot meet is skipped
 * and said; the whole of it is the project's starting state, not an undo step;
 * with no template armed the start is the automatic one. The Wall's save and
 * choose panels and the words of the report, in English and Romanian.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SEQUENTIAL_SCHEME, parseSetTemplate, serializeSetTemplate, type SetTemplate } from '@bimvoice/ifcsheet';
import { cleanup, click, render, type } from '@/test/render.js';
import { undoDrafts } from '@/drafting/draft-store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { NewFromTemplate, SetTemplateSave, TemplateReport } from '@/components/viewer/wall/SetTemplate';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { defaultViews } from '@/project/view-defaults';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { captureProjectTemplate } from './capture';
import { armTemplate, forgetTemplate, keepTemplate, readKept, useSetTemplates } from './store';
import { startSet } from './start';

const two: ProjectLevel[] = [{ name: 'Ground', elevation: 0, storeyGlobalIds: ['L0'] }, { name: 'Upper', elevation: 3, storeyGlobalIds: ['L1'] }];
const four: ProjectLevel[] = [...two, { name: 'Second', elevation: 6, storeyGlobalIds: ['L2'] }, { name: 'Third', elevation: 9, storeyGlobalIds: ['L3'] }];
const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const TOWER: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 12, z: 7 } };

function project(levels: ProjectLevel[]): void {
  resetProject();
  useSetTemplates.setState({ pending: null, report: null, kept: [] });
  useProjectStore.setState({ levels, views: defaultViews(levels) });
}

const state = () => useProjectStore.getState();
const slotsOf = (sheet: ProjectSheet) => (sheet.viewports ?? []).map((vp) => `${state().views.find((v) => v.id === vp.viewId)?.name}@${vp.scale}`);
const rows = () => state().sheets.map((s) => [s.number, s.name, s.paper, ...slotsOf(s)]);

/** The office's project: two storeys, started automatically, then its plans moved to A1 at 1:200 under their own name. */
function officeTemplate(): SetTemplate {
  project(two);
  assert.ok(startDrawingSet(null, HOUSE));
  useProjectStore.setState((s) => ({
    sheets: s.sheets.map((sh) => (sh.series === 'plans' ? { ...sh, name: 'Office plans', paper: 'A1' as const, viewports: (sh.viewports ?? []).map((vp) => ({ ...vp, scale: 200 })) } : sh)),
  }));
  // The file is what travels: the template is read back from its text.
  return parseSetTemplate(serializeSetTemplate(captureProjectTemplate('Office')));
}

beforeEach(() => { registerLocale('ro', checkCatalogue(ro).catalogue); setLocale('en'); });
afterEach(() => cleanup());

describe('a set template made in one project makes the set of another (#21)', () => {
  it('saves rules: the plans by storey from the ground, the elevations by direction', () => {
    const template = officeTemplate();
    assert.deepEqual(template.sheets.map((s) => [s.name, s.series, s.layout.paper, s.slots.map((sl) => `${JSON.stringify(sl.view)}@${sl.scale}`)]), [
      ['Office plans', 'plans', 'A1', ['{"kind":"plan","storey":0}@200', '{"kind":"plan","storey":1}@200']],
      ['Elevations, south and north', 'elevations', 'A3', ['{"kind":"elevation","direction":"south"}@100', '{"kind":"elevation","direction":"north"}@100']],
      ['Elevations, east and west', 'elevations', 'A3', ['{"kind":"elevation","direction":"east"}@50', '{"kind":"elevation","direction":"west"}@50']],
      ['Sections', 'sections', 'A3', ['{"kind":"section","place":0}@50']],
    ]);
  });

  it('on four storeys: the plans take the template\'s paper and scale, the two storeys it did not foresee get the default', () => {
    const template = officeTemplate();
    project(four);
    armTemplate(template);
    assert.ok(startSet(null, TOWER));
    assert.deepEqual(rows().slice(0, 2), [
      ['A-101', 'Office plans', 'A1', 'Ground@200', 'Upper@200'],
      ['A-102', 'Floor plans', 'A1', 'Second@200', 'Third@200'],
    ]);
    assert.deepEqual(state().views.filter((v) => v.kind === 'plan').map((v) => v.scale), [200, 200, 200, 200], 'a plan is drawn at the scale of its sheet');
    const { report } = useSetTemplates.getState();
    assert.equal(report?.template, 'Office');
    assert.deepEqual(report?.notes.filter((n) => n.key === 'setTemplate.note.defaulted').map((n) => n.params.names), ['Second, Third']);
    // The tower is taller than the office's A3 sheets hold at 1:50: those sheets take the scale that fits, and say so.
    assert.deepEqual(report?.notes.filter((n) => n.key === 'setTemplate.note.rescaled').map((n) => [n.params.wanted, n.params.used]), [[50, 100], [50, 100]]);
  });

  it('on a building with a basement: the ground storey keeps its slot, the basement is the storey nobody foresaw', () => {
    const template = officeTemplate();
    project([{ name: 'Basement', elevation: -3, storeyGlobalIds: ['B'] }, ...two]);
    armTemplate(template);
    assert.ok(startSet(null, { ...HOUSE, min: { ...HOUSE.min, y: -3 } }));
    assert.deepEqual(rows().slice(0, 2), [
      ['A-101', 'Office plans', 'A1', 'Ground@200', 'Upper@200'],
      ['A-102', 'Floor plans', 'A1', 'Basement@200'],
    ]);
  });

  it('on one storey: the rule with no storey is skipped and said, and the sheet keeps the one it found', () => {
    const template = officeTemplate();
    project([two[0]]);
    armTemplate(template);
    assert.ok(startSet(null, { ...HOUSE, max: { ...HOUSE.max, y: 3 } }));
    assert.deepEqual(rows()[0], ['A-101', 'Office plans', 'A1', 'Ground@200']);
    assert.deepEqual(useSetTemplates.getState().report?.notes.map((n) => [n.key, n.params.storey]), [['setTemplate.note.skipped.plan', '+1']]);
  });

  it('is the starting state: nothing to undo, and the template is used once', () => {
    const template = officeTemplate();
    project(four);
    armTemplate(template);
    startSet(null, TOWER);
    assert.equal(undoDrafts(), false, 'the set is no undo step');
    assert.equal(useSetTemplates.getState().pending, null);
    const first = rows().map((r) => r.slice(0, 3));
    project(four);
    startSet(null, TOWER);
    assert.notDeepEqual(rows().map((r) => r.slice(0, 3)), first, 'a second model gets the automatic set');
  });

  it('with no template armed, the start is the automatic one, to the sheet', () => {
    project(four);
    startDrawingSet(null, TOWER);
    const auto = rows().map((r) => r.slice(0, 3).concat(r.slice(3)));
    project(four);
    assert.ok(startSet(null, TOWER));
    assert.deepEqual(rows(), auto);
    assert.equal(useSetTemplates.getState().report, null);
  });

  it('applies the numbering, the schedules by kind and the title block parameters the template carries; one it cannot read is left out and said', () => {
    const template: SetTemplate = {
      ...officeTemplate(),
      numbering: SEQUENTIAL_SCHEME,
      schedules: [{ kind: 'register', name: 'Drawing list', sheet: { name: 'Drawing list', layout: { paper: 'A3', orientation: 'landscape' } } }, { kind: 'types', name: 'Types', scale: 100, sheet: { name: 'Types', layout: { paper: 'A3', orientation: 'landscape' } } }],
      carried: { titleBlockParams: [{ name: 'Phase', value: 'DTAC' }], tagFields: 'not an object' },
    };
    project(four);
    armTemplate(template);
    startSet(null, TOWER);
    assert.deepEqual((state().schedules ?? []).map((s) => [s.kind, s.name]), [['types', 'Types'], ['register', 'Drawing list']].sort());
    assert.ok(state().sheets.some((s) => s.series === 'schedules' && s.name === 'Types'), 'the types schedule hangs on a sheet of the schedules series');
    assert.deepEqual(state().sheetNumbering, SEQUENTIAL_SCHEME);
    assert.deepEqual(state().sheets.filter((sh) => sh.series !== 'schedules' && sh.series !== 'general').map((sh) => sh.number).slice(0, 3), ['A01', 'A02', 'A03']);
    assert.deepEqual(state().titleBlockParams, [{ name: 'Phase', value: 'DTAC' }]);
    assert.deepEqual(useSetTemplates.getState().report?.notes.filter((n) => n.key === 'setTemplate.note.carried').map((n) => n.params.what), ['tag fields']);
    assert.equal(state().tagFields, undefined);
  });

  it('captures the schedules by kind, the numbering and the annotation commands the views carry', () => {
    project(two);
    startDrawingSet(null, HOUSE);
    const plan = state().views.find((v) => v.kind === 'plan')!;
    const planIds = state().views.filter((v) => v.kind === 'plan').map((v) => v.id);
    useProjectStore.setState((s) => ({
      drafts: planIds.map((viewId) => ({ id: `d-${viewId}`, viewId, layerId: 'l', shape: { type: 'text', p: { x: 0, y: 0 }, text: 'x', height: 1, rotation: 0 }, params: { atype: 'tagall-mark', labelOf: 'G1' } })),
      sheetNumbering: s.sheetNumbering,
    }) as never);
    useProjectStore.setState({ drafts: [...state().drafts, { id: 'd-dim', viewId: plan.id, layerId: 'l', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: { dimAll: 'k' } }] });
    const template = captureProjectTemplate('Office');
    assert.deepEqual(template.annotations, { plans: ['tagAll'] }, 'DIMALL ran on one plan only, so the series is not said to carry it');
  });
});

describe('the Wall\'s set template panels (#21)', () => {
  it('Save as set template: says what the rules are, keeps a copy in this browser', () => {
    project(two);
    startDrawingSet(null, HOUSE);
    const ui = render(<SetTemplateSave />);
    assert.match(ui.querySelector('[data-testid="set-template-summary"]')?.textContent ?? '', /Sheets: 4\. Drawings found by rule: 7\. Schedules: 0\./);
    const name = ui.querySelector('input') as HTMLInputElement;
    type(name, 'Office');
    const keep = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Keep in this browser')!;
    click(keep);
    assert.deepEqual(useSetTemplates.getState().kept.map((k) => k.template.name), ['Office']);
    assert.match(ui.querySelector('output')?.textContent ?? '', /Kept in this browser as Office/);
    assert.deepEqual(readKept({ getItem: () => JSON.stringify(useSetTemplates.getState().kept.map((k) => k.text)) }).map((k) => k.template.name), ['Office']);
    forgetTemplate('Office');
    assert.deepEqual(useSetTemplates.getState().kept, []);
  });

  it('says there is nothing to save when no plan, elevation or section is on a sheet', () => {
    project(two);
    const ui = render(<SetTemplateSave />);
    assert.match(ui.textContent ?? '', /no rules to save/);
    assert.equal([...ui.querySelectorAll('button')].every((b) => b.disabled), true);
  });

  it('New project from a set template: a kept template is chosen, then the model; the report says what the rules met', () => {
    project(two);
    keepTemplate(officeTemplate());
    const ui = render(<NewFromTemplate />);
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Use Office')!);
    assert.equal(useSetTemplates.getState().pending?.name, 'Office');
    assert.match(ui.textContent ?? '', /The template Office is ready/);
    assert.ok([...ui.querySelectorAll('label')].some((l) => l.textContent?.includes('Choose the model (.ifc)')));
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Do not use the template')!);
    assert.equal(useSetTemplates.getState().pending, null);
  });

  it('the report reads in the installed language: English, then Romanian', () => {
    const template = officeTemplate();
    project(four);
    armTemplate(template);
    startSet(null, TOWER);
    const english = render(<TemplateReport />).textContent ?? '';
    assert.match(english, /Made from the template Office/);
    assert.match(english, /laid out the way the automatic set does, on the paper and at the scale of the last plans sheet of the template: Second, Third/);
    cleanup();
    setLocale('ro');
    const romanian = render(<TemplateReport />).textContent ?? '';
    assert.match(romanian, /Făcut după șablonul Office/);
    assert.match(romanian, /seria planuri|seria plan/);
  });
});
