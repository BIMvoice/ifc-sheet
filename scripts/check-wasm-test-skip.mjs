#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A test that needs the built wasm engine skips when it is not built.
 *
 * WHY: `packages/wasm/pkg/` is not committed. It exists after
 * `pnpm build:wasm` (Rust nightly and wasm-pack) and in CI, where the Build
 * wasm job hands it to the test jobs. A test that reads it unguarded passes in
 * CI and fails with a bare ENOENT for anyone who runs the suite without Rust,
 * which review kept catching by hand. The house pattern
 * (`captured-command.test.ts`) is:
 *
 *   const WASM = new URL('…/packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
 *   test('…', { skip: !existsSync(WASM) && 'Run pnpm build:wasm' }, …);
 *
 * THE RULE, over tracked `*.test.*` files. A file READS THE WASM BUILD when,
 * outside comments, it has
 *  - a relative path literal into `wasm/pkg/` (`'../../wasm/pkg/ifc-lite_bg.wasm'`),
 *    unless it is resolved against something other than `import.meta.url`
 *    (`new URL('../wasm/pkg/x', someCdnUrl)` builds a URL, it reads nothing);
 *  - path segments `'pkg', 'ifc-lite_bg.wasm'` (or `'ifc-lite.js'`) passed to `join`/`resolve`;
 *  - a `@ifc-lite/wasm/pkg/…` specifier; or
 *  - a call to `initSync(` with the real `@ifc-lite/wasm` imported (not `vi.mock`ed).
 * Such a file must also, outside comments, CHECK the build is there
 * (`existsSync(`, `access(`, `accessSync(` or `ENOENT`) and SKIP when it is
 * not (`skip`, `skipIf`, vitest's `runIf`). Either half alone fails: a check
 * that throws is the ENOENT again in a longer message.
 *
 * The check is lexical and per file: a guard in a shared helper the test
 * imports does not count, so put the existence check in the test, or list the
 * file. Files that fail on purpose (a lane where a missing build must be red)
 * are listed in `scripts/wasm-test-skip-allowlist.txt`, `path  # reason`.
 *
 * Usage: node scripts/check-wasm-test-skip.mjs [--root <dir>] [--allowlist <file>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainEntry } from './lib/is-main-entry.mjs';
import { parseAllowlist } from './check-public-fixtures.mjs';

const TEST_RE = /\.test\.(ts|tsx|mts|js|mjs|cjs)$/;

/** The source with comments blanked (newlines kept), strings and templates left alone. */
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const REL_PKG = /(['"`])(\.{1,2}\/[^'"`\n]*wasm\/pkg\/[^'"`\n]*)\1/g;
const SEGMENTS = /['"`]pkg['"`]\s*,\s*['"`]ifc-lite(?:_bg\.wasm|\.js)['"`]/;
const SPECIFIER = /['"`]@ifc-lite\/wasm\/pkg\//;
const REAL_IMPORT = /from\s+['"]@ifc-lite\/wasm['"]|import\(\s*['"]@ifc-lite\/wasm['"]\s*\)/;
const MOCKED = /\b(?:vi|jest)\.mock\(\s*['"]@ifc-lite\/wasm['"]|mock\.module\(\s*['"]@ifc-lite\/wasm['"]/;
const PRESENCE = /\b(?:existsSync|accessSync|access)\(|ENOENT/;
const SKIP = /\b(?:skip(?:If)?|runIf)\b/;

/** What in `code` (comments stripped) reads the wasm build, or null. */
export function readsWasmBuild(code) {
  for (const m of code.matchAll(REL_PKG)) {
    const before = code.slice(Math.max(0, m.index - 40), m.index);
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const urlWithOtherBase = /new\s+URL\(\s*$/.test(before) && /^\s*,/.test(after) && !/^\s*,\s*import\.meta\.url/.test(after);
    if (!urlWithOtherBase) return `path ${m[2]}`;
  }
  if (SEGMENTS.test(code)) return "path segments 'pkg', 'ifc-lite…'";
  if (SPECIFIER.test(code)) return 'a @ifc-lite/wasm/pkg/ specifier';
  if (/\binitSync\(/.test(code) && REAL_IMPORT.test(code) && !MOCKED.test(code)) return 'initSync on the real @ifc-lite/wasm';
  return null;
}

/** What the guard is missing in `code`, or null when it checks and skips. */
export function missingGuard(code) {
  const presence = PRESENCE.test(code);
  const skip = SKIP.test(code);
  if (presence && skip) return null;
  if (!presence && !skip) return 'no existence check and no skip';
  return presence ? 'checks the build exists but never skips' : 'skips, but never checks the build exists';
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const root = resolve(arg('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const allowlistPath = resolve(arg('--allowlist') ?? join(root, 'scripts', 'wasm-test-skip-allowlist.txt'));
  const { entries, errors } = existsSync(allowlistPath)
    ? parseAllowlist(readFileSync(allowlistPath, 'utf8'))
    : { entries: new Map(), errors: [] };

  const r = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`check-wasm-test-skip: git ls-files failed in ${root}: ${r.stderr.trim()}`);
    return 2;
  }
  const tests = r.stdout.split('\0').filter((p) => TEST_RE.test(p) && !p.includes('node_modules/'));
  if (tests.length === 0) {
    console.error(`check-wasm-test-skip: git tracks no test file in ${root}; the scan cannot be trusted.`);
    return 2;
  }

  const bad = [];
  let reading = 0;
  for (const path of tests) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const code = stripComments(readFileSync(full, 'utf8'));
    const reads = readsWasmBuild(code);
    if (!reads) continue;
    reading++;
    const missing = missingGuard(code);
    if (missing && !entries.has(path)) bad.push(`${path}: reads the wasm build (${reads}); ${missing}`);
  }
  const tracked = new Set(tests);
  for (const path of entries.keys()) if (!tracked.has(path)) console.log(`note: ${path} is in the allowlist but not tracked; delete its row.`);

  if (errors.length > 0) {
    console.error(`❌ ${allowlistPath}:`);
    for (const e of errors) console.error(`   ${e}`);
  }
  if (bad.length > 0) {
    console.error('❌ Tests that fail with ENOENT when packages/wasm/pkg/ is not built:\n');
    for (const line of bad) console.error(`   ${line}`);
    console.error('\nGuard the test and skip it without the build, as captured-command.test.ts does:');
    console.error("  { skip: !existsSync(WASM) && 'Run pnpm build:wasm' }   (vitest: it.skipIf(!existsSync(WASM)))");
    console.error('A test that must fail without the build goes in scripts/wasm-test-skip-allowlist.txt with the reason.');
  }
  if (errors.length > 0 || bad.length > 0) return 1;
  console.log(`wasm test skip: ${tests.length} test files, ${reading} read the wasm build, all guarded or listed (${entries.size}).`);
  return 0;
}

if (isMainEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
