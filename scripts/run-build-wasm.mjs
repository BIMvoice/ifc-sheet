/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Cross-platform launcher for scripts/build-wasm.sh.
 *
 * On Windows, `bash` often resolves to WSL (which may be uninstalled).
 * This script prefers Git Bash when available.
 *
 * Without wasm-pack the shell script builds nothing: it only decides whether
 * the runtime or the types already on disk let the build go on. That decision
 * is made here instead, so a host without Rust never needs bash at all: on
 * Windows without Git Bash at its default path, `bash` is the WSL launcher, and
 * with no Linux installed it fails `pnpm build` even after
 * `pnpm build:wasm:fetch` put a runtime in place (#856).
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasWasmPack, withoutWasmPack } from './lib/wasm-build-without-rust.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const script = resolve(rootDir, 'scripts/build-wasm.sh');

if (!hasWasmPack()) {
  const outcome = withoutWasmPack({
    runtimePresent: existsSync(resolve(rootDir, 'packages/wasm/pkg/ifc-lite_bg.wasm')),
    typesPresent: existsSync(resolve(rootDir, 'packages/wasm/pkg/ifc-lite.d.ts')),
  });
  (outcome.exitCode === 0 ? console.log : console.error)(outcome.message);
  process.exit(outcome.exitCode);
}

function findBash() {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.BASH_PATH,
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'bash';
}

const bash = findBash();
const result = spawnSync(bash, [script], {
  cwd: rootDir,
  env: { ...process.env },
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`Could not run ${bash} for scripts/build-wasm.sh: ${result.error.message}`);
  if (process.platform === 'win32') {
    console.error('Install Git for Windows, or set BASH_PATH to its bash.exe.');
  }
}
process.exit(result.status ?? 1);
