/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { listLabels, planFor } from './run';
import { issueFileNames } from './output';

// #294: the default issue name, the file names and the paper words of an issue follow the panel's language; the
// counter follows the issues recorded, whatever language named them.
describe('an issue under a language switch (#294)', () => {
  beforeEach(() => { resetProject(); registerLocale('ro', ro); });
  afterEach(() => { setLocale('en'); resetProject(); });

  const record = (name: string) => ({ id: name, name, date: '2026-10-25', createdAt: 1, sheets: [] });

  it('names the default issue in the active language', () => {
    assert.equal(planFor({}).name, 'Issue 1');
    setLocale('ro');
    assert.equal(planFor({}).name, 'Emitere 1');
  });

  it('keeps counting when the language changes between issues', () => {
    useProjectStore.setState({ issues: [record('Issue 1')] });
    setLocale('ro');
    assert.equal(planFor({}).name, 'Emitere 2');
    useProjectStore.setState({ issues: [record('Issue 1'), record('Emitere 2')] });
    setLocale('en');
    assert.equal(planFor({}).name, 'Issue 3');
    // Number 2 was taken in the other language, so it is not handed out again.
    useProjectStore.setState({ issues: [record('Emitere 2')] });
    assert.equal(planFor({}).name, 'Issue 3');
  });

  it('uses a typed name as typed', () => {
    setLocale('ro');
    assert.equal(planFor({ name: ' P01 ' }).name, 'P01');
  });

  it('words the orientation and the file names in Romanian, and in English otherwise', () => {
    assert.deepEqual(issueFileNames('Issue 1', 'dxf', listLabels()), { list: 'Issue 1 drawing list.csv', zip: 'Issue 1 dxf.zip', pdf: 'Issue 1.pdf', inZipList: 'drawing-list.csv' });
    setLocale('ro');
    const labels = listLabels();
    assert.deepEqual([labels.landscape, labels.portrait], ['orizontal', 'vertical']);
    assert.deepEqual(issueFileNames('Emitere 1', 'dxf', labels), { list: 'Emitere 1 lista de planse.csv', zip: 'Emitere 1 dxf.zip', pdf: 'Emitere 1.pdf', inZipList: 'lista-de-planse.csv' });
  });
});
