/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project drawer's Materials section (#90): the materials of the loaded models with a swatch each, the controls that edit
 * them (each one undo step), reset for one and for all. The model is a wall of concrete, a 0.2 mm foil and mineral wool.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser } from '@ifc-lite/parser';
import { cleanup, click, render, type as typeInto, blur } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { resetSectionChoices } from './card-section-state';
import { MaterialsSection } from './MaterialsSection';

const STEP = [
  'ISO-10303-21;', 'HEADER;', "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
  "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);", '#2=IFCUNITASSIGNMENT((#3));', '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
  "#20=IFCMATERIAL('Concrete C25/30',$,$);", "#21=IFCMATERIAL('PE foil',$,$);", "#22=IFCMATERIAL('Mineral wool',$,$);",
  'ENDSEC;', 'END-ISO-10303-21;',
].join('\n');

async function loadModel(): Promise<void> {
  const bytes = new TextEncoder().encode(STEP);
  const dataStore = await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
  useViewerStore.setState({ models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: dataStore, visible: true, idOffset: 0, maxExpressId: 100 }]]), mutationViews: new Map() } as never);
}

const row = (ui: HTMLElement, name: string): HTMLElement => {
  const found = ui.querySelector<HTMLElement>(`[data-material="${name}"]`);
  assert.ok(found, `a row for ${name}`);
  return found;
};
const swatchPaths = (el: HTMLElement): string => [...el.querySelectorAll('[data-material-swatch] path')].map((p) => `${p.getAttribute('d')}|${p.getAttribute('fill')}|${p.getAttribute('stroke-width')}`).join('\n');
function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  assert.ok(setter);
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const control = (el: HTMLElement, label: string): HTMLElement => {
  const found = el.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  assert.ok(found, `a control "${label}"`);
  return found;
};
const table = () => useProjectStore.getState().materials ?? [];

