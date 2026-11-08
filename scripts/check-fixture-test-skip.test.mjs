#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box harness for scripts/check-fixture-test-skip.mjs: each case builds a
 * git tree in a temp dir, runs the unmodified checker on it with `--root`, and
 * asserts the exit code and the message.
 *
 * Run: node --test scripts/check-fixture-test-skip.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingGuard, readsFixture } from './check-fixture-test-skip.mjs';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-fixture-test-skip.mjs');

function tree(files, { baseline } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-test-skip-'));
  const all = { 'packages/a/src/plain.test.ts': "import { test } from 'node:test';\n", ...files };
  for (const [rel, body] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  if (baseline !== undefined) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'fixture-test-skip-baseline.txt'), baseline);
  }
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

function run(dir) {
  const r = spawnSync('node', [CHECKER, '--root', dir], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const GUARDED = `import { existsSync, readFileSync } from 'node:fs';
const FZK = new URL('../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url);
test('x', { skip: !existsSync(FZK) && 'AC20-FZK-Haus.ifc missing, run \`pnpm fixtures\`' }, () => { readFileSync(FZK); });
`;
const UNGUARDED = `import { readFileSync } from 'node:fs';
const FZK = new URL('../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url);
test('x', () => { readFileSync(FZK); });
`;

test('passes a fixture read that skips with a pnpm fixtures message', () => {
  const r = run(tree({ 'apps/viewer/src/a.test.ts': GUARDED }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 read tests\/models/);
});

test('fails a fixture read with no guard, naming the file and the fix', () => {
  const r = run(tree({ 'apps/viewer/src/a.test.ts': UNGUARDED }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /apps\/viewer\/src\/a\.test\.ts: reads a file under tests\/models; no existence check/);
  assert.match(r.out, /pnpm fixtures/);
});

test('fails a skip whose message never says pnpm fixtures, also when only a comment does', () => {
  const src = GUARDED.replace("'AC20-FZK-Haus.ifc missing, run `pnpm fixtures`'", "'missing'") + '// run `pnpm fixtures`\n';
  const r = run(tree({ 'packages/b/src/b.test.ts': src }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /message does not say `pnpm fixtures`/);
});

test('fails an existence check that throws instead of skipping', () => {
  const src = "const P = join(root, 'tests', 'models', 'x.ifc');\nif (!existsSync(P)) throw new Error('run `pnpm fixtures`');\nreadFileSync(P);\n";
  const r = run(tree({ 'packages/b/src/c.test.ts': src }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /never skips/);
});

test('accepts the viewer helper planModelMissing, and a warn plus skipIf', () => {
  const helper = "const P = new URL('../../../tests/models/ara3d/a.ifc', import.meta.url);\ndescribe('x', { skip: planModelMissing(P) }, () => { readFileSync(P); });\n";
  const warn = "const P = resolve(dir, 'tests/models/ifc5/a.ifcx');\nconst ok = existsSync(P);\nif (!ok) console.warn('skipped, run `pnpm fixtures`');\ndescribe.skipIf(!ok)('x', () => { readFileSync(P); });\n";
  const r = run(tree({ 'a/1.test.ts': helper, 'a/2.test.ts': warn }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /2 read tests\/models/);
});

test('does not count the committed manifest, a path in a comment, or a path with no reader', () => {
  const src = `// reads tests/models/ara3d/AC20-FZK-Haus.ifc when fetched
const m = readFileSync(join(root, 'tests', 'models', 'manifest.json'), 'utf8');
`;
  const noReader = "const label = 'tests/models/ara3d/a.ifc';\nexpect(label).toBe(x);\n";
  const r = run(tree({ 'packages/c/src/d.test.ts': src, 'packages/c/src/e.test.ts': noReader }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /0 read tests\/models/);
});

test('ignores tests under scripts/, which build throwaway trees', () => {
  const r = run(tree({ 'scripts/e.test.mjs': UNGUARDED }));
  assert.equal(r.status, 0, r.out);
});

test('baseline: a listed failing file passes; a listed file that now passes or is gone fails', () => {
  const files = { 'packages/v/src/f.test.ts': UNGUARDED };
  assert.equal(run(tree(files, { baseline: 'packages/v/src/f.test.ts\n' })).status, 0);
  const fixed = run(tree({ 'packages/v/src/f.test.ts': GUARDED }, { baseline: 'packages/v/src/f.test.ts\n' }));
  assert.equal(fixed.status, 1, fixed.out);
  assert.match(fixed.out, /no longer apply/);
  assert.equal(run(tree({}, { baseline: 'packages/gone.test.ts\n' })).status, 1);
});

test('refuses a tree with no test files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-test-skip-empty-'));
  writeFileSync(join(dir, 'a.ts'), 'x');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  const r = run(dir);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /cannot be trusted/);
});

test('helpers: readsFixture and missingGuard', () => {
  assert.equal(readsFixture("readFileSync('../tests/models/a.ifc')"), 'a file under tests/models');
  assert.equal(readsFixture("readFileSync('../tests/models/manifest.json')"), null);
  assert.equal(missingGuard("existsSync(P); it.skipIf(x); 'run `pnpm fixtures`'"), null);
});
