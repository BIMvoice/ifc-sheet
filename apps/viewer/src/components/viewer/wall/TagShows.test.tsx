/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Tag tool's field choice on its card and the sentence under the drawing (#168). Outside AutoCAD mode the sentence names the
 * choice in words ("the element's mark"), never as the typed MARK, and follows the choice while the tool runs.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, endCommand, startDraftCommand } from '@/drafting/session.js';
import { ToolPrompt } from '@/components/viewer/drafting/ToolPrompt.js';
import { useAutocadMode } from '@/lib/commands/autocad-mode';
import { resolveEnglish as t } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cleanup, render } from '@/test/render.js';
import { InfoCard } from './InfoCard.js';

const strip = (ui: HTMLElement) => ui.querySelector('[data-tool-prompt] output')?.textContent ?? '';
const choice = (ui: HTMLElement) => {
  const box = ui.querySelector('select');
  assert.ok(box instanceof HTMLSelectElement, 'the field choice on the card');
  return box;
};
const choose = (box: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  assert.ok(setter);
  act(() => {
    setter.call(box, value);
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};
const start = () => act(() => { startDraftCommand('tag'); });
const mount = () => render(<><InfoCard tool="tag" onDone={endCommand} /><ToolPrompt /></>);

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useAutocadMode.setState({ on: false });
  attachDraftingView('plan-1', 'down', () => []);
});
afterEach(() => {
  cleanup();
  cancelCommand();
  useAutocadMode.setState({ on: false });
});

describe('the Tag tool card field choice (#168)', () => {
  it('names the project choice in plain words on the card and in the sentence under the drawing', () => {
    const ui = mount();
    start();
    assert.match(ui.textContent ?? '', new RegExp(t('tagCard.sentence', { field: t('tagCard.field.mark') })));
    assert.ok(strip(ui).includes(`The tag shows ${t('tagCard.field.mark')};`), strip(ui));
    assert.doesNotMatch(strip(ui), /MARK/, 'no typed word');
  });

  it('a choice made on the card changes the running tool\'s sentence, in each state', () => {
    const ui = mount();
    start();
    for (const [value, key] of [['name', 'name'], ['typeName', 'typeName'], ['class', 'class'], ['classificationTitle', 'classificationTitle'], ['mark', 'mark']] as const) {
      choose(choice(ui), value);
      assert.equal(useProjectStore.getState().tagField ?? 'mark', value, 'the project keeps the choice');
      assert.ok(strip(ui).includes(t(`tagCard.field.${key}`)), `${value}: ${strip(ui)}`);
      assert.ok((ui.querySelector('output')?.textContent ?? '').includes(t(`tagCard.field.${key}`)), 'the card says it too');
      assert.doesNotMatch(strip(ui), /TYPENAME|CLASSIFICATIONTITLE|CLASS\b/, 'no typed word');
    }
  });

  it('with AutoCAD mode on the sentence keeps its typed words', () => {
    useAutocadMode.setState({ on: true });
    const ui = mount();
    start();
    assert.ok(strip(ui).includes('MARK / NAME / CLASS'), strip(ui));
    assert.ok(strip(ui).includes('[MARK]'), strip(ui));
  });
});
