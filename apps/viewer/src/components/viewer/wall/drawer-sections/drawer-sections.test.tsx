/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { DrawerSections } from './DrawerSections';
import { DRAWER_SECTIONS, sectionsOf } from './index';
import type { DrawerContext, DrawerSection } from './types';

/** The project drawer's section registry (#144): a section is a file, its place is its `order`. */

afterEach(() => cleanup());

const context: DrawerContext = { go: () => {}, onClose: () => {}, extent: null };
const mark = (id: string) => () => <i data-id={id} />;

describe('the project drawer sections', () => {
  it('has one id per section and one order per slot', () => {
    const ids = DRAWER_SECTIONS.map((s) => s.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
    const places = DRAWER_SECTIONS.map((s) => `${s.slot}:${s.order}`);
    assert.deepEqual(places.filter((p, i) => places.indexOf(p) !== i), []);
  });

  it('keeps the drawer as it was: the library and comments above the list, then the list top to bottom', () => {
    assert.deepEqual(sectionsOf('top').map((s) => s.id), ['library', 'comments']);
    assert.deepEqual(sectionsOf('body').map((s) => s.id), [
      'sheets', 'standards', 'readiness', 'numbering', 'units', 'title-block', 'tag-fields', 'materials', 'classification', 'view-templates', 'drawings', 'schedules', 'legends',
    ]);
  });

  it('renders the sections of a slot by order, whatever order they are listed in, and none of another slot', () => {
    const sections: DrawerSection[] = [
      { id: 'c', slot: 'body', order: 300, component: mark('c') },
      { id: 'a', slot: 'body', order: 100, component: mark('a') },
      { id: 'x', slot: 'top', order: 50, component: mark('x') },
      { id: 'b', slot: 'body', order: 200, component: mark('b') },
    ];
    const ui = render(<DrawerSections slot="body" context={context} sections={sections} />);
    assert.deepEqual([...ui.querySelectorAll('i')].map((e) => e.getAttribute('data-id')), ['a', 'b', 'c']);
  });

  it('leaves out a section whose visibility hook says no, and adds no element of its own', () => {
    const sections: DrawerSection[] = [
      { id: 'shown', slot: 'body', order: 1, component: mark('shown'), useVisible: () => true },
      { id: 'hidden', slot: 'body', order: 2, component: mark('hidden'), useVisible: () => false },
    ];
    const ui = render(<DrawerSections slot="body" context={context} sections={sections} />);
    assert.equal(ui.innerHTML, '<i data-id="shown"></i>');
  });
});
