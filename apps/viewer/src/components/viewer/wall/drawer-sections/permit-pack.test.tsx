/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { permitPackOf, resetProject, useProjectStore } from '@/project/project-store';
import { setLocale } from '@/i18n/registry';
import { permitPackSection } from './permit-pack';

/** The one permit pack choice: a radio group over `setPermitPack`, replacing the per-pack switches. */

const mount = () => {
  const Section = permitPackSection.component;
  return render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
};
const radios = (ui: HTMLElement) => [...ui.querySelectorAll<HTMLInputElement>('input[type="radio"][name="permit-pack"]')];
const checked = (ui: HTMLElement) => radios(ui).filter((r) => r.checked).map((r) => r.getAttribute('data-permit-pack'));
const pick = (ui: HTMLElement, pack: string) => act(() => { ui.querySelector<HTMLInputElement>(`[data-permit-pack="${pack}"]`)!.click(); });

beforeEach(() => resetProject());
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the permit pack choice', () => {
  it('is one radio group of the four packs, named, with exactly one checked: the PAC permit project in a new project', () => {
    const ui = mount();
    assert.deepEqual(radios(ui).map((r) => r.getAttribute('data-permit-pack')), ['pacFull', 'pacRural', 'norway', 'germany']);
    assert.equal(new Set(radios(ui).map((r) => r.name)).size, 1);
    assert.deepEqual(checked(ui), ['pacFull']);
    assert.equal(ui.querySelector('fieldset > legend')?.textContent, 'Permit pack');
    assert.deepEqual([...ui.querySelectorAll('label')].map((l) => l.textContent), ['PAC (Anexa 2)', 'Simplified PAC, rural house (Anexa 3)', 'Norge (byggesak)', 'Deutschland (Bauantrag)']);
    for (const r of radios(ui)) assert.ok(r.closest('label'), 'every radio is labelled');
  });

  it('writes the choice through setPermitPack: one pack on, the others off, in any order, and the file holds only that one', () => {
    const ui = mount();
    const fields = () => { const s = useProjectStore.getState(); return [s.pacMode, s.norwayPermit, s.germanyPermit]; };
    pick(ui, 'germany');
    assert.deepEqual([fields(), checked(ui)], [[undefined, undefined, true], ['germany']]);
    pick(ui, 'norway');
    assert.deepEqual([fields(), checked(ui)], [[undefined, true, undefined], ['norway']]);
    pick(ui, 'pacRural');
    assert.deepEqual([fields(), checked(ui)], [['rural', undefined, undefined], ['pacRural']]);
    pick(ui, 'germany');
    pick(ui, 'pacFull');
    assert.deepEqual([fields(), checked(ui), permitPackOf(useProjectStore.getState())], [[undefined, undefined, undefined], ['pacFull'], 'pacFull']);
  });
});
