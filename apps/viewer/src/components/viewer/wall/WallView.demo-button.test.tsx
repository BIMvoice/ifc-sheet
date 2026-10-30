/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #599: the demo button on the empty Wall said "...ground floor plus four" and stopped. The label is a whole
 * sentence in both languages, and the button lets it wrap instead of running off one line.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject } from '@/project/project-store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { WallView } from './WallView';

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ models: new Map() });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

const demoButton = (): HTMLButtonElement => {
  const label = [...document.querySelectorAll('button')].find((b) => /demo/i.test(b.textContent ?? ''));
  assert.ok(label, 'the demo button is on the empty Wall');
  return label as HTMLButtonElement;
};

describe('the demo button on the empty Wall', () => {
  it('names the whole building in English: ground floor plus four storeys', () => {
    render(<WallView />);
    assert.match(demoButton().textContent ?? '', /ground floor plus four storeys$/);
  });

  it('names the whole building in Romanian: parter plus patru etaje', () => {
    registerLocale('ro', ro);
    setLocale('ro');
    render(<WallView />);
    assert.match(demoButton().textContent ?? '', /parter plus patru etaje$/);
  });

  it('wraps a long label inside a bounded, centred box instead of one clipped line', () => {
    render(<WallView />);
    const classes = demoButton().className.split(/\s+/);
    assert.ok(classes.some((c) => c.startsWith('max-w-')), 'bounded width');
    assert.ok(classes.includes('text-center'), 'centred wrapped lines');
  });
});
