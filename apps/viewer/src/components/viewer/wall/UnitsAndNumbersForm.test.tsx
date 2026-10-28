/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useSheetLocale } from '@/project/units-and-numbers';
import { UnitsAndNumbersForm } from './UnitsAndNumbersForm';

/** #88: the drawer's section writes the project's setting, and a figure that reads it follows at once. */

function Figure() {
  return <output data-testid="figure">{sheetNumber(useSheetLocale(), 1234.5)}</output>;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const selectOf = (ui: HTMLElement, text: string): HTMLSelectElement => {
  const label = [...ui.querySelectorAll('label')].find((l) => l.textContent?.startsWith(text));
  const found = label?.querySelector('select');
  assert.ok(found, `a select ${text}`);
  return found;
};

describe('the Units and numbers section (#88)', () => {
  it('changing the separator to a comma changes the figure beside it and is stored in the project', () => {
    const ui = render(<><UnitsAndNumbersForm /><Figure /></>);
    assert.equal(ui.querySelector('output')?.textContent, '1,234.50');
    choose(selectOf(ui, 'Decimal separator'), 'comma');
    assert.equal(ui.querySelector('output')?.textContent, '1.234,50');
    assert.deepEqual(useProjectStore.getState().unitsAndNumbers, { separator: 'comma' });
    assert.equal(useProjectStore.getState().dirty, true);
    assert.match(ui.textContent ?? '', /3500 dimension, 1\.234,50 area, \+2,70 level mark/);
  });

  it('the length unit, a kind\'s decimals and grouping are stored, and back to the defaults stores nothing', () => {
    const ui = render(<UnitsAndNumbersForm />);
    choose(selectOf(ui, 'Length unit for dimensions'), 'cm');
    choose(selectOf(ui, 'Area'), '1');
    click(ui.querySelector('input[type="checkbox"]')!);
    assert.deepEqual(useProjectStore.getState().unitsAndNumbers, { lengthUnit: 'cm', decimals: { area: 1 }, group: false });
    assert.match(ui.textContent ?? '', /350 dimension, 1234\.5 area/);
    const reset = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Back to the defaults')!;
    click(reset);
    assert.equal(useProjectStore.getState().unitsAndNumbers, undefined);
  });
});
