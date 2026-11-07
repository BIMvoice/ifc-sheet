#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The decision under scripts/check-house-rules.mjs (#563), over fixture
 * counts, and the CLI over a synthetic tree with real oxlint.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS } from './check-lint-ran.mjs';
import { decide, keyOf, countHits } from './lib/house-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-house-rules.mjs');

const A = keyOf('apps/x/a.ts', 'empty-catch');
const B = keyOf('apps/x/b.ts', 'no-explicit-any');

test('a count above its baseline row fails (#563)', () => {
  const r = decide({ [A]: 3 }, { [A]: 2 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.regressions, [{ key: A, count: 3, allowed: 2 }]);
});

test('an equal count passes', () => {
  assert.equal(decide({ [A]: 2, [B]: 1 }, { [A]: 2, [B]: 1 }).ok, true);
});

test('a lower count passes and is reported as an improvement', () => {
  const r = decide({ [A]: 1 }, { [A]: 2, [B]: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.improvements.map((i) => i.key), [A, B]);
});

test('a hit in a file with no baseline row fails', () => {
  const r = decide({ [A]: 1, [B]: 1 }, { [A]: 1 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.regressions, [{ key: B, count: 1, allowed: 0 }]);
});

test('only the three house rules are counted', () => {
  const counts = countHits(
    [
      { code: 'eslint(no-empty)', filename: 'a.ts' },
      { code: 'typescript(ban-ts-comment)', filename: 'a.ts' },
      { code: 'typescript(no-explicit-any)', filename: 'a.ts' },
      { code: 'eslint(no-unused-vars)', filename: 'a.ts' },
    ],
    '/r',
    '/r',
  );
  assert.deepEqual(counts, {
    [keyOf('a.ts', 'empty-catch')]: 1,
    [keyOf('a.ts', 'ts-ignore')]: 1,
    [keyOf('a.ts', 'no-explicit-any')]: 1,
  });
});

function withTree(source, fn) {
  const root = mkdtempSync(join(tmpdir(), 'house-rules-'));
  try {
    for (const { dir } of TARGETS) mkdirSync(join(root, dir), { recursive: true });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'apps', 'f.ts'), source);
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root, ...flags) =>
  spawnSync(process.execPath, [CHECKER, '--root', root, ...flags], { encoding: 'utf8' });

test('CLI: an empty catch, as any and ts-ignore fail against an empty baseline; a recorded baseline passes', () => {
  const bad =
    'export function f(x: unknown) {\n  try { g(); } catch {}\n  // @ts-ignore\n  const n: number = "a";\n  return (x as any) + n;\n}\ndeclare function g(): void;\n';
  withTree(bad, (root) => {
    assert.equal(run(root, '--update').status, 0);
    assert.equal(run(root).status, 0);
    // A second empty catch is a rise.
    writeFileSync(join(root, 'apps', 'f.ts'), `${bad}export function h() { try { g(); } catch {} }\n`);
    const r = run(root);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /apps\/f\.ts :: empty-catch: 2 \(baseline 1/);
  });
});

test('CLI: a catch that logs passes', () => {
  withTree('declare function g(): void;\nexport function f() { try { g(); } catch (e) { console.error(e); } }\n', (root) => {
    const r = run(root, '--update');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(run(root).status, 0);
  });
});
