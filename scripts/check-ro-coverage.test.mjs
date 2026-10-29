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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

/** The committed layout: a directory of `<namespace>.txt` files, one key per line. */
function runDir(measured, files, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'ro-coverage-dir-'));
  try {
    const m = join(dir, 'measured.json');
    const b = join(dir, 'baseline');
    writeFileSync(m, JSON.stringify(measured));
    if (files !== null) {
      mkdirSync(b);
      for (const [name, text] of Object.entries(files)) writeFileSync(join(b, name), text);
    }
    const r = spawnSync(process.execPath, [CHECKER, '--measured', m, '--baseline', b, '--json', ...extra], { encoding: 'utf8' });
    const after = existsSync(b) ? Object.fromEntries(readdirSync(b).sort().map((f) => [f, readFileSync(join(b, f), 'utf8')])) : null;
    return { ...r, after };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('directory baseline: keys are read from every <namespace>.txt', () => {
  const r = runDir(['a.x', 'a.y', 'b.z'], { 'a.txt': 'a.x\na.y\n', 'b.txt': 'b.z\n' });
  assert.equal(r.status, 0, r.stderr);
});

test('directory baseline: a new key and a stale key fail as with one file', () => {
  const r = runDir(['a.x', 'c.new'], { 'a.txt': 'a.x\na.y\n' });
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout.split('\n')[0]), { unlisted: ['c.new'], stale: ['a.y'] });
});

test('directory baseline: a key in the wrong namespace file fails', () => {
  const r = runDir(['a.x', 'b.z'], { 'a.txt': 'a.x\nb.z\n' });
  assert.equal(r.status, 1);
});

test('directory baseline: --update shrinks each file and deletes a namespace with no key left', () => {
  const r = runDir(['a.y'], { 'a.txt': 'a.x\na.y\n', 'b.txt': 'b.z\n' }, ['--update']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.after, { 'a.txt': 'a.y\n' });
});

test('directory baseline: --update writes one sorted file per namespace when there is none yet', () => {
  const r = runDir(['b.z', 'a.y', 'a.x'], null, ['--update']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.after, { 'a.txt': 'a.x\na.y\n', 'b.txt': 'b.z\n' });
});

test('directory baseline: --update refuses to add a key and writes nothing', () => {
  const r = runDir(['a.x', 'b.new'], { 'a.txt': 'a.x\n' }, ['--update']);
  assert.equal(r.status, 1);
  assert.deepEqual(r.after, { 'a.txt': 'a.x\n' });
});
