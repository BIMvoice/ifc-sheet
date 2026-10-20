/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROMANIAN_PRACTICE } from '@/drafting/graphic-standard';
import { resetProject, useProjectStore } from '@/project/project-store';
import { parseCatalogue, serializeCatalogue } from './catalogue-file';
import { builtInLibrary, importCatalogueText } from './catalogue-store';

beforeEach(() => resetProject());

describe('a built-in graphic standard as a .bvlib', () => {
  const file = () => {
    const { name, catalogue } = builtInLibrary('ro-practice');
    return serializeCatalogue(catalogue, name);
  };

  it('carries the standard\'s styles and its id, and reads back', () => {
    const { name, catalogue } = parseCatalogue(file());
    assert.equal(name, ROMANIAN_PRACTICE.name);
    assert.equal(catalogue.graphicStandard, 'ro-practice');
    assert.deepEqual(catalogue.textStyles.map((t) => [t.id, t.height]), ROMANIAN_PRACTICE.textStyles.map((t) => [t.id, t.height]));
    assert.deepEqual(catalogue.layers, []);
  });

  it('importing it sets the project\'s standard; "keep mine" keeps one already chosen', () => {
    importCatalogueText(file(), 'mine');
    assert.equal(useProjectStore.getState().graphicStandard, 'ro-practice');
    assert.ok(useProjectStore.getState().textStyles?.some((t) => t.id === 'ro-title-50'));
    resetProject();
    useProjectStore.setState({ graphicStandard: 'ro-practice' });
    const other = JSON.stringify({ ...JSON.parse(file()), graphicStandard: 'default' });
    importCatalogueText(other, 'mine');
    assert.equal(useProjectStore.getState().graphicStandard, 'ro-practice');
    importCatalogueText(other, 'theirs');
    assert.equal(useProjectStore.getState().graphicStandard, undefined);
  });
});

