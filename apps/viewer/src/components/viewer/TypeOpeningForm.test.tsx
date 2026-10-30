/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The type opening form (#448): the leaves chosen in it, the fanlight and the button write the type's configuration to the project. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { typeOpeningOf, typeEntryOf, typeSillOf } from '@/joinery/type-config-actions';
import type { ElementFacts } from '@/joinery/symbol-mapping';
import { readJoineryList, typedSillOf } from '@bimvoice/ifcsheet/project';
import { TypeOpeningForm } from './TypeOpeningForm';

const facts: ElementFacts = { kind: 'window', globalId: 'W-1', typeGlobalId: 'T-1', names: ['Zwei Panele'], width: 1.76, height: 1.01 };

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('TypeOpeningForm', () => {
  it('two leaves and a fanlight, applied, configure the type at the element\'s size', () => {
    const root = render(<TypeOpeningForm facts={facts} />);
    assert.equal(root.querySelectorAll('[data-type-leaf]').length, 1, 'one leaf to begin with');
    const two = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === '2');
    assert.ok(two, 'a choice of two leaves');
    act(() => { two.click(); });
    assert.equal(root.querySelectorAll('[data-type-leaf]').length, 2, 'a trigger per leaf');
    const fanlight = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => { fanlight!.click(); });
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-opening-apply]')!.click(); });
    assert.deepEqual(typeOpeningOf(facts), { operations: ['fixed', 'fixed'], fanlight: true });
    const entry = useProjectStore.getState().joineryTypes?.[0];
    assert.deepEqual([entry?.width, entry?.height], [1.76, 1.01]);
    assert.equal(useProjectStore.getState().joineryMapping?.types['T-1'], entry?.id);
  });

  it('opens on the configuration the type already has', () => {
    const first = render(<TypeOpeningForm facts={facts} />);
    const two = [...first.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === '3')!;
    act(() => { two.click(); });
    act(() => { first.querySelector<HTMLButtonElement>('[data-type-opening-apply]')!.click(); });
    cleanup();
    const again = render(<TypeOpeningForm facts={facts} />);
    assert.equal(again.querySelectorAll('[data-type-leaf]').length, 3);
  });

  it('a segmental head with a rise, a suggested U value and a free property are written to the type', () => {
    const root = render(<TypeOpeningForm facts={facts} />);
    const type = (input: HTMLInputElement, value: string) => act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const segmental = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === 'segmental');
    assert.ok(segmental, 'a segmental head is offered');
    act(() => { segmental.click(); });
    type(root.querySelector<HTMLInputElement>('[data-type-head-rise]')!, '250');
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-prop-suggest="thermalTransmittance"]')!.click(); });
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-prop-add]')!.click(); });
    const rows = root.querySelectorAll<HTMLElement>('[data-type-prop]');
    assert.equal(rows.length, 2);
    type(rows[0].querySelectorAll('input')[1], '1,1');
    type(rows[1].querySelectorAll('input')[0], 'Sound reduction');
    type(rows[1].querySelectorAll('input')[1], '32 dB');
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-opening-apply]')!.click(); });
    const entry = typeEntryOf(facts);
    assert.deepEqual(entry?.head, { shape: 'segmental', rise: 0.25 });
    assert.deepEqual(entry?.custom, [{ name: 'U (W/m²K)', value: '1,1', key: 'thermalTransmittance' }, { name: 'Sound reduction', value: '32 dB' }]);
  });

  it('a sill typed for a window type is written to it, shown again, and a door type offers none', () => {
    const root = render(<TypeOpeningForm facts={facts} />);
    const sill = root.querySelector<HTMLInputElement>('[data-type-sill]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(sill, '1100');
      sill.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-opening-apply]')!.click(); });
    assert.equal(typeEntryOf(facts)?.sillHeight, 1.1);
    cleanup();
    assert.equal(render(<TypeOpeningForm facts={facts} />).querySelector<HTMLInputElement>('[data-type-sill]')!.value, '1100');
    cleanup();
    assert.equal(render(<TypeOpeningForm facts={{ ...facts, kind: 'door', typeGlobalId: 'T-D' }} />).querySelector('[data-type-sill]'), null);
  });

  const typeSill = (root: ReturnType<typeof render>, mm: string) => {
    const sill = root.querySelector<HTMLInputElement>('[data-type-sill]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(sill, mm);
      sill.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    act(() => { root.querySelector<HTMLButtonElement>('[data-type-opening-apply]')!.click(); });
  };

  it('a sill typed as 900, the default, is kept: the form reopens with it, a blank one is not stated, and it survives save and reopen', () => {
    typeSill(render(<TypeOpeningForm facts={facts} />), '900');
    assert.equal(typeSillOf(facts), 0.9);
    cleanup();
    const reopened = render(<TypeOpeningForm facts={facts} />);
    assert.equal(reopened.querySelector<HTMLInputElement>('[data-type-sill]')!.value, '900');
    // Saved and read back, the project still holds it.
    const saved = readJoineryList(JSON.parse(JSON.stringify(useProjectStore.getState().joineryTypes)));
    assert.equal(typedSillOf(saved[0]), 0.9);
    // Blanking it and applying: not stated again.
    typeSill(reopened, '');
    assert.equal(typeSillOf(facts), null);
    cleanup();
    assert.equal(render(<TypeOpeningForm facts={facts} />).querySelector<HTMLInputElement>('[data-type-sill]')!.value, '');
  });

  it('a type applied with a blank sill stays not stated', () => {
    typeSill(render(<TypeOpeningForm facts={facts} />), '');
    assert.equal(typeSillOf(facts), null);
    assert.equal(typeEntryOf(facts)?.sillTyped, undefined);
  });
});

describe('TypeOpeningForm plan symbol picker', () => {
  it('a file that is not a DXF is named in the form, and the type keeps its symbol', async () => {
    const root = render(<TypeOpeningForm facts={facts} />);
    const input = root.querySelector<HTMLInputElement>('[data-type-plan-block-file]')!;
    const file = new window.File(['this is not a dxf'], 'x.dxf');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const warn = console.warn;
    console.warn = () => {};
    try {
      await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
    } finally {
      console.warn = warn;
    }
    const error = root.querySelector('[data-type-plan-block-error]');
    assert.ok(error, 'the form says the file could not be read');
    assert.match(error.textContent ?? '', /DXF/);
    assert.equal(root.querySelector('[data-type-plan-block-name]'), null, 'no symbol was set');
    assert.equal(root.querySelector('[data-type-plan-block-pick]'), null, 'no blocks offered');
  });
});
