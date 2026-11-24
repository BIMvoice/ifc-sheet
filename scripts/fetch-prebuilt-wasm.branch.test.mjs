/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #856: a clone without Rust fetches the engine runtime from the
 * `prebuilt-wasm` branch, which CI builds from this repository's Rust. The real
 * script runs in a throwaway checkout carrying the REAL committed
 * packages/wasm/pkg/ifc-lite.d.ts. The branch is a directory published the way
 * .github/workflows/prebuilt-wasm.yml publishes it (its manifest written by
 * scripts/write-prebuilt-wasm-manifest.mjs) and served by a local HTTP server;
 * `npm` is a stub that records being called and fails. Nothing touches the
 * network.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serveDir } from './lib/static-dir-server.mjs';
import { compareWasmExports } from './lib/wasm-export-parity.mjs';
import { stubRuntimeFor } from './lib/wasm-runtime-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REAL_DTS = resolve(here, '../packages/wasm/pkg/ifc-lite.d.ts');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const WASM = Buffer.from('\0asm-PREBUILT-WASM');
const roots = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function tempDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  roots.push(d);
  return d;
}

/**
 * Publish a branch as the workflow does, then let `tamper` change it, and
 * serve it. `lacking` leaves exports out of the runtime.
 */
async function publishBranch({ lacking = [], tamper } = {}) {
  const branchDir = tempDir('prebuilt-branch-');
  writeFileSync(join(branchDir, 'ifc-lite.js'), stubRuntimeFor(REAL_DTS, lacking));
  writeFileSync(join(branchDir, 'ifc-lite_bg.wasm'), WASM);
  const w = spawnSync(process.execPath, [join(here, 'write-prebuilt-wasm-manifest.mjs'), branchDir, COMMIT, REAL_DTS], {
    encoding: 'utf8',
  });
  assert.equal(w.status, 0, w.stdout + w.stderr);
  if (tamper) tamper(branchDir);
  return { branchDir, ...(await serveDir(branchDir, 'prebuilt-wasm')) };
}

function makeCheckout({ installed = false } = {}) {
  const root = tempDir('fetch-wasm-branch-');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(here, 'fetch-prebuilt-wasm.mjs'), join(root, 'scripts/fetch-prebuilt-wasm.mjs'));
  cpSync(join(here, 'lib'), join(root, 'scripts/lib'), { recursive: true });
  mkdirSync(join(root, 'packages/wasm/pkg'), { recursive: true });
  writeFileSync(join(root, 'packages/wasm/package.json'), JSON.stringify({ name: '@ifc-lite/wasm', version: '10.3.0' }));
  cpSync(REAL_DTS, join(root, 'packages/wasm/pkg/ifc-lite.d.ts'));
  if (installed) {
    writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite.js'), 'INSTALLED-JS');
    writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite_bg.wasm'), 'INSTALLED-WASM');
  }
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'npm'),
    `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(join(root, 'npm-was-called'))}, '');
console.error('npm stub: no network in tests');
process.exit(1);
`,
  );
  chmodSync(join(bin, 'npm'), 0o755);
  return root;
}

/** Async on purpose: the stub server answers from this process's event loop. */
function run(root, url, args = []) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(root, 'scripts/fetch-prebuilt-wasm.mjs'), ...args], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, IFCSHEET_PREBUILT_WASM_URL: url },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
}

const pkg = (root, name) => join(root, 'packages/wasm/pkg', name);
const npmCalled = (root) => existsSync(join(root, 'npm-was-called'));

test('#856 a matching manifest installs a runtime that passes the parity check against the committed d.ts', async () => {
  const branch = await publishBranch();
  const root = makeCheckout();
  const r = await run(root, branch.url);
  await branch.close();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const name of ['ifc-lite.js', 'ifc-lite_bg.wasm']) {
    assert.deepEqual(readFileSync(pkg(root, name)), readFileSync(join(branch.branchDir, name)), name);
  }
  assert.deepEqual(compareWasmExports(readFileSync(REAL_DTS, 'utf8'), readFileSync(pkg(root, 'ifc-lite.js'), 'utf8')).missing, []);
  assert.deepEqual(readFileSync(pkg(root, 'ifc-lite.d.ts')), readFileSync(REAL_DTS));
  assert.match(r.stdout, /prebuilt-wasm branch \(built from main at 0123456789ab\)/);
  assert.equal(npmCalled(root), false);
});

