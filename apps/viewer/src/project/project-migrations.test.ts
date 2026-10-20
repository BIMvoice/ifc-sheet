/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #71: a project file saved by an earlier build still opens, and one from a later build is refused whole.
 * `fixtures/v1.ifclite-project.json` was written by this branch's `serializeProject` at version 1.
 * `fixtures/pre-section-cuts.ifclite-project.json` is older: it was written by the serializer and store
 * of commit 9e17a1f0 (2026-10-12), before named section cuts were saved and while the title block was
 * kept per sheet. When the shape changes, a migration is added and both files stay as they are, so
 * these tests keep proving they open.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProjectFile, serializeProject } from './project-file.js';
import { migrateProject, PROJECT_FILE_VERSION, ProjectFileTooNewError, type ProjectMigration } from './project-migrations.js';
import { projectOpenErrorText } from './open-error.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store.js';

const fixture = (name: string): string => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const t = (key: string, params?: Record<string, string | number>) => `${key} ${JSON.stringify(params ?? {})}`;

describe('a project file saved at version 1', () => {
  beforeEach(() => resetProject());

  it('opens through the real load path with its contents', () => {
    const doc = parseProjectFile(fixture('v1.ifclite-project.json'));
    loadProjectDocument(doc);
    const s = useProjectStore.getState();
    assert.equal(s.name, 'Fixture house');
    assert.deepEqual(s.models, [{ key: 'hash-fixture', name: 'fixture-house.ifc' }]);
    assert.deepEqual(s.views.map((v) => [v.id, v.kind, v.name]), [['p1', 'plan', 'Level 1'], ['s1', 'section', 'Section A']]);
    assert.deepEqual(s.sheets.map((x) => [x.number, x.name]), [['A-101', 'Plans']]);
    assert.deepEqual(s.symbolFlips, { 'G-DOOR-1': 1 });
  });

  it('is version 1 whether the file says so or says nothing (files before the field was written)', () => {
    assert.equal(PROJECT_FILE_VERSION, 1);
    const withVersion = JSON.parse(fixture('v1.ifclite-project.json')) as Record<string, unknown>;
    const { version: _version, ...without } = withVersion;
    assert.deepEqual(parseProjectFile(JSON.stringify(without)), parseProjectFile(JSON.stringify(withVersion)));
  });
});

describe('a project file written by an older build (9e17a1f0)', () => {
  beforeEach(() => resetProject());

  it('opens through the real load path: the per-sheet title blocks become the project\'s, the later fields take their defaults', () => {
    const text = fixture('pre-section-cuts.ifclite-project.json');
    const raw = JSON.parse(text) as Record<string, unknown>;
    assert.ok(!('savedSectionCuts' in raw) && !('titleBlock' in raw) && !('issues' in raw), 'the fixture predates these fields');
    loadProjectDocument(parseProjectFile(text));
    const s = useProjectStore.getState();
    assert.equal(s.name, 'Old house');
    assert.deepEqual(s.models, [{ key: 'house-sha', name: 'house.ifc' }]);
    assert.deepEqual(s.sheets.map((x) => [x.number, x.name, x.viewports?.length ?? 0]), [['A-101', 'Ground floor plan', 1], ['A-102', 'Notes', 0]]);
    assert.ok(s.views.some((v) => v.id === s.sheets[0].viewports?.[0].viewId), 'the viewport still names its view');
    assert.deepEqual(s.titleBlock, { project: 'Old house', drawnBy: 'PC', date: '2026-10-12' }, 'the shared fields are lifted to the project');
    assert.equal(s.sheets[0].titleBlock, undefined, 'the first sheet held only shared values');
    assert.deepEqual(s.sheets[1].titleBlock, { drawnBy: 'IC' }, 'a sheet keeps what differs');
    assert.deepEqual(s.savedSectionCuts, []);
    assert.deepEqual(s.issues, []);
  });

  it('saves again in today\'s shape and reads back the same', () => {
    loadProjectDocument(parseProjectFile(fixture('pre-section-cuts.ifclite-project.json')));
    const again = parseProjectFile(serializeProject(projectDocument()));
    assert.deepEqual(again, parseProjectFile(serializeProject(again)));
    assert.deepEqual(again.titleBlock, { project: 'Old house', drawnBy: 'PC', date: '2026-10-12' });
  });
});

describe('a project file from a newer build', () => {
  beforeEach(() => resetProject());
  const newer = (): string => JSON.stringify({ ...JSON.parse(fixture('v1.ifclite-project.json')), version: PROJECT_FILE_VERSION + 1 });

  it('is refused whole, naming both versions, and leaves the open project alone', () => {
    useProjectStore.setState({ name: 'Open now' });
    assert.throws(() => parseProjectFile(newer()), (err) => err instanceof ProjectFileTooNewError && err.found === PROJECT_FILE_VERSION + 1 && err.supported === PROJECT_FILE_VERSION);
    assert.equal(useProjectStore.getState().name, 'Open now');
  });

  it('is refused before anything else in it is read, even a field that would not parse', () => {
    const broken = JSON.stringify({ format: 'ifclite-project', version: 99, views: 'a shape this build has never seen' });
    assert.throws(() => parseProjectFile(broken), ProjectFileTooNewError);
  });

  it('is explained to the user in a translated message, not the thrown text', () => {
    try {
      parseProjectFile(newer());
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(projectOpenErrorText(err, t), `project.file.tooNew {"found":2,"supported":1}`);
    }
  });
});

describe('migrations', () => {
  const log: string[] = [];
  const step = (from: number): ProjectMigration => (doc) => {
    log.push(`v${from}→v${from + 1}`);
    return { ...doc, trail: `${String(doc.trail ?? '')}${from}` };
  };
  beforeEach(() => { log.length = 0; });

  it('run in order, from the file\'s own version up to the current one, and stamp the result', () => {
    const migrations = { 1: step(1), 2: step(2), 3: step(3) };
    const out = migrateProject({ format: 'ifclite-project', version: 1 }, 1, migrations, 4);
    assert.deepEqual(log, ['v1→v2', 'v2→v3', 'v3→v4']);
    assert.equal(out.trail, '123');
    assert.equal(out.version, 4);
  });

  it('start at the file\'s version, not at the first step', () => {
    migrateProject({ version: 3 }, 3, { 1: step(1), 2: step(2), 3: step(3) }, 4);
    assert.deepEqual(log, ['v3→v4']);
  });

  it('leave a current file as it is', () => {
    const raw = { version: 2, name: 'x' };
    assert.equal(migrateProject(raw, 2, { 1: step(1) }, 2), raw);
    assert.deepEqual(log, []);
  });

  it('refuse a file whose version has no step rather than skip it', () => {
    assert.throws(() => migrateProject({ version: 1 }, 1, { 2: step(2) }, 3), /no migration from version 1 to 2/);
  });
});
