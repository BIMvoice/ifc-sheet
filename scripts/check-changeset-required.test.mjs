#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box harness for scripts/check-changeset-required.mjs. Each case makes
 * a git repository in a temp dir with a base commit, commits the pull
 * request's change on top, and runs the unmodified checker with `--root` and
 * `--base`.
 *
 * Run: node --test scripts/check-changeset-required.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { touchedPackages } from './check-changeset-required.mjs';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-changeset-required.mjs');

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

function git(dir, ...argv) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

const BASE = {
  'packages/geometry/package.json': JSON.stringify({ name: '@ifc-lite/geometry', version: '1.0.0' }),
  'packages/geometry/src/index.ts': 'export const a = 1;\n',
  'apps/viewer/package.json': JSON.stringify({ name: '@ifc-lite/viewer', private: true }),
  'apps/viewer/src/app.ts': 'export const v = 1;\n',
  'apps/server/package.json': JSON.stringify({ name: '@ifc-lite/server' }),
  'apps/server/src/main.ts': 'export const s = 1;\n',
  'packages/internal/package.json': JSON.stringify({ name: '@ifc-lite/internal', private: true }),
  'packages/internal/src/index.ts': 'export const i = 1;\n',
  '.changeset/README.md': 'readme\n',
};

/** Runs the checker on a repo whose head commit adds `change` on top of BASE. */
function check(change, { remove = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'changeset-required-'));
  try {
    write(dir, BASE);
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, change);
    for (const rel of remove) rmSync(join(dir, rel));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');
    const r = spawnSync('node', [CHECKER, '--root', dir, '--base', base], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SRC_CHANGE = { 'packages/geometry/src/index.ts': 'export const a = 2;\n' };
const changeset = (body) => ({ '.changeset/brave-owl.md': body });

test('fails a published package src/ change with no changeset, naming the package, a file and the fix', () => {
  const r = check(SRC_CHANGE);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /@ifc-lite\/geometry: 1 file\(s\), e\.g\. packages\/geometry\/src\/index\.ts/);
  assert.match(r.out, /pnpm changeset/);
});

test('passes when a changeset in the pull request names the package', () => {
  const r = check({ ...SRC_CHANGE, ...changeset('---\n"@ifc-lite/geometry": patch\n---\n\nFix.\n') });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /each named by a changeset/);
});

test('an unquoted package name in the frontmatter counts too (the parser, not a regex)', () => {
  const r = check({ ...SRC_CHANGE, ...changeset('---\n\'@ifc-lite/geometry\': minor\n---\n\nAdd.\n') });
  assert.equal(r.status, 0, r.out);
});

test('a changeset naming a different package does not cover this one', () => {
  const r = check({ ...SRC_CHANGE, ...changeset('---\n"@ifc-lite/other": patch\n---\n\nx\n') });
  assert.equal(r.status, 1, r.out);
});

test('an empty changeset declares no release and passes, saying what it covered', () => {
  const r = check({ ...SRC_CHANGE, ...changeset('---\n---\n') });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /@ifc-lite\/geometry declared as no release by \.changeset\/brave-owl\.md/);
});

test('a changeset already pending on the base does not cover a new change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changeset-required-pending-'));
  try {
    write(dir, { ...BASE, ...changeset('---\n"@ifc-lite/geometry": patch\n---\n\nold\n') });
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, SRC_CHANGE);
    git(dir, 'commit', '-q', '-am', 'head');
    const r = spawnSync('node', [CHECKER, '--root', dir, '--base', base], { encoding: 'utf8' });
    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('private packages, test files and files outside src/ need no changeset', () => {
  assert.equal(check({ 'apps/viewer/src/app.ts': 'export const v = 2;\n' }).status, 0);
  assert.equal(check({ 'packages/internal/src/index.ts': 'export const i = 2;\n' }).status, 0);
  assert.equal(check({ 'packages/geometry/src/index.test.ts': 'test\n' }).status, 0);
  assert.equal(check({ 'packages/geometry/src/__fixtures__/a.ifc': 'x\n' }).status, 0);
  assert.equal(check({ 'packages/geometry/README.md': 'docs\n' }).status, 0);
});

test('nothing under apps/ needs one, even an app whose package.json is not marked private', () => {
  const r = check({ 'apps/server/src/main.ts': 'export const s = 2;\n' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /nothing to check/);
});

test('a docs-only or CI-only pull request passes', () => {
  assert.equal(check({ 'docs/guide.md': 'docs\n', 'README.md': 'x\n' }).status, 0);
  assert.equal(check({ '.github/workflows/ci.yml': 'on: push\n', 'scripts/check-x.mjs': 'x\n' }).status, 0);
});

test('a changeset it does not require is not refused (a viewer change with a viewer changeset)', () => {
  const r = check({ 'apps/viewer/src/app.ts': 'export const v = 2;\n', ...changeset('---\n"@ifc-lite/viewer": minor\n---\n\nx\n') });
  assert.equal(r.status, 0, r.out);
});

test('deleting a published src/ file counts as a change', () => {
  const r = check({}, { remove: ['packages/geometry/src/index.ts'] });
  assert.equal(r.status, 1, r.out);
});

test('an unparseable changeset fails with its path', () => {
  const r = check({ ...SRC_CHANGE, ...changeset('---\n"@ifc-lite/geometry": sideways\n---\n') });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\.changeset\/brave-owl\.md/);
});

test('refuses when the base cannot be read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changeset-required-nobase-'));
  const r = spawnSync('node', [CHECKER, '--root', dir, '--base', 'deadbeef'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
});

test('touchedPackages groups by package and skips tests', () => {
  const m = touchedPackages(['packages/a/src/x.ts', 'packages/a/src/y.spec.tsx', 'packages/a/src/z.ts', 'apps/b/src/q.ts', 'packages/c/test/t.ts']);
  assert.deepEqual([...m.keys()], ['packages/a']);
  assert.equal(m.get('packages/a').length, 2);
});
