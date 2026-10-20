/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readBCF, writeBCF } from '@ifc-lite/bcf';
import { commentsToBcf, withBcfGuids } from './bcf';
import { readComments } from './file';
import { drawingOf, onElement, onPaper, sheet } from '@/test/review-bcf-fixture';

/**
 * Round trips with other BCF tools (PR #127 review): the same comment goes
 * out as the same topic every time, and what another tool did to that topic
 * comes back into it.
 */

const opts = { sheets: [sheet], drawingOf };
const exported = async (comments: Parameters<typeof commentsToBcf>[0]) => readBCF(await writeBCF(commentsToBcf(comments, opts)));
const only = <T,>(m: Map<string, T>): T => {
  assert.equal(m.size, 1);
  return [...m.values()][0];
};

describe('BCF GUIDs that stay (PR #127, item 1)', () => {
  it('sends the same topic, viewpoint and comment GUIDs after a reply is added and the project is saved and reopened', async () => {
    const first = withBcfGuids([onElement, onPaper]);
    assert.ok(first.changed, 'a comment never exported is given its GUIDs');
    assert.equal(first.comments[1].bcfGuid, undefined, 'a comment on bare paper is no topic and gets none');
    const a = only((await exported(first.comments)).topics);

    // Saved, reopened, answered here, exported again.
    const reopened = readComments(JSON.parse(JSON.stringify(first.comments)));
    reopened[0] = { ...reopened[0], replies: [...reopened[0].replies, { id: 'r2', author: 'PC', createdAt: 1760000120000, text: 'Și cota de nivel' }] };
    const second = withBcfGuids(reopened);
    const b = only((await exported(second.comments)).topics);

    assert.equal(b.guid, a.guid, 'the same topic');
    assert.equal(b.viewpoints[0].guid, a.viewpoints[0].guid, 'the same viewpoint');
    assert.equal(b.comments[0].guid, a.comments[0].guid, 'the same first comment');
    assert.equal(b.comments.length, 2);
    assert.notEqual(b.comments[1].guid, a.comments[0].guid, 'the new reply is a new comment');
    assert.equal(a.guid, first.comments[0].bcfGuid, 'the topic is the GUID the comment keeps');
  });

  it('gives a comment saved before GUIDs were kept its GUIDs on the first export, and keeps them', () => {
    const legacy = readComments(JSON.parse(JSON.stringify([onElement])));
    assert.equal(legacy[0].bcfGuid, undefined);
    const once = withBcfGuids(legacy);
    assert.ok(once.comments[0].bcfGuid && once.comments[0].bcfViewpointGuid && once.comments[0].replies[0].bcfGuid);
    const twice = withBcfGuids(readComments(JSON.parse(JSON.stringify(once.comments))));
    assert.equal(twice.changed, false, 'nothing new to give');
    assert.deepEqual(twice.comments, once.comments);
  });
});