let ui: HTMLElement;
beforeEach(async () => {
  resetProject();
  resetSectionChoices();
  clearDraftHistory();
  await loadModel();
  ui = render(<MaterialsSection />);
  openSection(ui, 'Building materials');
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('the Materials section lists the materials of the loaded models', () => {
  it('a row with a swatch for each, none edited yet', () => {
    const rows = [...ui.querySelectorAll('[data-material]')].map((r) => r.getAttribute('data-material'));
    assert.deepEqual(rows, ['Concrete C25/30', 'Mineral wool', 'PE foil']);
    for (const name of rows) assert.ok(row(ui, name!).querySelector('svg[data-material-swatch] path'), `${name} has a swatch`);
    assert.deepEqual(table(), []);
    assert.ok((row(ui, 'Concrete C25/30').textContent ?? '').includes('(auto)'));
  });

  it('says what it holds while it is closed', () => {
    cleanup();
    resetSectionChoices();
    useProjectStore.setState({ materials: [{ id: 'x', name: 'PE foil', membrane: true }] });
    ui = render(<MaterialsSection />);
    assert.ok((ui.textContent ?? '').includes('3 materials, 1 changed'), ui.textContent ?? '');
  });

  it('says so when the models have no materials', () => {
    cleanup();
    useViewerStore.setState({ models: new Map() } as never);
    ui = render(<MaterialsSection />);
    openSection(ui, 'Building materials');
    assert.equal(ui.querySelectorAll('[data-material]').length, 0);
    assert.ok((ui.textContent ?? '').includes('No materials in the loaded models yet'));
  });
});

describe('each control is one edit of the material\'s row, one undo step, and redraws the swatch', () => {
  const NAME = 'Concrete C25/30';
  const edits: [string, (r: HTMLElement) => void, (m: (typeof table extends () => (infer T)[] ? T : never)) => unknown, unknown][] = [
    ['hatch', (r) => choose(control(r, `Cut hatch of ${NAME}`) as HTMLSelectElement, 'BRICK'), (m) => m.hatch, 'BRICK'],
    ['no hatch', (r) => choose(control(r, `Cut hatch of ${NAME}`) as HTMLSelectElement, ''), (m) => m.hatch, null],
    ['scale', (r) => { const i = control(r, `Hatch scale of ${NAME}`) as HTMLInputElement; typeInto(i, '2.5'); blur(i); }, (m) => m.hatchScale, 2.5],
    ['pen', (r) => choose(control(r, `Hatch pen of ${NAME}`) as HTMLSelectElement, 'heavy'), (m) => m.hatchPen, 'heavy'],
    ['fill: none', (r) => choose(control(r, `Fill of ${NAME}`) as HTMLSelectElement, 'none'), (m) => m.fill, null],
    ['fill: a colour', (r) => choose(control(r, `Fill of ${NAME}`) as HTMLSelectElement, 'own'), (m) => m.fill, '#e8d9b0'],
    ['membrane', (r) => click(control(r, `${NAME} draws as a membrane`)), (m) => m.membrane, true],
  ];
  for (const [what, edit, read, want] of edits) {
    it(`${what}`, () => {
      const before = swatchPaths(row(ui, NAME));
      clearDraftHistory();
      edit(row(ui, NAME));
      const saved = table().find((m) => m.name === NAME);
      assert.ok(saved, 'the edit made the material\'s row');
      assert.deepEqual(read(saved), want);
      assert.notEqual(swatchPaths(row(ui, NAME)), before, 'the swatch is drawn again');
      assert.ok(!(row(ui, NAME).textContent ?? '').includes('(auto)'));
      act(() => void undoDrafts());
      assert.deepEqual(table(), [], 'one undo takes the edit back');
      assert.equal(swatchPaths(row(ui, NAME)), before, 'and the swatch is as it was');
      assert.equal(undoDrafts(), false, 'it was the only step');
    });
  }

  it('takes the hatch of a material from its name until it is edited: concrete is hatched CONCRETE', () => {
    assert.equal((control(row(ui, NAME), `Cut hatch of ${NAME}`) as HTMLSelectElement).value, 'CONCRETE');
    assert.equal((control(row(ui, 'Mineral wool'), 'Cut hatch of Mineral wool') as HTMLSelectElement).value, 'INSULATION');
    assert.equal((control(row(ui, 'PE foil'), 'PE foil draws as a membrane') as HTMLInputElement).checked, true, 'a foil is a membrane by its name');
  });
});

describe('reset', () => {
  const NAME = 'Mineral wool';
  it('puts one material back to what its name suggests, and is off for a material that was never edited', () => {
    assert.equal((control(row(ui, NAME), `Reset ${NAME} to the defaults its name suggests`) as HTMLButtonElement).disabled, true);
    const before = swatchPaths(row(ui, NAME));
    choose(control(row(ui, NAME), `Cut hatch of ${NAME}`) as HTMLSelectElement, 'BRICK');
    choose(control(row(ui, 'Concrete C25/30'), 'Cut hatch of Concrete C25/30') as HTMLSelectElement, 'EARTH');
    assert.notEqual(swatchPaths(row(ui, NAME)), before);
    clearDraftHistory();
    click(control(row(ui, NAME), `Reset ${NAME} to the defaults its name suggests`));
    assert.deepEqual(table().map((m) => m.name), ['Concrete C25/30'], 'only that row goes');
    assert.equal(swatchPaths(row(ui, NAME)), before, 'the swatch is the guess again');
    act(() => void undoDrafts());
    assert.equal(table().length, 2, 'and the reset is one step');
  });

  it('reset all takes every edit away in one step', () => {
    choose(control(row(ui, NAME), `Cut hatch of ${NAME}`) as HTMLSelectElement, 'BRICK');
    choose(control(row(ui, 'Concrete C25/30'), 'Cut hatch of Concrete C25/30') as HTMLSelectElement, 'EARTH');
    clearDraftHistory();
    const resetAll = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Reset all to the defaults')!;
    click(resetAll);
    assert.deepEqual(table(), []);
    act(() => void undoDrafts());
    assert.equal(table().length, 2);
    assert.equal(undoDrafts(), false);
  });
});

describe('Romanian', () => {
  it('names the section, the controls and the summary in Romanian', () => {
    registerLocale('ro', ro as never);
    act(() => setLocale('ro'));
    const text = ui.textContent ?? '';
    assert.ok(text.includes('Materiale de construcție'));
    assert.ok(control(row(ui, 'Mineral wool'), 'Hașura tăieturii pentru Mineral wool'));
    assert.ok(control(row(ui, 'Mineral wool'), 'Readuceți Mineral wool la valorile pe care le sugerează numele'));
  });
});
