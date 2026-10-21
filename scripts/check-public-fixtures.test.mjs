#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box harness for scripts/check-public-fixtures.mjs: each case builds a
 * git tree in a temp dir, runs the unmodified checker on it with `--root`, and
 * asserts the exit code and the message.
 *
 * Run: node --test scripts/check-public-fixtures.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllowlist, violation, MAX_BYTES } from './check-public-fixtures.mjs';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-public-fixtures.mjs');

/** A git tree of `{ path: contents }`, all files added to the index. */
function tree(files, { allowlist } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'public-fixtures-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  if (allowlist !== undefined) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'public-assets-allowlist.txt'), allowlist);
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

const ICON = { 'apps/viewer/public/favicon.ico': 'icon' };

test('passes a public folder of small app assets, and a fixture next to its test', () => {
  const r = run(tree({ ...ICON, 'apps/viewer/src/project/__fixtures__/house.ifc': 'ISO-10303-21;' }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 tracked files under apps/);
});

for (const ext of ['ifc', 'IFC', 'ifczip', 'ifcxml', 'ifcx']) {
  test(`fails an .${ext} model under public/, naming the file and the fix`, () => {
    const r = run(tree({ ...ICON, [`apps/viewer/public/_fixtures/house.${ext}`]: 'x' }));
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`apps/viewer/public/_fixtures/house\\.${ext}: an IFC model`));
    assert.match(r.out, /__fixtures__/);
    assert.match(r.out, /pnpm fixtures/);
  });
}

test('fails under any app, not only the viewer', () => {
  const r = run(tree({ ...ICON, 'apps/landing/public/demo.ifc': 'x' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /apps\/landing\/public\/demo\.ifc/);
});

test('fails a non-IFC file over 1 MiB, and passes one at exactly 1 MiB', () => {
  const big = run(tree({ ...ICON, 'apps/viewer/public/data/points.bin': Buffer.alloc(MAX_BYTES + 1) }));
  assert.equal(big.status, 1, big.out);
  assert.match(big.out, /points\.bin: 1\.0 MiB, over the 1 MiB limit/);
  const edge = run(tree({ ...ICON, 'apps/viewer/public/data/points.bin': Buffer.alloc(MAX_BYTES) }));
  assert.equal(edge.status, 0, edge.out);
});

test('ignores untracked files (the gitignored wasm runtime the build copies in)', () => {
  const dir = tree(ICON);
  writeFileSync(join(dir, 'apps/viewer/public/ifc-lite_bg.wasm'), Buffer.alloc(MAX_BYTES + 1));
  writeFileSync(join(dir, 'apps/viewer/public/scratch.ifc'), 'x');
  assert.equal(run(dir).status, 0);
});

test('an allowlisted sample passes; the same file unlisted fails', () => {
  const files = { ...ICON, 'apps/viewer/public/samples/demo.ifc': 'x' };
  const listed = run(tree(files, { allowlist: 'apps/viewer/public/samples/demo.ifc  # the demo model the app opens\n' }));
  assert.equal(listed.status, 0, listed.out);
  assert.equal(run(tree(files, { allowlist: '# nothing\n' })).status, 1);
});

test('an allowlist row without a reason fails', () => {
  const r = run(tree({ ...ICON, 'apps/viewer/public/samples/demo.ifc': 'x' }, { allowlist: 'apps/viewer/public/samples/demo.ifc\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /has no reason/);
});

test('a stale allowlist row is a note, not a failure', () => {
  const r = run(tree(ICON, { allowlist: 'apps/viewer/public/samples/gone.ifc  # was the demo model\n' }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /note: apps\/viewer\/public\/samples\/gone\.ifc/);
});

test('refuses to pass when it found no public file at all (wrong tree)', () => {
  const r = run(tree({ 'apps/viewer/src/a.ts': 'x' }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /cannot be trusted/);
});

test('refuses outside a git tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'public-fixtures-nogit-'));
  const r = run(dir);
  assert.equal(r.status, 2, r.out);
});

test('violation and parseAllowlist, directly', () => {
  assert.equal(violation('apps/x/public/a.png', 10), null);
  assert.equal(violation('apps/x/public/a.ifc', 10), 'an IFC model');
  const { entries, errors } = parseAllowlist('# c\n\na.ifc  # a real reason here\nb.ifc # short\n');
  assert.deepEqual([...entries.keys()], ['a.ifc']);
  assert.equal(errors.length, 1);
});
