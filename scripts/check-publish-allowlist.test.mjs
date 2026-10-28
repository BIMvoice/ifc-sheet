#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Run: node --test scripts/check-publish-allowlist.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { violations, ALLOWED_TO_PUBLISH } from './check-publish-allowlist.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'check-publish-allowlist.mjs');

function workspace(pkgs) {
  const dir = mkdtempSync(join(tmpdir(), 'publish-guard-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'root', private: true }));
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  for (const [d, pkg] of Object.entries(pkgs)) {
    mkdirSync(join(dir, 'packages', d), { recursive: true });
    writeFileSync(join(dir, 'packages', d, 'package.json'), JSON.stringify(pkg));
  }
  return dir;
}
const run = (root) => spawnSync('node', [GUARD, '--root', root], { encoding: 'utf8' });

test('a non-private @ifc-lite package fails, named', () => {
  const dir = workspace({ x: { name: '@ifc-lite/x', version: '1.0.0' } });
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /@ifc-lite\/x/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('a non-private package off the allowlist fails', () => {
  const dir = workspace({ y: { name: 'some-other', version: '1.0.0' } });
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /some-other/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('private packages and the allowlisted package pass', () => {
  const dir = workspace({
    x: { name: '@ifc-lite/x', version: '1.0.0', private: true },
    s: { name: '@bimvoice/ifcsheet', version: '1.0.0' },
  });
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true }); }
});

test('an @ifc-lite name on the allowlist is still refused', () => {
  const dir = workspace({ x: { name: '@ifc-lite/x', version: '1.0.0' } });
  try {
    const v = violations(dir, ['@ifc-lite/x']);
    assert.ok(v.some((m) => m.includes('allowlist entry @ifc-lite/x')));
    assert.ok(v.some((m) => m.includes('not private')));
  } finally { rmSync(dir, { recursive: true }); }
});

test('the real repository publishes nothing outside the allowlist', () => {
  const r = run(join(HERE, '..'));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(ALLOWED_TO_PUBLISH, ['@bimvoice/ifcsheet']);
});
