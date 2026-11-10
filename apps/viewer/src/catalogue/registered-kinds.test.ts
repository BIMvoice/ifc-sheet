/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * The library kinds registered by their own file (#144): every file of `kinds/` is found and registers, the assembled
 * list is what it was when the kinds were one list in `catalogue-file.ts`, and a key listed twice is refused.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { CATALOGUE_KINDS, emptyCatalogue, REGISTERED_CATALOGUE_KINDS } from './catalogue-file.js';
import { assembleCatalogueKinds, REGISTERED_CATALOGUE_KIND_DEFS, type RegisteredCatalogueKind } from './registered-kinds.js';

const kind = (key: string): RegisteredCatalogueKind => ({ key } as RegisteredCatalogueKind);

describe('registered library kinds', () => {
  it('lists the kinds in the order the dialog always had', () => {
    assert.equal(CATALOGUE_KINDS.length, 15);
    assert.deepEqual([...CATALOGUE_KINDS], ['layers', 'textStyles', 'dimStyles', 'hatchPatterns', 'materials', 'annotationTypes', 'symbols', 'legends', 'cadLayers', 'tagFields', 'details', 'sheetTemplates', 'boqArticles', 'viewTemplates', 'classificationMappings']);
    assert.deepEqual(Object.keys(emptyCatalogue()), ['layers', 'layerGroups', 'textStyles', 'dimStyles', 'hatchPatterns', 'materials', 'annotationTypes', 'symbols', 'legends', 'cadLayers', 'details', 'sheetTemplates', 'boqArticles', 'viewTemplates', 'classificationMappings']);
  });

  it('finds every file of kinds/ and each registers a kind, none twice', () => {
    const files = readdirSync(new URL('./kinds', import.meta.url)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    assert.ok(files.length > 0);
    assert.equal(REGISTERED_CATALOGUE_KIND_DEFS.length, files.length, `kinds/ holds ${files.join(', ')}; the glob found ${REGISTERED_CATALOGUE_KIND_DEFS.map((d) => d.key).join(', ')}`);
    assert.deepEqual(REGISTERED_CATALOGUE_KINDS.map((d) => d.key), ['classificationMappings']);
    assert.equal(new Set(REGISTERED_CATALOGUE_KINDS.map((d) => d.key)).size, REGISTERED_CATALOGUE_KINDS.length);
  });

  it('sorts the registered kinds by key and refuses a key listed twice, or one the frozen list has', () => {
    assert.deepEqual(assembleCatalogueKinds(['a'], [kind('c'), kind('b')]).map((d) => d.key), ['b', 'c']);
    assert.throws(() => assembleCatalogueKinds(['a'], [kind('b'), kind('b')]), /share the key "b"/);
    assert.throws(() => assembleCatalogueKinds(['a'], [kind('a')]), /share the key "a"/);
    assert.throws(() => assembleCatalogueKinds(['a', 'a'], []), /frozen list/);
  });
});
