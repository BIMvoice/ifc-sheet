/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Info dialog's About tab credits IfcSheet and the engine it is built on
 * (ifc-lite by LTplus), links its issue tracker to IfcSheet's repository and
 * not upstream's, and the status bar's "Built on IFClite" link reads in
 * Romanian. English and Romanian.
 */
import '@/test/setup-dom.js';
// Vite `define` build-time constants (see vite.config.ts): under plain
// Node they don't exist, so the About/What's New tabs need stand-ins
// before the component renders (same pattern as
// `StatusBar.federation.test.tsx`).
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
(globalThis as unknown as { __BUILD_DATE__: string }).__BUILD_DATE__ = '2026-01-01T00:00:00.000Z';
(globalThis as unknown as { __PACKAGE_VERSIONS__: Array<{ name: string; version: string }> }).__PACKAGE_VERSIONS__ = [
  { name: '@ifc-lite/viewer', version: '0.0.0-test' },
];
(
  globalThis as unknown as {
    __RELEASE_HISTORY__: Array<{
      name: string;
      releases: Array<{ version: string; highlights: Array<{ type: 'feature' | 'fix' | 'perf'; text: string }> }>;
    }>;
  }
).__RELEASE_HISTORY__ = [
  {
    name: '@ifc-lite/viewer',
    releases: [{ version: '0.0.0-test', highlights: [{ type: 'feature', text: 'Test highlight' }] }],
  },
];

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { getLocale, registerLocale, resolve, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog.js';

const hrefs = () => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  registerLocale('ro', checkCatalogue(ro).catalogue);
  setLocale('en');
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

describe('About tab credits', () => {
  it('names IfcSheet by BIMvoice, built on ifc-lite by LTplus, and links the issues to IfcSheet (en)', () => {
    render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab="about" />);
    const text = document.body.textContent ?? '';
    assert.match(text, /IfcSheet is made by BIMvoice and built on ifc-lite by LTplus, under the MPL-2\.0 licence/);
    assert.ok(!text.includes('{app}'), 'the app-name placeholder must not render raw');
    assert.match(text, /ifc-lite on GitHub/);
    assert.match(text, /Report an IfcSheet issue/);
    const links = hrefs();
    assert.ok(links.includes('https://ifclite.dev'));
    assert.ok(links.includes('https://github.com/LTplus-AG/ifc-lite'));
    assert.ok(links.includes('https://github.com/BIMvoice/ifcsheet'));
    assert.ok(links.includes('https://github.com/BIMvoice/ifcsheet/issues'));
    assert.ok(!links.includes('https://github.com/LTplus-AG/ifc-lite/issues'), 'issues must not go upstream');
  });

  it('says the same in Romanian', () => {
    act(() => setLocale('ro'));
    assert.equal(getLocale(), 'ro');
    render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab="about" />);
    const text = document.body.textContent ?? '';
    assert.match(text, /IfcSheet este realizat de BIMvoice și construit pe ifc-lite, dezvoltat de LTplus, sub licența MPL-2\.0/);
    assert.ok(!text.includes('{app}'));
    assert.match(text, /ifc-lite pe GitHub/);
    assert.match(text, /Raportați o problemă IfcSheet/);
    assert.ok(hrefs().includes('https://github.com/BIMvoice/ifcsheet/issues'));
  });
});

describe('Status bar credit', () => {
  it('has a Romanian string for the Built on IFClite link and its label', () => {
    act(() => setLocale('ro'));
    assert.equal(resolve('shellChrome.statusBar.ifcliteLinkLabel'), 'Construit pe IFClite →');
    assert.match(resolve('shellChrome.statusBar.ifcliteAriaLabel'), /^Construit pe IFClite/);
    act(() => setLocale('en'));
    assert.equal(resolve('shellChrome.statusBar.ifcliteLinkLabel'), 'Built on IFClite →');
  });
});
