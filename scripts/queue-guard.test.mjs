/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/** queue-guard (#561): the decision over fixture PR lists, and the area map. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaOf, commentFor, decideQueue, enforce } from './queue-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAP = JSON.parse(readFileSync(join(ROOT, '.github/queue-areas.json'), 'utf8'));

// All from the maintainer's account, as every agent PR is.
const pr = (number, area, extra = {}) => ({ number, draft: false, login: 'petruconduraru', labels: [], area, ...extra });
const areas = ['joinery', 'drafting', 'i18n', 'standards', 'permits', 'ci'];
const five = areas.slice(0, 5).map((a, i) => pr(100 + i, a));

test('with 5 open, a 6th PR (new area) is drafted, naming the five', () => {
  const [d] = decideQueue([...five, pr(110, 'ci')], { subject: 110 });
  assert.equal(d.action, 'draft');
  assert.equal(d.reason, 'limit');
  assert.deepEqual(d.holders, [100, 101, 102, 103, 104]);
  assert.match(commentFor(d), /#100, #101/);
});

test('a 5th PR in a new area is kept', () => {
  const [d] = decideQueue([...five.slice(0, 4), pr(110, 'ci')], { subject: 110 });
  assert.equal(d.action, 'keep');
});

test('a second PR in drafting is drafted and the PR holding the slot is named', () => {
  const [d] = decideQueue([pr(101, 'drafting'), pr(105, 'drafting')], { subject: 105 });
  assert.deepEqual(d, { number: 105, action: 'draft', reason: 'area', holders: [101], area: 'drafting' });
  assert.match(commentFor(d), /#101 already holds the slot for the drafting area/);
});

test('queue-exempt is untouched and takes no slot', () => {
  const exempt = pr(110, 'drafting', { labels: ['queue-exempt'] });
  assert.deepEqual(decideQueue([...five, exempt], { subject: 110 }), []);
  const [d] = decideQueue([...five.slice(0, 4), exempt, pr(111, 'ci')], { subject: 111 });
  assert.equal(d.action, 'keep');
});

test('the maintainer account is not exempt, Dependabot is', () => {
  const dep = pr(110, 'ci', { login: 'dependabot[bot]' });
  assert.deepEqual(decideQueue([...five, dep], { subject: 110 }), []);
  assert.equal(decideQueue([pr(1, 'ci'), pr(2, 'ci')], { subject: 2 })[0].action, 'draft');
});

test('drafts hold no slot and a draft subject is not decided', () => {
  const drafts = five.map((p) => ({ ...p, draft: true }));
  assert.equal(decideQueue([...drafts, pr(110, 'drafting')], { subject: 110 })[0].action, 'keep');
  assert.deepEqual(decideQueue([...five, pr(110, 'ci', { draft: true })], { subject: 110 }), []);
});

test('PRs with no area share only the limit, not an area', () => {
  const [d] = decideQueue([pr(1, null), pr(2, null)], { subject: 2 });
  assert.equal(d.action, 'keep');
});

test('the hourly run ranks by number: the earlier PR keeps its slot', () => {
  const out = decideQueue([...five, pr(110, 'ci'), pr(111, 'drafting')]);
  assert.deepEqual(
    out.filter((d) => d.action === 'draft').map((d) => [d.number, d.reason]),
    [[110, 'limit'], [111, 'area']],
  );
});

test('the area map: a PR takes its largest area, a label overrides, unmapped files give none', () => {
  const files = [
    'apps/viewer/src/drafting/a.ts',
    'apps/viewer/src/drafting/b.ts',
    'apps/viewer/src/joinery/c.ts',
    'apps/viewer/src/project/fields/norway-permit.ts',
  ];
  assert.equal(areaOf({ labels: [], files }, MAP), 'drafting');
  assert.equal(areaOf({ labels: ['area:joinery'], files }, MAP), 'joinery');
  assert.equal(areaOf({ labels: [], files: ['README.md'] }, MAP), null);
  const paths = {
    'apps/viewer/src/joinery/x.ts': 'joinery',
    'apps/viewer/src/components/viewer/joinery/x.tsx': 'joinery',
    'apps/viewer/src/components/viewer/drafting/standards/x.ts': 'standards',
    'apps/viewer/src/standards/x.ts': 'standards',
    'apps/viewer/src/i18n/catalogues/x.en.ts': 'i18n',
    'packages/ifcsheet/src/x.ts': 'engine/CLI',
    'packages/cli/src/x.ts': 'engine/CLI',
    'rust/geometry/x.rs': 'engine/CLI',
    'scripts/x.mjs': 'ci',
    '.github/workflows/x.yml': 'ci',
    'apps/viewer/src/project/fields/germany-permit.ts': 'permits',
  };
  for (const [file, area] of Object.entries(paths)) assert.equal(areaOf({ labels: [], files: [file] }, MAP), area, file);
});

test('every prefix in the area map exists in the repository', () => {
  for (const area of MAP.areas) {
    for (const prefix of area.prefixes || []) assert.ok(existsSync(join(ROOT, prefix)), `${area.name}: ${prefix}`);
  }
});

// #561: the first live run (PR #754) died on a refused draft conversion before
// any comment was posted. Rebuilt moment: #751 draft, #752 and #753 open.
const MOMENT = [pr(751, 'drafting', { draft: true, nodeId: 'N751' }), pr(752, 'drafting', { nodeId: 'N752' }), pr(753, 'ci', { nodeId: 'N753' }), pr(754, 'drafting', { nodeId: 'N754' })];

test('a refused draft conversion still posts the comment and exits 1', async () => {
  const decisions = decideQueue(MOMENT, { subject: 754 });
  assert.equal(decisions[0].action, 'draft');
  assert.deepEqual(decisions[0].holders, [752]);
  const comments = [];
  const code = await enforce(decisions, MOMENT, {
    draft: async () => {
      throw new Error('GitHub GraphQL: Resource not accessible by integration');
    },
    comment: async (number, body) => comments.push({ number, body }),
  });
  assert.equal(code, 1);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].number, 754);
  assert.match(comments[0].body, /#752 already holds the slot/);
  assert.match(comments[0].body, /refused/);
});

test('a successful draft conversion posts the converted comment and exits 0', async () => {
  const comments = [];
  const code = await enforce(decideQueue(MOMENT, { subject: 754 }), MOMENT, {
    draft: async (id) => assert.equal(id, 'N754'),
    comment: async (number, body) => comments.push(body),
  });
  assert.equal(code, 0);
  assert.match(comments[0], /^Converted to draft/);
});
