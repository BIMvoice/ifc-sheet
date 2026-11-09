/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/** no-stack (#561): the decision over commit lists and open-PR lists, and the merge_group skip. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNoStack } from './check-no-stack.mjs';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'check-no-stack.mjs');

// PR 10 is branch A (a1, a2). PR 11 is branch B built on A (a1, a2, b1).
const A = { number: 10, headSha: 'a2', commits: ['a1', 'a2'] };
const B = { number: 11, headSha: 'b1', commits: ['a1', 'a2', 'b1'] };
const OTHER = { number: 12, headSha: 'c1', commits: ['c1'] };

test('a normal PR into main, beside unrelated open PRs, passes', () => {
  const r = decideNoStack({ baseRef: 'main', commits: ['n1', 'n2'], openPrs: [A, OTHER] });
  assert.deepEqual(r, { ok: true, problems: [] });
});

test('a two-branch stack is flagged and names the PR it sits on', () => {
  const r = decideNoStack({ baseRef: 'main', commits: B.commits, openPrs: [A, OTHER] });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /#10/);
  assert.match(r.problems[0], /including its head commit/);
});

test('a PR that carries only part of another branch (not its head) is flagged', () => {
  const r = decideNoStack({ baseRef: 'main', commits: ['a1', 'n1'], openPrs: [A] });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /#10/);
  assert.doesNotMatch(r.problems[0], /head commit/);
});

test("the other PR's head is caught even when its commit list was cut short", () => {
  const r = decideNoStack({ baseRef: 'main', commits: ['a2', 'n1'], openPrs: [{ number: 10, headSha: 'a2', commits: [] }] });
  assert.equal(r.ok, false);
});

test('a base other than main fails', () => {
  const r = decideNoStack({ baseRef: 'feature/x', commits: ['n1'], openPrs: [] });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /feature\/x/);
});

test('every PR it sits on is named', () => {
  const r = decideNoStack({ baseRef: 'main', commits: ['a1', 'c1'], openPrs: [A, OTHER] });
  assert.equal(r.problems.length, 2);
});

test('on merge_group the script skips with a log line and exits 0', () => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, EVENT_NAME: 'merge_group' }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skipped/);
  assert.match(r.stdout, /merge queue/);
});

test('on a pull_request without a token it refuses instead of passing', () => {
  const env = { ...process.env, EVENT_NAME: 'pull_request' };
  delete env.GH_TOKEN;
  const r = spawnSync(process.execPath, [GATE], { env, encoding: 'utf8' });
  assert.equal(r.status, 2);
});
