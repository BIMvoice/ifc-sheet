/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tagging an IfcSign with what the model carries on it (#788): its Description, a property of a custom set, and an
 * edit of the Tag fields that changes the tags already placed. The real TAG tool path (`elementLabel`, `refreshElementTags`)
 * over a hand-written IFC4 with two signs (`signs-with-pset.ifc`).
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { newDraft } from '@/drafting/draft-store';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import { refreshElementTags } from '@/project/useElementTagSync.js';
import { elementLabel } from './element-tag.js';
import { previewElements } from './preview-elements.js';
import { setFieldSources } from './tag-fields-actions.js';

let sign = '';
beforeEach(async () => {
  resetProject();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/signs-with-pset.ifc')));
  seedModel('signs', 0, store, 120);
  sign = store.entities.getGlobalId(120);
});
afterEach(() => cleanup());

const tagText = (): string => {
  const d = useProjectStore.getState().drafts[0];
  return d.shape.type === 'leader' ? d.shape.text : '';
};

describe('tagging an IfcSign (#788)', () => {
  it('the Tag fields panel offers the signs to preview, so their properties can be picked', () => {
    assert.equal(previewElements('other').length, 2);
  });

  it('a Custom tag shows the sign Description, with nothing set', () => {
    assert.equal(elementLabel(sign, 'custom'), 'Emergency exit, left stair');
    assert.equal(elementLabel(sign, 'mark'), 'S-01', 'the other choices read what they always did');
  });

  it('a Custom tag shows a property of a custom set once the sources say so', () => {
    setFieldSources('other', 'custom', [{ kind: 'pset', pset: 'Acme_Signage', property: 'SignText' }]);
    assert.equal(elementLabel(sign, 'custom'), 'EXIT - IESIRE');
  });

  it('the first source with a value wins: ObjectType, then the property', () => {
    setFieldSources('other', 'custom', [{ kind: 'attribute', name: 'LongName' }, { kind: 'attribute', name: 'ObjectType' }]);
    assert.equal(elementLabel(sign, 'custom'), 'Exit sign', 'an IfcSign has no LongName, so the next source is read');
  });

  it('editing the sources changes the tag already on the sheet, and the choice survives the project file', () => {
    useProjectStore.setState({ drafts: [newDraft('v', '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'x', height: 0.25 }, { tagOf: sign, tagField: 'custom' })] });
    refreshElementTags();
    assert.equal(tagText(), 'Emergency exit, left stair');
    setFieldSources('other', 'custom', [{ kind: 'pset', pset: 'Acme_Signage', property: 'SignText' }]);
    refreshElementTags();
    assert.equal(tagText(), 'EXIT - IESIRE');
    const saved = serializeProject(projectDocument());
    resetProject();
    loadProjectDocument(parseProjectFile(saved));
    assert.deepEqual(useProjectStore.getState().tagFields?.other?.custom, [{ kind: 'pset', pset: 'Acme_Signage', property: 'SignText' }]);
  });
});
