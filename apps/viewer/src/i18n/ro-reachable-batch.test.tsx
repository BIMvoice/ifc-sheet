/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { ShareScopeField } from '@/components/viewer/ShareScopeField';
import { ModelTagChip } from '@/components/viewer/hierarchy/ModelTagChip';
import { checkCatalogue } from './catalogue-problems';
import { en } from './en';
import { registerLocale, setLocale } from './registry';
import ro from './locales/ro';

/**
 * #526, first batch: panels the IfcSheet face reaches (the share dialog's scope field and the model
 * tag chip) read in Romanian under the Romanian locale, with no English value of the translated keys left.
 */
beforeEach(() => {
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const SCOPE_KEYS = [
  'shareScopeField.activeOnly',
  'shareScopeField.createLink',
  'shareScopeField.shareLabel',
  'shareScopeField.uploadNotice',
] as const;

describe('Romanian on panels reached from the face', () => {
  it('renders the share scope field in Romanian, not English', () => {
    act(() => setLocale('ro'));
    const ui = render(
      <ShareScopeField showScope scope="active" onScopeChange={() => {}} editable onConfirm={() => {}} loadedCount={3} seedableCount={2} activeModelName="Casa" roomModelCount={null} />,
    );
    const text = ui.textContent ?? '';
    assert.match(text, /Doar modelul activ/);
    assert.match(text, /Creați linkul/);
    assert.match(text, /Toate cele 2 din 3 modele încărcate/);
    for (const key of SCOPE_KEYS) assert.ok(!text.includes(en[key]), `English "${en[key]}" is still on screen`);
  });

  it('renders the model tag chip, its unknown-tag label and its remove button in Romanian', () => {
    act(() => setLocale('ro'));
    const ui = render(<ModelTagChip tag={undefined} onRemove={() => {}} />);
    assert.match(ui.textContent ?? '', /Etichetă necunoscută/);
    assert.equal(ui.querySelector('[data-model-tag-chip]')?.getAttribute('title'), 'Această etichetă nu mai există');
    assert.equal(ui.querySelector('button')?.getAttribute('aria-label'), 'Eliminați eticheta Etichetă necunoscută');
    assert.ok(!(ui.textContent ?? '').includes('Unknown tag'));
  });

  it('counts the models a session carries with the forms Romanian uses', () => {
    act(() => setLocale('ro'));
    const caption = (n: number) => render(<ShareScopeField showScope scope="all" onScopeChange={() => {}} editable={false} onConfirm={() => {}} loadedCount={n} seedableCount={n} activeModelName="Casa" roomModelCount={n} />).textContent ?? '';
    assert.match(caption(1), /conține 1 model\./);
    assert.match(caption(3), /conține 3 modele\./);
    assert.match(caption(20), /conține 20 de modele\./);
  });
});
