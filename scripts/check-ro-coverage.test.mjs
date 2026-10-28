#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box test of scripts/check-ro-coverage.mjs: the measured list comes
 * from a JSON file (`--measured`) so no catalogue build is needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-ro-coverage.mjs');

function run(measured, baseline, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'ro-coverage-'));
  try {
    const m = join(dir, 'measured.json');
    const b = join(dir, 'baseline.json');
    writeFileSync(m, JSON.stringify(measured));
    if (baseline !== null) writeFileSync(b, JSON.stringify(baseline));
    const r = spawnSync(process.execPath, [CHECKER, '--measured', m, '--baseline', b, '--json', ...extra], { encoding: 'utf8' });
    return { ...r, baselineAfter: baseline === null ? null : JSON.parse(readFileSync(b, 'utf8')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('clean: every missing key is baselined', () => {
  const r = run(['a.x', 'b.y'], ['a.x', 'b.y']);
  assert.equal(r.status, 0, r.stderr);
});

test('a new English key without Romanian fails and is named', () => {
  const r = run(['a.x', 'new.key'], ['a.x']);
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout), { unlisted: ['new.key'], stale: [] });
});

test('a baselined key that now has Romanian fails until the baseline shrinks', () => {
  const r = run(['a.x'], ['a.x', 'b.y']);
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout), { unlisted: [], stale: ['b.y'] });
});

test('--update shrinks the baseline, after which the check passes', () => {
  const up = run(['a.x'], ['a.x', 'b.y'], ['--update']);
  assert.equal(up.status, 0, up.stderr);
  assert.deepEqual(up.baselineAfter, ['a.x']);
});

test('--update refuses to add a key', () => {
  const up = run(['a.x', 'new.key'], ['a.x'], ['--update']);
  assert.equal(up.status, 1);
  assert.deepEqual(JSON.parse(up.stdout).unlisted, ['new.key']);
  assert.deepEqual(up.baselineAfter, ['a.x']);
});

test('a missing baseline fails instead of passing', () => {
  const r = run(['a.x'], null);
  assert.equal(r.status, 1);
});
