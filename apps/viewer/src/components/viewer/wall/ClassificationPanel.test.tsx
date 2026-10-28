/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The classification editor in the project drawer and the schedule's card (#89), over the FZK-Haus: add a system, the model's classes, types and
 * materials listed with the ones that have no code marked, a code typed on blur, one code for every type of a class, a CSV imported with the rows
 * it did not take listed, the schedule's card. Texts in both languages come from catalogue files. Every code is an EXAMPLE made up for the test.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, click, render, type as typeInto, blur } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { classificationEn } from '@/i18n/catalogues/classification.en';
import { classificationRo } from '@/i18n/catalogues/classification.ro';
import { ClassificationPanel } from './ClassificationPanel';
import { TypeClassificationCard } from './TypeClassificationCard';

const TYPE_240 = 'Leichtbeton 102890359 240';
const state = () => useProjectStore.getState();
const rules = () => state().classificationMappings![0].rules;
const button = (ui: HTMLElement, text: string | RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  assert.ok(b, `a button ${String(text)}`);
  return b;
};
const field = (ui: HTMLElement, label: string) => ui.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(select, value); select.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const row = (ui: HTMLElement, name: string) => [...ui.querySelectorAll('li')].find((li) => li.querySelector('span')?.textContent === name)!;

async function mount() {
  seedModel('fzk', 0, await parseStep(new Uint8Array(readFileSync(new URL('../../../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url)))), 1);
  const ui = render(<ClassificationPanel />);
  ui.querySelector('details')!.open = true;
  type(field(ui, 'New system'), 'Uniclass');
  typeInto(field(ui, 'Edition of the new system'), '2015');
  click(button(ui, 'Add system'));
  return ui;
}
const type = typeInto;

beforeEach(() => {
  resetProject();
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

describe('the classification editor', () => {
  it('adds a system and lists the model\'s types with the ones that have no code marked, then a code typed on blur marks it done', async () => {
    const ui = await mount();
    assert.deepEqual(state().classificationMappings!.map((m) => [m.system.name, m.system.edition, m.rules.length]), [['Uniclass', '2015', 0]]);
    const wall = row(ui, TYPE_240);
    assert.ok(wall.hasAttribute('data-unmapped'), 'no code yet: highlighted');
    assert.match(ui.textContent ?? '', /\d+ of \d+ have no code yet\./);
    const code = wall.querySelector<HTMLInputElement>(`input[aria-label="Code of ${TYPE_240}"]`)!;
    type(code, 'EXAMPLE-Ss_25');
    blur(code);
    assert.deepEqual(rules(), [{ by: 'type', match: TYPE_240, code: 'EXAMPLE-Ss_25' }]);
    assert.ok(!row(ui, TYPE_240).hasAttribute('data-unmapped'), 'mapped: no longer highlighted');
    // The title can be typed once there is a code; clearing the code removes the rule.
    const title = row(ui, TYPE_240).querySelector<HTMLInputElement>(`input[aria-label="Title of ${TYPE_240}"]`)!;
    type(title, 'EXAMPLE: wall systems');
    blur(title);
    assert.equal(rules()[0].title, 'EXAMPLE: wall systems');
    const cleared = row(ui, TYPE_240).querySelector<HTMLInputElement>(`input[aria-label="Code of ${TYPE_240}"]`)!;
    type(cleared, '');
    blur(cleared);
    assert.deepEqual(rules(), []);
  });

  it('lists the classes and the materials of the model on their own tabs', async () => {
    const ui = await mount();
    click(button(ui, 'IFC class'));
    assert.ok(row(ui, 'IfcWallStandardCase') && row(ui, 'IfcDoor'), 'the model\'s classes');
    click(button(ui, 'Material'));
    assert.ok(ui.querySelectorAll('li[data-unmapped]').length > 0, 'the model\'s materials, with no code');
  });

  it('gives one code to every type of a class at once', async () => {
    const ui = await mount();
    choose(ui.querySelector<HTMLSelectElement>('select[aria-label="IFC class of the types"]')!, 'IfcWall');
    type(field(ui, 'Code for all of them'), 'EXAMPLE-Ss_25');
    type(field(ui, 'Title for all of them'), 'EXAMPLE: wall systems');
    click(button(ui, 'Set for 2 types'));
    assert.deepEqual(rules().map((r) => [r.by, r.match, r.code, r.title]), [
      ['type', 'Leichtbeton 102890359 240', 'EXAMPLE-Ss_25', 'EXAMPLE: wall systems'], ['type', 'Leichtbeton 102890359 300', 'EXAMPLE-Ss_25', 'EXAMPLE: wall systems'],
    ]);
  });

  it('imports a CSV and lists the rows it did not take, with their numbers, instead of dropping them', async () => {
    const ui = await mount();
    const input = ui.querySelector<HTMLInputElement>('input[type=file]')!;
    const csv = 'code,title,class,type,material\nEXAMPLE-1,EXAMPLE: doors,IfcDoor,,\n,EXAMPLE: no code,IfcSlab,,\nEXAMPLE-3,,Wall,,';
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([csv], 'codes.csv')] });
    await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(rules().map((r) => [r.by, r.match, r.code]), [['class', 'IfcDoor', 'EXAMPLE-1']]);
    const status = ui.querySelector('output')!.textContent ?? '';
    assert.match(status, /1 codes imported\./);
    assert.match(status, /2 rows were not taken:/);
    assert.match(status, /Row 3: no code for IfcSlab/);
    assert.match(status, /Row 4: Wall is not an IFC class name/);
  });

  it('removes a system, and "use on tags" puts one first', async () => {
    const ui = await mount();
    type(field(ui, 'New system'), 'Office');
    click(button(ui, 'Add system'));
    assert.equal(state().classificationMappings!.length, 2);
    click(button(ui, 'Use on tags'));
    assert.deepEqual(state().classificationMappings!.map((m) => m.system.name), ['Office', 'Uniclass']);
    click(ui.querySelector('button[aria-label="Remove the system Office"]')!);
    assert.deepEqual(state().classificationMappings!.map((m) => m.system.name), ['Uniclass']);
  });
});

describe('the schedule\'s card', () => {
  it('turns the column on, chooses the system and groups; only quantities by type have it', async () => {
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
    addScheduleToSet('types', 'Quantities by type');
    addScheduleToSet('materials', 'Takeoff');
    const [types, takeoff] = [state().schedules!.find((s) => s.kind === 'types')!, state().schedules!.find((s) => s.kind === 'materials')!];
    const none = render(<TypeClassificationCard schedule={takeoff} />);
    assert.equal(none.querySelector('button'), null, 'nothing for a takeoff');
    const ui = render(<TypeClassificationCard schedule={types} />);
    const toggle = () => [...ui.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    // The card is a disclosure: open it as a person does.
    click(ui.querySelector('button')!);
    click(toggle()[0]);
    assert.deepEqual(state().schedules!.find((s) => s.id === types.id)!.classification, {});
  });
});

describe('the words', () => {
  it('Romanian says everything English does, with the same placeholders, and Romanian diacritics are comma-below', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [key, en] of Object.entries(classificationEn)) {
      const ro = (classificationRo as Record<string, string>)[key];
      assert.ok(ro, `${key} in Romanian`);
      assert.equal(placeholders(ro), placeholders(en as string), `${key} placeholders`);
      assert.ok(!/[şţŞŢ]/.test(ro), `${key} uses comma-below diacritics`);
    }
    assert.deepEqual(Object.keys(classificationRo).sort(), Object.keys(classificationEn).sort());
  });

  it('the editor reads in Romanian', async () => {
    const ui = await mount();
    act(() => setLocale('ro'));
    assert.match(ui.textContent ?? '', /Coduri de clasificare/);
    assert.ok(ui.querySelector('input[aria-label="Sistem nou"]'), 'the fields are named in Romanian');
    assert.match(ui.textContent ?? '', /din \d+ nu au încă cod\./);
  });
});