test('#856 a file whose sha256 differs from the manifest installs nothing and names the cause and the fix', async () => {
  const branch = await publishBranch({
    tamper: (d) => writeFileSync(join(d, 'ifc-lite_bg.wasm'), '\0asm-SOMETHING-ELSE'),
  });
  const root = makeCheckout();
  const r = await run(root, branch.url);
  await branch.close();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ifc-lite_bg\.wasm has sha256 [0-9a-f]{64}, but the manifest says/);
  assert.match(r.stderr, /again in five minutes/);
  assert.match(r.stderr, /pnpm build:wasm`/);
  assert.equal(existsSync(pkg(root, 'ifc-lite_bg.wasm')), false);
  assert.equal(existsSync(pkg(root, 'ifc-lite.js')), false);
  assert.equal(npmCalled(root), false, 'a broken branch must not be papered over by the npm fallback');
});

test('#856 a prebuilt behind this checkout installs nothing and says a Rust change waits for main', async () => {
  const branch = await publishBranch({ lacking: ['segmentScanPoints'] });
  const root = makeCheckout();
  const r = await run(root, branch.url);
  await branch.close();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /IfcAPI\.segmentScanPoints/);
  assert.match(r.stderr, /branch that changes Rust/);
  assert.match(r.stderr, /"Prebuilt wasm" workflow/);
  assert.match(r.stderr, /pnpm build:wasm`/);
  assert.equal(existsSync(pkg(root, 'ifc-lite_bg.wasm')), false);
  assert.equal(npmCalled(root), false);
});

test('#856 a manifest that is not JSON fails without falling back to npm', async () => {
  const branch = await publishBranch({
    tamper: (d) => writeFileSync(join(d, 'manifest.json'), '<html>rate limited</html>'),
  });
  const root = makeCheckout();
  const r = await run(root, branch.url);
  await branch.close();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /manifest\.json is not a usable manifest/);
  assert.equal(npmCalled(root), false);
});

test('#856 an unreachable branch falls back to npm, and when that fails too both causes are named', async () => {
  // A port that was free a moment ago: connection refused.
  const branch = await serveDir(tempDir('no-branch-'), 'prebuilt-wasm');
  await branch.close();
  const root = makeCheckout();
  const r = await run(root, branch.url);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(npmCalled(root), true);
  assert.match(r.stderr, /prebuilt-wasm branch could not be reached/);
  assert.match(r.stderr, /ECONNREFUSED/);
  assert.match(r.stderr, /npm pack @ifc-lite\/wasm@10\.3\.0` failed/);
  assert.match(r.stderr, /pnpm build:wasm`/);
  assert.equal(existsSync(pkg(root, 'ifc-lite_bg.wasm')), false);
});

test('#856 a branch that does not exist yet (404) counts as unreachable and tries npm', async () => {
  const branch = await serveDir(tempDir('no-branch-'), 'prebuilt-wasm');
  const root = makeCheckout();
  const r = await run(root, branch.url);
  await branch.close();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /manifest\.json answered HTTP 404/);
  assert.equal(npmCalled(root), true);
});

test('#856 --force with a bad prebuilt keeps the installed runtime', async () => {
  const branch = await publishBranch({
    tamper: (d) => writeFileSync(join(d, 'ifc-lite.js'), 'export {};\n// changed after the manifest\n'),
  });
  const root = makeCheckout({ installed: true });
  const r = await run(root, branch.url, ['--force']);
  await branch.close();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(readFileSync(pkg(root, 'ifc-lite.js'), 'utf8'), 'INSTALLED-JS');
  assert.equal(readFileSync(pkg(root, 'ifc-lite_bg.wasm'), 'utf8'), 'INSTALLED-WASM');
});
