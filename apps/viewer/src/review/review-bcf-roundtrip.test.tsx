/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBCFComment, readBCF, writeBCF } from '@ifc-lite/bcf';
import { bcfToComments, commentsToBcf, withBcfGuids } from './bcf';
import { readComments } from './file';
import { drawingOf, guidOf, onElement, onPaper, sheet } from '@/test/review-bcf-fixture';

/**
 * Round trips with other BCF tools (PR #127 review): the same comment goes
 * out as the same topic every time, and what another tool did to that topic
 * comes back into it.
 */

const opts = { sheets: [sheet], drawingOf };
const exported = async (comments: Parameters<typeof commentsToBcf>[0]) => readBCF(await writeBCF(commentsToBcf(comments, opts)));
const importing = () => {
  let n = 0;
  return { sheets: [sheet], drawingOf, guidOf, newId: () => `new-${++n}` };
};
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

describe('a topic another tool changed, read back (PR #127, item 2)', () => {
  it('brings its reply and its Closed status into the comment, by GUID; the same file again adds nothing; the next export is the same topic', async () => {
    const ours = withBcfGuids([onElement]).comments;
    // The other tool: someone answers and closes the topic.
    const elsewhere = await exported(ours);
    const topic = only(elsewhere.topics);
    topic.comments.push(createBCFComment({ author: 'Mihai Pop', comment: 'Rezolvat în modelul de structură' }));
    topic.topicStatus = 'Closed';
    const file = await writeBCF(elsewhere);

    const opts = importing();
    const first = bcfToComments(await readBCF(file), ours, opts);
    assert.deepEqual([first.comments.length, first.updated.length, first.merged, first.known], [0, 1, 1, 0]);
    const merged = first.updated[0];
    assert.equal(merged.id, 'c1', 'the same comment');
    assert.equal(merged.status, 'done', 'the status set elsewhere');
    assert.deepEqual(merged.replies.map((r) => [r.author, r.text]), [['Ioana Pătrașcu', 'Adăugată în plan'], ['Mihai Pop', 'Rezolvat în modelul de structură']]);

    const again = bcfToComments(await readBCF(file), [merged], opts);
    assert.deepEqual([again.comments.length, again.updated.length, again.known], [0, 0, 1], 'the same file twice: nothing new');

    const next = only((await exported(withBcfGuids([merged]).comments)).topics);
    assert.equal(next.guid, topic.guid, 'the other tool gets its own topic back');
    assert.deepEqual(next.comments.map((c) => c.guid), topic.comments.map((c) => c.guid), 'and its own comments, no copies');
    assert.equal(next.topicStatus, 'Closed');
  });

  it('matches a topic exported before GUIDs were kept by its comment label, and the comment learns the topic GUID', async () => {
    // Exported by the first version: fresh GUIDs, none kept.
    const old = only((await exported([onElement])).topics);
    const back = bcfToComments({ ...(await exported([onElement])), topics: new Map([[old.guid, old]]) }, [onElement], importing());
    assert.deepEqual([back.comments.length, back.updated.length, back.merged, back.known], [0, 1, 0, 1]);
    assert.equal(back.updated[0].bcfGuid, old.guid);
    assert.deepEqual(back.updated[0].replies.map((r) => r.bcfGuid), [old.comments[0].guid], 'the reply is the same one, not a copy');
  });
});

describe('a topic from another tool, read twice (PR #127, item 3)', () => {
  it('becomes one comment that keeps the topic GUID, and the same file again adds nothing', async () => {
    const foreign = await exported([onElement]);
    const topic = only(foreign.topics);
    topic.labels = [];
    topic.guid = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    foreign.topics = new Map([[topic.guid, topic]]);
    const file = await writeBCF(foreign);
    const opts = importing();
    const first = bcfToComments(await readBCF(file), [], opts);
    assert.equal(first.comments.length, 1);
    assert.equal(first.comments[0].bcfGuid, topic.guid);
    assert.equal(first.comments[0].bcfViewpointGuid, topic.viewpoints[0].guid);
    assert.deepEqual(first.comments[0].replies.map((r) => r.bcfGuid), topic.comments.map((c) => c.guid));
    const second = bcfToComments(await readBCF(file), first.comments, opts);
    assert.deepEqual([second.comments.length, second.updated.length, second.known], [0, 0, 1]);
    // Exported from here it is still the other tool's topic.
    assert.equal(only((await exported(withBcfGuids(first.comments).comments)).topics).guid, topic.guid);
  });
});
