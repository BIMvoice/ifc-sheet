/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectFile, PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, serializeProject } from './project-file';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store';
import { clearTitleBlockField, seedProjectTitleBlock, setProjectTitleBlockField, setTitleBlockField } from './sheets';
import { liftSheetTitleBlocks, titleBlockOf } from './title-block';
import type { ProjectDocument, ProjectSheet } from './types';

/**
 * The title block is filled once for the project and printed on every
 * sheet; a sheet keeps only what it says otherwise. Projects saved when
 * each sheet carried its own copy are lifted on load.
 */

const sheet = (id: string, titleBlock?: Record<string, string>): ProjectSheet => ({ id, number: id, name: id, createdAt: 0, ...(titleBlock ? { titleBlock } : {}) });

describe('titleBlockOf (what a sheet prints)', () => {
  it('prints the project\'s fields, the sheet\'s own on top, an empty own field included', () => {
    const fields = titleBlockOf(sheet('A-101', { drawnBy: 'PC', revision: '' }), { project: 'House', drawnBy: 'IC', revision: 'B' }, 'Untitled');
    assert.deepEqual(fields, { project: 'House', drawnBy: 'PC', revision: '' });
  });

  it('falls back to the project\'s name when no project field is set', () => {
    assert.equal(titleBlockOf(sheet('A-101'), {}, 'Villa Nord').project, 'Villa Nord');
  });
});

describe('liftSheetTitleBlocks (a project saved with a copy on each sheet)', () => {
  const old: ProjectDocument = {
    name: 'P', models: [], views: [], drafts: [], draftLayers: [],
    sheets: [
      sheet('A-101', { project: 'House', date: '2026-10-12', drawnBy: 'IC' }),
      sheet('A-201', { project: 'House', date: '2026-10-12', drawnBy: 'PC' }),
      sheet('A-202', { project: 'House', date: '2026-10-12', drawnBy: 'PC' }),
      sheet('A-901'),
    ],
  };

  it('makes each field\'s most common value the project\'s and keeps on a sheet only what differs', () => {
    const lifted = liftSheetTitleBlocks(old);
    assert.deepEqual(lifted.titleBlock, { project: 'House', date: '2026-10-12', drawnBy: 'PC' });
    assert.deepEqual(lifted.sheets.map((s) => s.titleBlock), [{ drawnBy: 'IC' }, undefined, undefined, undefined]);
  });

  it('prints the same on every sheet that had a copy as before', () => {
    const lifted = liftSheetTitleBlocks(old);
    old.sheets.slice(0, 3).forEach((before, i) => {
      const after = titleBlockOf(lifted.sheets[i], lifted.titleBlock, lifted.name);
      for (const [key, value] of Object.entries(before.titleBlock ?? {})) assert.equal(after[key], value, `${before.number} ${key}`);
    });
  });

  it('leaves a document that already has a project title block as it is', () => {
    const doc = { ...old, titleBlock: { project: 'Other' } };
    assert.equal(liftSheetTitleBlocks(doc), doc);
  });
});

describe('the project title block in the store and the file', () => {
  beforeEach(() => {
    resetProject();
    useProjectStore.setState({ sheets: [sheet('A-101'), sheet('A-201')] });
  });
  const printed = (key: string): string[] => {
    const { sheets, titleBlock, name } = useProjectStore.getState();
    return sheets.map((s) => titleBlockOf(s, titleBlock, name)[key] ?? '');
  };

  it('a field set once prints on every sheet; a sheet can say otherwise and go back', () => {
    setProjectTitleBlockField('client', 'City of Cluj');
    assert.deepEqual(printed('client'), ['City of Cluj', 'City of Cluj']);
    setTitleBlockField('A-201', 'client', 'Private owner');
    assert.deepEqual(printed('client'), ['City of Cluj', 'Private owner']);
    setProjectTitleBlockField('client', 'Cluj County');
    assert.deepEqual(printed('client'), ['Cluj County', 'Private owner']);
    clearTitleBlockField('A-201', 'client');
    assert.deepEqual(printed('client'), ['Cluj County', 'Cluj County']);
  });

  it('the model fills only the fields the project has not set', () => {
    setProjectTitleBlockField('project', 'Typed by hand');
    seedProjectTitleBlock({ project: 'From the model', date: '2026-10-15' });
    assert.deepEqual(useProjectStore.getState().titleBlock, { project: 'Typed by hand', date: '2026-10-15' });
  });

  it('saves and opens with the project, and an old file opens lifted', () => {
    setProjectTitleBlockField('checkedBy', 'C');
    setTitleBlockField('A-101', 'drawnBy', 'IC');
    const saved = serializeProject(projectDocument());
    resetProject();
    loadProjectDocument(parseProjectFile(saved));
    assert.equal(useProjectStore.getState().titleBlock?.checkedBy, 'C');
    assert.equal(useProjectStore.getState().sheets[0].titleBlock?.drawnBy, 'IC');

    const oldFile = JSON.stringify({
      format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, savedAt: '2026-10-12T00:00:00Z', name: 'Old',
      sheets: [{ id: 's1', number: 'A-101', name: 'Plans', titleBlock: { project: 'House', date: '2026-10-12' } }, { id: 's2', number: 'A-201', name: 'Elevations', titleBlock: { project: 'House', date: '2026-10-12' } }],
    });
    loadProjectDocument(parseProjectFile(oldFile));
    assert.deepEqual(useProjectStore.getState().titleBlock, { project: 'House', date: '2026-10-12' });
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => s.titleBlock), [undefined, undefined]);
  });
});
