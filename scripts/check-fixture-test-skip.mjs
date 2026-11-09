#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A test that reads a fixture under `tests/models` skips when it is absent,
 * and the skip message says `pnpm fixtures`.
 *
 * WHY: `tests/models/` is not committed (AGENTS.md "Test fixtures"); `pnpm
 * fixtures` downloads it. A test that reads it unguarded fails with a bare
 * ENOENT for anyone who has not run that, and a skip that does not say how to
 * get the file leaves them guessing. Sibling of check-wasm-test-skip.mjs, which
 * does the same for the wasm bundle.
 *
 * THE RULE, over tracked `*.test.*` files. A file READS A FIXTURE when,
 * outside comments, it has a string with `tests/models/<something>` (or the
 * segments `'tests', 'models', …`; `manifest.json` is committed and does not
 * count) AND calls a reader (`readFile`, `readFileSync`, `readdirSync`,
 * `openSync`, `createReadStream`, `statSync`, `loadFile`, `new File`). A path
 * that only appears in a fake tree a script test builds does not read it.
 * Such a file passes when, outside comments, it either
 *  - calls `planModelMissing(` (apps/viewer/src/test/discipline-plan-fixture.ts:
 *    it checks the file exists and answers "... run `pnpm fixtures`"), or
 *  - checks existence (`existsSync(`, `access(`, `accessSync(`, `ENOENT`),
 *    skips (`skip`, `skipIf`, `runIf`) AND has the text `pnpm fixtures` in a
 *    string. A mention in a comment does not reach the person who sees the skip.
 * Tests under `scripts/` are out of scope: they build throwaway trees with a
 * `tests/models` folder in them and read no real fixture.
 * The check is lexical and per file, like the wasm one.
 *
 * RATCHET: files that fail today are listed, one path per line, in
 * scripts/fixture-test-skip-baseline.txt. The list may only shrink: a listed
 * file that now passes, or is gone, fails the check until its row is deleted.
 *
 * Usage: node scripts/check-fixture-test-skip.mjs [--root <dir>] [--baseline <file>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainEntry } from './lib/is-main-entry.mjs';
import { stripComments } from './check-wasm-test-skip.mjs';

const TEST_RE = /\.test\.(ts|tsx|mts|js|mjs|cjs)$/;
/** Tests of scripts build throwaway trees with a `tests/models` folder in them; they read no real fixture. */
const SCRIPT_TESTS = /^scripts\//;
const PATH_LITERAL = /['"`][^'"`\n]*tests\/models\/(?!manifest\.json)[^'"`\n]*['"`]/;
const SEGMENTS = /['"`]tests['"`]\s*,\s*['"`]models['"`]\s*,(?!\s*['"`]manifest\.json)/;
const READER = /\b(?:readFile|readFileSync|readdirSync|openSync|createReadStream|statSync|loadFile)\b|new\s+File\(/;
const HELPER = /\bplanModelMissing\(/;
const PRESENCE = /\b(?:existsSync|accessSync)\b|\baccess\(|ENOENT/;
const SKIP = /\b(?:skip(?:If)?|runIf)\b/;
const MESSAGE = /(['"`])[^'"`\n]*pnpm fixtures[^'"`\n]*\1/;

/** What in `code` (comments stripped) reads a tests/models fixture, or null. */
export function readsFixture(code) {
  if (!PATH_LITERAL.test(code) && !SEGMENTS.test(code)) return null;
  return READER.test(code) ? 'a file under tests/models' : null;
}

/** What the guard is missing in `code`, or null when it skips with a pointer to `pnpm fixtures`. */
export function missingGuard(code) {
  if (HELPER.test(code)) return null;
  if (!PRESENCE.test(code)) return 'no existence check';
  if (!SKIP.test(code)) return 'checks the file exists but never skips';
  if (!MESSAGE.test(code)) return 'skips, but its message does not say `pnpm fixtures`';
  return null;
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const root = resolve(arg('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const baselinePath = resolve(arg('--baseline') ?? join(root, 'scripts', 'fixture-test-skip-baseline.txt'));
  const baseline = new Set(existsSync(baselinePath)
    ? readFileSync(baselinePath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : []);

  const r = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`check-fixture-test-skip: git ls-files failed in ${root}: ${r.stderr.trim()}`);
    return 2;
  }
  const tests = r.stdout.split('\0').filter((p) => TEST_RE.test(p) && !p.includes('node_modules/') && !SCRIPT_TESTS.test(p));
  if (tests.length === 0) {
    console.error(`check-fixture-test-skip: git tracks no test file in ${root}; the scan cannot be trusted.`);
    return 2;
  }

  const bad = [];
  const stale = [];
  let reading = 0;
  const seen = new Set();
  for (const path of tests) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const code = stripComments(readFileSync(full, 'utf8'));
    const reads = readsFixture(code);
    const missing = reads ? missingGuard(code) : null;
    if (reads) reading++;
    if (missing && !baseline.has(path)) bad.push(`${path}: reads ${reads}; ${missing}`);
    if (!missing && baseline.has(path)) stale.push(path);
    seen.add(path);
  }
  for (const path of baseline) if (!seen.has(path)) stale.push(path);

  if (bad.length > 0) {
    console.error('❌ Tests that fail with ENOENT, or skip without a hint, when tests/models is not fetched:\n');
    for (const line of bad) console.error(`   ${line}`);
    console.error('\nGuard the test and skip it without the file, saying how to get it:');
    console.error("  { skip: !existsSync(FIXTURE) && 'tests/models fixtures missing, run `pnpm fixtures`' }");
    console.error('(or `skip: planModelMissing(path)` from @/test/discipline-plan-fixture in the viewer).');
    console.error('Do not add to scripts/fixture-test-skip-baseline.txt: it only shrinks.');
  }
  if (stale.length > 0) {
    console.error('❌ Rows in scripts/fixture-test-skip-baseline.txt that no longer apply (the file is guarded or gone); delete them:\n');
    for (const p of stale) console.error(`   ${p}`);
  }
  if (bad.length > 0 || stale.length > 0) return 1;
  console.log(`fixture test skip: ${tests.length} test files, ${reading} read tests/models, all guarded or baselined (${baseline.size}).`);
  return 0;
}

if (isMainEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
