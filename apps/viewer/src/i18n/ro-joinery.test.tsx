/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { defaultDoorSpec, defaultWindowSpec, type JoinerySpec } from '@ifc-lite/create';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { JoineryDialog } from '@/components/viewer/joinery/JoineryDialog';
import { closeJoinery, openJoinery } from '@/joinery/dialog-store';
import { joineryEn } from './catalogues/joinery.en';
import { joineryRo } from './catalogues/joinery.ro';
import { checkCatalogue } from './catalogue-problems';
import { registerLocale, setLocale } from './registry';
import ro from './locales/ro';

/**
 * The door and window panel in a Romanian project (#475): every `joinery.*`
 * key the English file holds has a Romanian entry, and the opened
 * configurator shows no English label of that file.
 */

const w1: JoinerySpec = { ...defaultWindowSpec('Fereastră 1200'), id: 'w1', mark: 'W1', width: 1.2, height: 1.5 };
const d1: JoinerySpec = { ...defaultDoorSpec('Ușă 900'), id: 'd1', mark: 'D1', width: 0.9, height: 2.1 };

/** Spelled alike in both languages by design (a unit template, a shared word, a format). */
const SAME = new Set(['joinery.inMm', 'joinery.section.general', 'joinery.view.plan', 'joinery.view.model', 'joinerySymbol.drawnAs']);

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

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ joineryTypes: [w1, d1] });
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => { closeJoinery(); setLocale('en'); });
});

describe('Romanian door and window panel (#475)', () => {
  it('has a Romanian entry, with the same placeholders, for every joinery key of the English file', () => {
    const catalogue = ro as Record<string, unknown>;
    const placeholders = (v: unknown) => [...String(v).matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort().join();
    for (const [key, value] of Object.entries(joineryEn)) {
      assert.ok(catalogue[key] !== undefined, `${key} has no Romanian entry`);
      assert.equal(placeholders(catalogue[key]), placeholders(value), key);
    }
  });

  it('has no English value in joinery.ro.ts, except words spelled alike in both languages', () => {
    const en = joineryEn as Record<string, string>;
    const own = joineryRo as Record<string, string>;
    assert.deepEqual(Object.keys(own).filter((k) => !SAME.has(k) && own[k] === en[k]), []);
  });

  it('renders the opened configurator with no English label of joinery.en.ts left', () => {
    const en = joineryEn as Record<string, string>;
    const labels = Object.entries(en).filter(([k, v]) => !SAME.has(k) && !v.includes('{') && v.length > 2).map(([, v]) => v);
    // The scan must see the English labels first, or an empty result proves nothing.
    render(<JoineryDialog />);
    act(() => openJoinery('w1'));
    const english = labels.filter((v) => shown().has(v));
    assert.ok(english.length >= 25, `only ${english.length} English labels visible: ${english.join(' | ')}`);
    cleanup();
    act(() => closeJoinery());

    act(() => setLocale('ro'));
    render(<JoineryDialog />);
    act(() => openJoinery('w1'));
    const text = shown();
    for (const label of ['Uși și ferestre', 'Ferestre', 'Uși', 'Toate', 'Dimensiuni', 'Toc și canat', 'Glafuri, prag și culori', 'Salvează']) {
      assert.ok(text.has(label), `${label} in ${[...text].join(' | ').slice(0, 400)}`);
    }
    assert.deepEqual(english.filter((v) => text.has(v)), []);
  });
});
