#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box harness for scripts/check-license-header.mjs (#563, item 7). Each
 * case makes a git repository in a temp dir with a base commit, commits the
 * pull request's change on top, and runs the unmodified checker with `--root`
 * and `--base`.
 *
 * Run: node --test scripts/check-license-header.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-license-header.mjs');

const HEADER = `/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
`;

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

/** Runs the checker on a repo whose base holds `old` and whose head adds or edits `change`. */
function check(change, old = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'license-header-'));
  try {
    git(dir, 'init', '-q');
    write(dir, { 'README.md': 'x\n', ...old });
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, change);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'change');
    const r = spawnSync('node', [CHECKER, '--root', dir, '--base', base], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('an added .ts without the header fails and is named', () => {
  const r = check({ 'src/new.ts': 'export const a = 1;\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /src\/new\.ts/);
});

test('an added .ts with the header passes', () => {
  const r = check({ 'src/new.ts': HEADER + '\nexport const a = 1;\n' });
  assert.equal(r.code, 0, r.out);
});

test('the SPDX one-liner counts as the header', () => {
  const r = check({ 'src/new.rs': '// SPDX-License-Identifier: MPL-2.0\nfn main() {}\n' });
  assert.equal(r.code, 0, r.out);
});

test('only the files without the header are named', () => {
  const r = check({ 'src/a.ts': HEADER + 'export const a = 1;\n', 'src/b.ts': 'export const b = 1;\n' });
  assert.equal(r.code, 1);
  assert.match(r.out, /src\/b\.ts/);
  assert.doesNotMatch(r.out, /src\/a\.ts/);
});

test('files the rule does not cover pass: other types, generated and dependency trees', () => {
  const r = check({
    'data/sample.json': '{}\n',
    'docs/notes.md': 'text\n',
    'packages/wasm/pkg/out.js': 'export {};\n',
    'packages/codegen/generated/types.ts': 'export type T = 1;\n',
    'node_modules/x/index.js': 'module.exports = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('a modified old file without a header passes: only added files are checked', () => {
  const r = check({ 'src/old.ts': 'export const a = 2;\n' }, { 'src/old.ts': 'export const a = 1;\n' });
  assert.equal(r.code, 0, r.out);
});

test('a header-like string in the code is not a header', () => {
  const r = check({ 'src/s.ts': 'export const s = "SPDX-License-Identifier: MPL-2.0";\n' });
  assert.equal(r.code, 1);
});

test('a base that is not a commit is an error, not a pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'license-header-'));
  try {
    git(dir, 'init', '-q');
    write(dir, { 'a.txt': 'x\n' });
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    const r = spawnSync('node', [CHECKER, '--root', dir, '--base', 'nope'], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
