#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Run the repository gate scripts on this checkout (the head) and on a second
 * checkout of the merge base, and fail only when the head prints output lines
 * the base did not print.
 *
 * WHY: some gates already fail on main. A plain "run the gate" job would be red
 * for every pull request until that debt is paid, and a red check nobody can
 * clear gets ignored. Comparing against the base keeps the check meaningful: a
 * pull request fails only for what it adds.
 *
 * Usage:
 *   node scripts/ci-gates-vs-base.mjs [<base-checkout-dir>]
 *
 * Without an argument the script makes a temporary detached worktree at
 * `git merge-base origin/main HEAD` and removes it afterwards. In CI the
 * workflow passes a worktree of the pull request's base commit.
 *
 * A gate passes when it exits 0 on the head, or when every normalised output
 * line of the head also appears in the base's output. A gate that exits
 * non-zero with no output at all fails. A gate that does not exist on the base
 * (a new gate) is compared against empty output.
 *
 * The base checkout borrows the head's root node_modules (a symlink) when it
 * has none, because some gates import `typescript`.
 *
 * Normalisation: surrounding whitespace is trimmed, blank lines are dropped,
 * and hex commit ids are replaced with <sha>, because gates quote the commit
 * they compared against and that differs between the two runs.
 *
 * Two kinds of line are not compared as text:
 *  - `note:` lines are advisory by the gates' own design (module-size slack,
 *    stale rows). A pull request that shrinks a file adds a new "headroom"
 *    note; that is an improvement, never a failure.
 *  - `<path>: <N> lines…` lines name a file and its size. A head line fails
 *    only when the base has no line for that path, or the head's count is
 *    higher. A file that shrinks but stays over its budget prints a new count;
 *    that is not a new failure either.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATES = [
  'scripts/check-module-size.mjs',
  'scripts/check-test-wiring.mjs',
  'scripts/check-source-text-assertions.mjs',
];

export function normalise(text) {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\b[0-9a-f]{7,40}\b/g, '<sha>'))
    .filter((line) => line !== '');
}

/**
 * The module-size allowlist summary when the head only lowered or deleted
 * budgets ("+0 added, ^0 raised"): an improvement, so it is not a new failure.
 */
export function isImprovementOnly(line) {
  return /:\s*\+0 added, \^0 raised, v\d+ lowered, -\d+ deleted$/.test(line);
}

/** An advisory line: gates print these for slack and stale rows, which never fail a check by themselves. */
export function isAdvisory(line) {
  return line.startsWith('note:');
}

const SIZED = /^(.+?): (\d+) lines\b/;

/** `{ path, lines }` for a line naming a file and its size (`path: N lines…`), else null. */
export function sizedEntry(line) {
  const m = SIZED.exec(line);
  return m ? { path: m[1], lines: Number(m[2]) } : null;
}

/**
 * Lines in `head` that are not in `base`, in head order, without repeats.
 * Advisory notes never count; a sized line counts only for a path the base
 * did not name, or at a higher count than the base's.
 */
export function newLines(head, base) {
  const known = new Set(base);
  const baseSizes = new Map();
  for (const line of base) {
    const entry = sizedEntry(line);
    if (entry) baseSizes.set(entry.path, Math.max(baseSizes.get(entry.path) ?? 0, entry.lines));
  }
  const seen = new Set();
  const out = [];
  for (const line of head) {
    if (known.has(line) || seen.has(line) || isImprovementOnly(line) || isAdvisory(line)) continue;
    const entry = sizedEntry(line);
    if (entry && baseSizes.has(entry.path) && entry.lines <= baseSizes.get(entry.path)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function runGate(dir, gate) {
  if (!existsSync(join(dir, gate))) return { status: null, lines: [] };
  const r = spawnSync('node', [gate], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, lines: normalise(`${r.stdout ?? ''}\n${r.stderr ?? ''}`) };
}

function git(root, ...argv) {
  return spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8' });
}

function main() {
  const headDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  let baseDir = process.argv[2] ? resolve(process.argv[2]) : null;
  let temp = null;
  if (baseDir === null) {
    const mb = git(headDir, 'merge-base', 'origin/main', 'HEAD');
    if (mb.status !== 0) {
      console.error('ci-gates-vs-base: cannot find `git merge-base origin/main HEAD`; pass a base checkout directory.');
      return 2;
    }
    temp = mkdtempSync(join(tmpdir(), 'gates-base-'));
    baseDir = join(temp, 'base');
    const add = git(headDir, 'worktree', 'add', '--detach', baseDir, mb.stdout.trim());
    if (add.status !== 0) {
      console.error(`ci-gates-vs-base: git worktree add failed: ${add.stderr}`);
      return 2;
    }
  }
  try {
    // Some gates import `typescript` from the root node_modules. The base
    // checkout has none, and installing twice is slow, so it borrows the head's.
    // The gates only read through it.
    if (!existsSync(join(baseDir, 'node_modules')) && existsSync(join(headDir, 'node_modules'))) {
      symlinkSync(join(headDir, 'node_modules'), join(baseDir, 'node_modules'), 'dir');
    }
    let failed = 0;
    for (const gate of GATES) {
      const head = runGate(headDir, gate);
      const base = runGate(baseDir, gate);
      if (head.status === 0) {
        console.log(`ok    ${gate} (passes on the head)`);
        continue;
      }
      const added = newLines(head.lines, base.lines);
      if (head.lines.length === 0 || added.length > 0) {
        failed++;
        console.log(`FAIL  ${gate} (head exit ${head.status}, base exit ${base.status ?? 'absent'})`);
        if (head.lines.length === 0) console.log('      the gate failed and printed nothing');
        for (const line of added) console.log(`      + ${line}`);
      } else {
        console.log(`ok    ${gate} (fails on the base too, no new output lines on the head)`);
      }
    }
    return failed === 0 ? 0 : 1;
  } finally {
    if (temp !== null) {
      git(headDir, 'worktree', 'remove', '--force', baseDir);
      rmSync(temp, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
