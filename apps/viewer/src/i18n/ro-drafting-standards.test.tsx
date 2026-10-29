/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { DraftingStandardsDialog } from '@/components/viewer/drafting/standards/DraftingStandardsDialog';
import { closeStandards, openStandards, type StandardsTab } from '@/project/standards-dialog-store';
import { draftingStandardsEn } from './catalogues/drafting-standards.en';
import { draftingStandardsRo } from './catalogues/drafting-standards.ro';
import { checkCatalogue } from './catalogue-problems';
import { registerLocale, setLocale } from './registry';
import ro from './locales/ro';

/**
 * The drafting standards dialog in a Romanian project (#513): every key of
 * `drafting-standards.en.ts` has a Romanian entry with the same placeholders,
 * and the layers, text style and dimension style tabs show no English label of that file.
 */

/** Spelled alike in both languages by design ("Font"). */
const SAME = new Set<string>(['standards.text.font']);
const TABS: StandardsTab[] = ['layers', 'text', 'dim'];

/** Every visible string of the dialog: text of the elements that hold no other element, plus the labels attributes carry. */
function shown(): Set<string> {
  const out = new Set<string>();
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length === 0 && el.textContent?.trim()) out.add(el.textContent.trim());
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v?.trim()) out.add(v.trim());
    }
  }
  return out;
}

/** The text of the three tabs, read one after the other. */
function shownAcrossTabs(): Set<string> {
  const all = new Set<string>();
  for (const tab of TABS) {
    act(() => openStandards(tab));
    for (const s of shown()) all.add(s);
  }
  return all;
}

beforeEach(() => {
  resetProject();
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => { closeStandards(); setLocale('en'); });
});

describe('Romanian drafting standards dialog (#513)', () => {
  it('has a Romanian entry, with the same placeholders, for every key of the English file', () => {
    const catalogue = ro as Record<string, unknown>;
    const placeholders = (v: unknown) => [...String(v).matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort().join();
    for (const [key, value] of Object.entries(draftingStandardsEn)) {
      assert.ok(catalogue[key] !== undefined, `${key} has no Romanian entry`);
      assert.equal(placeholders(catalogue[key]), placeholders(value), key);
    }
  });

  it('has no English value in drafting-standards.ro.ts, except words spelled alike in both languages', () => {
    const en = draftingStandardsEn as Record<string, string>;
    const own = draftingStandardsRo as Record<string, string>;
    assert.deepEqual(Object.keys(own).filter((k) => !SAME.has(k) && own[k] === en[k]), []);
  });

  it('renders the layers, text style and dimension style tabs with no English label of drafting-standards.en.ts left', () => {
    const en = draftingStandardsEn as Record<string, string>;
    const labels = Object.entries(en).filter(([k, v]) => !SAME.has(k) && !v.includes('{') && v.length > 2).map(([, v]) => v);
    // The scan must see the English labels first, or an empty result proves nothing.
    render(<DraftingStandardsDialog />);
    const english = labels.filter((v) => shownAcrossTabs().has(v));
    assert.ok(english.length >= 20, `only ${english.length} English labels visible: ${english.join(' | ')}`);
    cleanup();
    act(() => closeStandards());

    act(() => setLocale('ro'));
    render(<DraftingStandardsDialog />);
    const text = shownAcrossTabs();
    for (const label of ['Standarde de desen', 'Straturi', 'Stiluri de text', 'Stiluri de cotare', 'Înălțimea textului (mm pe hârtie)', 'Font', 'Aldin', 'Cursiv', 'Săgeată', 'Unitate', 'Închide']) {
      assert.ok(text.has(label), `${label} in ${[...text].join(' | ').slice(0, 400)}`);
    }
    assert.deepEqual(english.filter((v) => text.has(v)), []);
  });
});
