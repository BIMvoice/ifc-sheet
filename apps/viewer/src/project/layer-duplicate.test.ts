/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #669: duplicating a layer copies its look, sits below the original, takes a free name, moves no element, is one undo step and is saved. */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftLayer } from '@/drafting/types';
import { clearDraftHistory, editDrafts, newDraft, undoDrafts, redoDrafts } from '@/drafting/draft-store';
import { copyName, duplicateLayer, duplicateLayerIn, type CopyNames } from './layer-duplicate.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store.js';

const names: CopyNames = { first: (n) => `${n} copy`, nth: (n, k) => `${n} copy ${k}` };
const layer = (id: string, name: string, more: Partial<DraftLayer> = {}): DraftLayer => ({ id, name, color: '#18181b', visible: true, locked: false, ...more });
const OUTLINE = layer('a', 'Outline', { color: '#ff0000', lineWeight: 0.5, lineType: 'dashed', order: 3, visible: false, print: false, group: 'g' });

describe('duplicateLayerIn (#669)', () => {
  it('copies colour, weight, line type, order and visibility and puts the copy right below the original', () => {
    const layers = [layer('0', 'Layer 0'), OUTLINE, layer('z', 'Zed')];
    const out = duplicateLayerIn(layers, 'a', 'new', names);
    assert.ok(out);
    assert.deepEqual(out.layers.map((l) => l.id), ['0', 'a', 'new', 'z']);
    assert.deepEqual(out.layers[2], { ...OUTLINE, id: 'new', name: 'Outline copy' });
    assert.equal(out.copyId, 'new');
    assert.equal(layers.length, 3, 'the list it was given is left alone');
  });

  it('answers null for a layer that is not there', () => {
    assert.equal(duplicateLayerIn([layer('0', 'Layer 0')], 'nope', 'new', names), null);
  });
});

describe('copyName (#669)', () => {
  it('numbers the copy while the name is taken', () => {
    assert.equal(copyName([layer('a', 'Wall')], 'Wall', names), 'Wall copy');
    assert.equal(copyName([layer('a', 'Wall'), layer('b', 'Wall copy')], 'Wall', names), 'Wall copy 2');
    assert.equal(copyName([layer('a', 'Wall'), layer('b', 'Wall copy'), layer('c', 'wall COPY 2')], 'Wall', names), 'Wall copy 3');
  });

  it('copying a copy adds to its name, and the number is not carried', () => {
    assert.equal(copyName([layer('b', 'Wall copy')], 'Wall copy', names), 'Wall copy copy');
  });
});

describe('duplicateLayer in the project (#669)', () => {
  beforeEach(() => {
    resetProject();
    useProjectStore.setState({ draftLayers: [layer('0', 'Layer 0'), OUTLINE] });
    clearDraftHistory();
  });

  it('adds the copy below the original, moves no element, and leaves the original as it was', () => {
    const [id] = editDrafts({ add: [newDraft('p', 'a', { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } })] });
    const drafts = useProjectStore.getState().drafts;
    const copyId = duplicateLayer('a', names);
    const s = useProjectStore.getState();
    assert.ok(copyId);
    assert.deepEqual(s.draftLayers.map((l) => l.id), ['0', 'a', copyId]);
    assert.equal(s.draftLayers[2]!.name, 'Outline copy');
    assert.deepEqual(s.draftLayers[1], OUTLINE);
    assert.equal(s.drafts, drafts);
    assert.equal(s.drafts.find((d) => d.id === id)!.layerId, 'a');
  });

  it('is one undo step, and redo brings the copy back', () => {
    clearDraftHistory();
    const copyId = duplicateLayer('a', names)!;
    assert.equal(undoDrafts(), true);
    assert.deepEqual(useProjectStore.getState().draftLayers.map((l) => l.id), ['0', 'a']);
    assert.equal(undoDrafts(), false, 'nothing else was recorded');
    assert.equal(redoDrafts(), true);
    assert.deepEqual(useProjectStore.getState().draftLayers.map((l) => l.id), ['0', 'a', copyId]);
  });

  it('is saved with the project and read back whole', () => {
    const copyId = duplicateLayer('a', names)!;
    const text = serializeProject(projectDocument());
    resetProject();
    loadProjectDocument(parseProjectFile(text));
    const back = useProjectStore.getState().draftLayers.find((l) => l.id === copyId);
    assert.deepEqual(back, { ...OUTLINE, id: copyId, name: 'Outline copy' });
  });
});
