/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation types, symbols and legends are part of the project: they
 * survive the project file and the project package, an old project without
 * them opens with none, and a malformed one fails with its path. Importing a
 * catalogue file into the project store changes the project.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import { buildPackage, readPackage } from '@/project/package/package-io.js';
import { EMPTY_PROJECT, loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import type { ProjectDocument } from '@/project/types.js';
import { serializeCatalogue } from './catalogue-file.js';
import { importCatalogueText, projectCatalogue } from './catalogue-store.js';
import { DEFAULT_LEGEND } from './types.js';

const doc: ProjectDocument = {
  ...EMPTY_PROJECT,
  name: 'House',
  annotationTypes: [{ id: 'a1', name: 'Grid axis', tool: 'axis', textStyle: 'standard', axis: { bubble: 'square', ends: 'start', size: null, lineType: 'dashed' } }],
  symbols: [{ id: 's1', name: 'Mark', unit: 'model', shapes: [{ type: 'circle', c: { x: 0, y: 0 }, r: 0.5 }, { type: 'text', p: { x: 0, y: 1 }, text: 'A', height: 0.25, rotation: 0 }] }],
  legends: [{ ...DEFAULT_LEGEND, id: 'lg1', name: 'Plan legend', createdAt: 3, scope: 'sheet', scopeId: 'sh1', columns: 2 }],
};

describe('catalogue definitions in the project', () => {
  it('survive the project file', () => {
    const back = parseProjectFile(serializeProject(doc));
    assert.deepEqual(back.annotationTypes, doc.annotationTypes);
    assert.deepEqual(back.symbols, doc.symbols);
    assert.deepEqual(back.legends, doc.legends);
  });

  it('survive the project package', async () => {
    const { files } = await buildPackage({ projectId: 'p', doc, models: [] });
    const back = await readPackage(files);
    assert.deepEqual(back.doc.annotationTypes, doc.annotationTypes);
    assert.deepEqual(back.doc.symbols, doc.symbols);
    assert.deepEqual(back.doc.legends, doc.legends);
  });

  it('are empty in a project saved before they existed', () => {
    const old = JSON.parse(serializeProject(doc));
    delete old.annotationTypes;
    delete old.symbols;
    delete old.legends;
    const back = parseProjectFile(JSON.stringify(old));
    assert.deepEqual([back.annotationTypes, back.symbols, back.legends], [[], [], []]);
  });

  it('fail with the path when malformed', () => {
    const bad = JSON.parse(serializeProject(doc));
    bad.symbols[0].shapes[0] = { type: 'polygon' };
    assert.throws(() => parseProjectFile(JSON.stringify(bad)), /symbols\/0\.shapes\/0/);
    const bad2 = JSON.parse(serializeProject(doc));
    bad2.legends = [{ name: 'x' }];
    assert.throws(() => parseProjectFile(JSON.stringify(bad2)), /legends\/0/);
  });
});

describe('importing a catalogue into the project', () => {
  beforeEach(() => resetProject());

  it('adds the file\'s definitions to the project store, marks it edited, and a second import with "mine" changes nothing', () => {
    const file = serializeCatalogue(projectCatalogue({ ...useProjectStore.getState(), ...doc }), 'Other');
    const { report } = importCatalogueText(file, 'mine');
    const s = useProjectStore.getState();
    assert.deepEqual(s.annotationTypes?.map((a) => a.name), ['Grid axis']);
    assert.deepEqual(s.symbols?.map((a) => a.name), ['Mark']);
    assert.equal(s.dirty, true);
    // What the store hands to a save is the same, and loading it back gives the same project.
    const saved = projectDocument();
    assert.deepEqual([saved.annotationTypes?.length, saved.symbols?.length], [1, 1]);
    resetProject();
    loadProjectDocument(parseProjectFile(serializeProject(saved)));
    assert.deepEqual(useProjectStore.getState().symbols?.map((a) => a.name), ['Mark']);
    assert.equal(report.symbols.added, 1);
    const before = JSON.stringify(projectDocument());
    importCatalogueText(file, 'mine');
    assert.equal(JSON.stringify(projectDocument()), before);
  });

  it('a file that is not a catalogue changes nothing', () => {
    assert.throws(() => importCatalogueText('{"format":"ifclite-project"}', 'theirs'), /Not a library file/);
    assert.equal(useProjectStore.getState().dirty, false);
  });
});
