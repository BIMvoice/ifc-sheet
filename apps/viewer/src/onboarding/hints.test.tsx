/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** First-use hints (#455): dismissed stays dismissed after a reload, Settings brings them back, a browser without storage still shows them. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { GeneralSection } from '@/components/viewer/settings/GeneralSection';
import { Hint } from './Hint.js';
import { dismissHint, forgetHintStateForTests, HINTS_STORAGE_KEY, isHintVisible, setHintsEnabled } from './hints.js';

/** A page reload: the in-memory copy is gone, storage stays. */
const reload = (): void => forgetHintStateForTests();

beforeEach(() => {
  window.localStorage.removeItem(HINTS_STORAGE_KEY);
  reload();
});
afterEach(() => {
  cleanup();
  mock.restoreAll();
  window.localStorage.removeItem(HINTS_STORAGE_KEY);
  reload();
});

describe('a hint shows until it is dismissed', () => {
  it('shows the first time, and dismiss hides it', () => {
    const ui = render(<Hint id="viewportResize">Drag an edge</Hint>);
    assert.equal(ui.querySelector('[data-hint="viewportResize"]')?.textContent?.includes('Drag an edge'), true);
    const dismiss = ui.querySelector<HTMLButtonElement>('[data-hint] button');
    assert.ok(dismiss, 'a dismiss button');
    assert.ok(dismiss.getAttribute('aria-label'), 'named');
    click(dismiss);
    assert.equal(ui.querySelector('[data-hint]'), null);
  });

  it('stays dismissed after a reload, and only that hint', () => {
    dismissHint('ortho');
    reload();
    assert.equal(isHintVisible('ortho'), false);
    assert.equal(isHintVisible('viewportResize'), true);
    const ui = render(<Hint id="ortho">Ortho</Hint>);
    assert.equal(ui.querySelector('[data-hint]'), null, 'not drawn again after the reload');
  });

  it('shows every hint in a browser whose storage refuses, and keeps a dismissal for the session', () => {
    mock.method(Storage.prototype, 'getItem', () => { throw new Error('denied'); });
    mock.method(Storage.prototype, 'setItem', () => { throw new Error('denied'); });
    reload();
    assert.equal(isHintVisible('openView'), true);
    dismissHint('openView');
    assert.equal(isHintVisible('openView'), false);
  });

  it('starts fresh from a damaged stored value', () => {
    window.localStorage.setItem(HINTS_STORAGE_KEY, '{not json');
    reload();
    assert.equal(isHintVisible('openSheet'), true);
    window.localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify({ on: true, dismissed: 'ortho' }));
    reload();
    assert.equal(isHintVisible('ortho'), true);
  });
});

describe('Settings brings hints back', () => {
  it('the switch turns every hint off, and on again restores the dismissed ones', () => {
    dismissHint('viewportResize');
    reload();
    const ui = render(<GeneralSection />);
    const toggle = ui.querySelector<HTMLElement>('#settings-hints');
    assert.ok(toggle, 'a hints switch in Settings, General');
    assert.equal(toggle.getAttribute('aria-checked'), 'true');
    click(toggle);
    assert.equal(isHintVisible('ortho'), false, 'off hides all');
    reload();
    assert.equal(isHintVisible('ortho'), false, 'off survives a reload');
    click(ui.querySelector<HTMLElement>('#settings-hints')!);
    assert.equal(isHintVisible('viewportResize'), true, 'on again shows the one dismissed before');
    reload();
    assert.equal(isHintVisible('viewportResize'), true);
  });

  it('setHintsEnabled(true) clears the dismissals', () => {
    dismissHint('openSheet');
    setHintsEnabled(true);
    assert.equal(isHintVisible('openSheet'), true);
  });
});
