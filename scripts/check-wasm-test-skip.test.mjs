#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Black-box harness for scripts/check-wasm-test-skip.mjs: each case builds a
 * git tree in a temp dir, runs the unmodified checker on it with `--root`, and
 * asserts the exit code and the message. The detection helpers are also
 * exercised directly on the shapes found in this repository.
 *
 * Run: node --test scripts/check-wasm-test-skip.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingGuard, readsWasmBuild, stripComments } from './check-wasm-test-skip.mjs';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-wasm-test-skip.mjs');

function tree(files, { allowlist } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-test-skip-'));
  const all = { 'packages/a/src/plain.test.ts': "import { test } from 'node:test';\n", ...files };
  for (const [rel, body] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  if (allowlist !== undefined) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'wasm-test-skip-allowlist.txt'), allowlist);
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

const GUARDED = `import { existsSync } from 'node:fs';
const WASM = new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
test('x', { skip: !existsSync(WASM) && 'Run pnpm build:wasm' }, async () => { await readFile(WASM); });
`;
const UNGUARDED = `const WASM = new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
test('x', async () => { await init({ module_or_path: await readFile(WASM) }); });
`;

test('passes a test guarded the house way', () => {
  const r = run(tree({ 'apps/viewer/src/a.test.ts': GUARDED }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 read the wasm build/);
});

test('fails an unguarded read, naming the file, the path and the fix', () => {
  const r = run(tree({ 'apps/viewer/src/a.test.ts': UNGUARDED }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /apps\/viewer\/src\/a\.test\.ts: reads the wasm build \(path \.\.\/\.\.\/\.\.\/wasm\/pkg\/ifc-lite_bg\.wasm\); no existence check and no skip/);
  assert.match(r.out, /skip: !existsSync\(WASM\)/);
});

test('a check that throws instead of skipping fails', () => {
  const src = `const WASM = join(root, 'packages', 'wasm', 'pkg', 'ifc-lite_bg.wasm');
beforeAll(() => { if (!existsSync(WASM)) throw new Error('build it'); });
`;
  const r = run(tree({ 'packages/cli/src/b.test.ts': src }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /checks the build exists but never skips/);
});

test('accepts the other guards in use: access + t.skip, try/ENOENT + t.skip, vitest skipIf and runIf', () => {
  const access = `const W = new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
test('x', async (t) => { try { await access(W); } catch { t.skip('Build WASM'); return; } });
`;
  const enoent = `test('x', async (t) => { try { b = await readFile(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url)); }
  catch (e) { if (e.code !== 'ENOENT') throw e; t.skip('Build WASM'); return; } });
`;
  const skipIf = "const W = join(dir, 'pkg', 'ifc-lite_bg.wasm');\ndescribe.skipIf(!existsSync(W))('x', () => {});\n";
  const runIf = "const W = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));\ndescribe.runIf(existsSync(W))('x', () => {});\n";
  const r = run(tree({ 'a/1.test.ts': access, 'a/2.test.ts': enoent, 'a/3.test.ts': skipIf, 'a/4.test.mjs': runIf }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /4 read the wasm build/);
});

test('initSync on the real @ifc-lite/wasm needs the guard; a vi.mocked one does not', () => {
  const real = "import { initSync } from '@ifc-lite/wasm';\ninitSync({ module: bytes });\n";
  const mocked = "vi.mock('@ifc-lite/wasm', () => ({ initSync: vi.fn() }));\nimport { initSync } from '@ifc-lite/wasm';\ninitSync({});\n";
  assert.equal(run(tree({ 'a/real.test.ts': real })).status, 1);
  assert.equal(run(tree({ 'a/mocked.test.ts': mocked })).status, 0);
});

test('does not count paths in comments, URLs built on another base, or data strings', () => {
  const src = `// reads ../../wasm/pkg/ifc-lite_bg.wasm when built
/* new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url) */
const raw = new URL('../../wasm/pkg/ifc-lite_bg.wasm', moduleUrl);
const msg = 'Failed to fetch ifc-lite_bg.wasm';
const node = 'file:///Users/test/node_modules/@ifc-lite/wasm/pkg/ifc-lite.js';
`;
  const r = run(tree({ 'packages/geometry/src/c.test.ts': src }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /0 read the wasm build/);
});

test('a listed file passes; a row without a reason fails', () => {
  const files = { 'packages/viewer/test/server.test.ts': UNGUARDED };
  assert.equal(run(tree(files, { allowlist: 'packages/viewer/test/server.test.ts  # must be red when CI did not build the wasm\n' })).status, 0);
  const r = run(tree(files, { allowlist: 'packages/viewer/test/server.test.ts\n' }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /has no reason/);
});

test('refuses a tree with no test files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-test-skip-empty-'));
  writeFileSync(join(dir, 'a.ts'), 'x');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  const r = run(dir);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /cannot be trusted/);
});

test('helpers: stripComments keeps strings, blanks comments, keeps line count', () => {
  const src = "const u = 'http://x'; // gone\n/* a\nb */ x";
  const out = stripComments(src);
  assert.match(out, /'http:\/\/x'/);
  assert.doesNotMatch(out, /gone/);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.equal(readsWasmBuild("import x from '@ifc-lite/wasm/pkg/ifc-lite.js';"), 'a @ifc-lite/wasm/pkg/ specifier');
  assert.equal(missingGuard("existsSync(W); it.skipIf(x)"), null);
  assert.equal(missingGuard("t.skip('x')"), 'skips, but never checks the build exists');
});
