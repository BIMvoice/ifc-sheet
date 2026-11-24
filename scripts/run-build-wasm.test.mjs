/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #856: on a host without wasm-pack, `pnpm build` runs this launcher for
 * @ifc-lite/wasm. It must not need bash there (on Windows without Git Bash,
 * `bash` is the WSL launcher and fails). The launcher runs in a throwaway
 * checkout that has NO scripts/build-wasm.sh, with PATH and HOME pointing at
 * empty directories: if it started bash, the run would fail.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const roots = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function checkout({ runtime, types }) {
  const root = mkdtempSync(join(tmpdir(), 'run-build-wasm-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  cpSync(join(here, 'run-build-wasm.mjs'), join(root, 'scripts/run-build-wasm.mjs'));
  cpSync(join(here, 'lib/wasm-build-without-rust.mjs'), join(root, 'scripts/lib/wasm-build-without-rust.mjs'));
  mkdirSync(join(root, 'packages/wasm/pkg'), { recursive: true });
  if (runtime) {
    writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite_bg.wasm'), 'WASM');
    writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite.js'), 'JS');
  }
  if (types) writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite.d.ts'), 'export {};\n');
  mkdirSync(join(root, 'empty-bin'));
  mkdirSync(join(root, 'empty-home'));
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [join(root, 'scripts/run-build-wasm.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: join(root, 'empty-bin'), HOME: join(root, 'empty-home'), USERPROFILE: join(root, 'empty-home') },
  });
}

test('#856 without wasm-pack, a fetched runtime on disk lets the build go on without starting bash', () => {
  const r = run(checkout({ runtime: true, types: true }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /using the engine runtime already in packages\/wasm\/pkg/);
});

test('#856 without wasm-pack and without a runtime, the committed types still let the build go on, with a warning', () => {
  const r = run(checkout({ runtime: false, types: true }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pnpm build:wasm:fetch/);
});

test('#856 without wasm-pack, runtime or types, the build stops and names the fix', () => {
  const r = run(checkout({ runtime: false, types: false }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /git checkout -- packages\/wasm\/pkg\/ifc-lite\.d\.ts/);
});
