/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project setting "include far-away elements in framing" (#268): off by
 * default and stored as absent, so a project that never touched it saves the
 * bytes it saved before and an old file loads unchanged; on, it is kept in the
 * file and comes back.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProjectDocument, projectDocument, resetProject, setIncludeFarElements, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';

const OLD_FILE = readFileSync(new URL('./fixtures/pre-section-cuts.ifclite-project.json', import.meta.url), 'utf8');

beforeEach(() => resetProject());

describe('include far-away elements in framing', () => {
  it('is off for a project file saved before the setting, and saving that project does not write it', () => {
    assert.ok(!OLD_FILE.includes('includeFarElements'));
    loadProjectDocument(parseProjectFile(OLD_FILE));
    assert.equal(useProjectStore.getState().includeFarElements, undefined);
    assert.ok(!serializeProject(projectDocument()).includes('includeFarElements'));
  });

  it('is off for a new project', () => {
    assert.equal(useProjectStore.getState().includeFarElements, undefined);
    assert.ok(!serializeProject(projectDocument()).includes('includeFarElements'));
  });

  it('is written when turned on, read back, and dropped again when turned off', () => {
    setIncludeFarElements(true);
    assert.equal(useProjectStore.getState().dirty, true);
    const text = serializeProject(projectDocument());
    assert.equal(JSON.parse(text).includeFarElements, true);
    resetProject();
    loadProjectDocument(parseProjectFile(text));
    assert.equal(useProjectStore.getState().includeFarElements, true);
    setIncludeFarElements(false);
    assert.ok(!serializeProject(projectDocument()).includes('includeFarElements'));
  });

  it('does not mark the project edited when nothing changes', () => {
    setIncludeFarElements(false);
    assert.equal(useProjectStore.getState().dirty, false);
  });

  it('reads only a true: anything else in a file is off', () => {
    for (const bad of ['"yes"', '1', 'false', 'null']) {
      const doc = parseProjectFile(JSON.stringify({ ...JSON.parse(OLD_FILE), includeFarElements: JSON.parse(bad) }));
      assert.equal(doc.includeFarElements, undefined, bad);
    }
  });
});
