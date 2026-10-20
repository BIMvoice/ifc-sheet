/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotationType } from '@/catalogue/types';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import { settleLabels } from './label-sync.js';
import { wall } from './label-fixture.js';
import type { LabelElement } from './label-resolve.js';

const type = (over: Partial<AnnotationType['label'] & object> = {}): AnnotationType => ({ id: 'at1', name: 'Wall label', tool: 'label', label: { template: '{Name}\n{Qto_WallBaseQuantities.Length:0.00 m}', missing: 'question', ...over } });
const label = (params: Record<string, string | number | boolean> = {}): DraftEntity => newDraft('v', '0', { type: 'text', p: { x: 1, y: 2 }, text: 'old', height: 0.25, rotation: 0 }, { labelOf: 'G1', atype: 'at1', ...params });
const byGuid = (el: LabelElement | null) => (guid: string) => (guid === 'G1' ? el : null);
const text = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text : null);

describe('settleLabels', () => {
  it('writes the template resolved for the element', () => {
    const [d] = settleLabels([label()], [type()], byGuid(wall()));
    assert.equal(text(d), 'W-01\n4.29 m');
  });
  it('follows a change of the element: a renamed element and an edited quantity', () => {
    const first = settleLabels([label()], [type()], byGuid(wall()));
    const renamed = wall({ attribute: (n) => (n === 'Name' ? 'W-02' : '') , quantitySets: () => [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'Length', value: 5 }] }] });
    const second = settleLabels(first, [type()], byGuid(renamed));
    assert.equal(text(second[0]), 'W-02\n5.00 m');
    assert.equal(second[0].id, first[0].id, 'the same draft, not a new one');
  });
  it('follows a change of the type: template, frame', () => {
    const first = settleLabels([label()], [type()], byGuid(wall()));
    const second = settleLabels(first, [type({ template: 'Fire {Pset_WallCommon.FireRating}', frame: 'bubble' })], byGuid(wall()));
    assert.equal(text(second[0]), 'Fire EI 60');
    assert.ok(second[0].shape.type === 'text' && second[0].shape.frame === 'bubble');
    const third = settleLabels(second, [type({ template: 'Fire {Pset_WallCommon.FireRating}' })], byGuid(wall()));
    assert.ok(third[0].shape.type === 'text' && !('frame' in third[0].shape), 'dropping the frame takes it off');
  });
  it('returns the very same array when nothing changed', () => {
    const once = settleLabels([label()], [type()], byGuid(wall()));
    assert.equal(settleLabels(once, [type()], byGuid(wall())), once);
  });
  it('keeps what a label said when its element or its type is gone', () => {
    const drafts = [label()];
    assert.equal(settleLabels(drafts, [type()], byGuid(null)), drafts);
    assert.equal(settleLabels(drafts, [], byGuid(wall())), drafts);
    assert.equal(settleLabels(drafts, [{ id: 'at1', name: 'x', tool: 'label' }], byGuid(wall())), drafts, 'a type with no label spec');
  });
  it('leaves other drawing alone: plain text, element tags, a label of another element', () => {
    const plain = newDraft('v', '0', { type: 'text', p: { x: 0, y: 0 }, text: 'Note', height: 0.25, rotation: 0 });
    const tag = newDraft('v', '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'M1', height: 0.25 }, { tagOf: 'G1' });
    const other = label({ labelOf: 'G2' });
    const drafts = [plain, tag, other];
    assert.equal(settleLabels(drafts, [type()], byGuid(wall())), drafts);
  });
  it('resolves with the placeholder of the type', () => {
    const el = wall({ quantitySets: () => [] });
    assert.equal(text(settleLabels([label()], [type({ missing: 'empty' })], byGuid(el))[0]), 'W-01\n');
    assert.equal(text(settleLabels([label()], [type({ missing: 'field' })], byGuid(el))[0]), 'W-01\nQto_WallBaseQuantities.Length');
  });
});
