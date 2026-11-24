/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What `pnpm build` does for @ifc-lite/wasm on a host without wasm-pack.
 * The same outcomes as the missing-wasm-pack branch of scripts/build-wasm.sh,
 * which still serves a direct `bash scripts/build-wasm.sh`; run-build-wasm.mjs
 * decides here so that such a host never has to start bash (#856).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** wasm-pack on PATH, or in ~/.cargo/bin where rustup's `cargo install` puts it. */
export function hasWasmPack() {
  const probe = spawnSync('wasm-pack', ['--version'], { stdio: 'ignore' });
  if (probe.status === 0) return true;
  const exe = process.platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack';
  return existsSync(join(homedir(), '.cargo', 'bin', exe));
}

/**
 * @param {{ runtimePresent: boolean, typesPresent: boolean }} disk
 * @returns {{ exitCode: number, message: string }}
 */
export function withoutWasmPack({ runtimePresent, typesPresent }) {
  if (runtimePresent) {
    return {
      exitCode: 0,
      message:
        'wasm-pack not found: using the engine runtime already in packages/wasm/pkg ' +
        '(from `pnpm build:wasm:fetch` or an earlier build). It is not rebuilt from rust/; ' +
        'to do that, install Rust + wasm-pack and run `pnpm build:wasm`.',
    };
  }
  if (typesPresent) {
    return {
      exitCode: 0,
      message:
        'wasm-pack not found and no engine runtime in packages/wasm/pkg. The committed types let ' +
        'type-checking work, but the app will not run or bundle: run `pnpm build:wasm:fetch` for a ' +
        'prebuilt runtime, or install Rust + wasm-pack and run `pnpm build:wasm`.',
    };
  }
  return {
    exitCode: 1,
    message:
      'wasm-pack not found, and packages/wasm/pkg has neither the engine runtime nor the committed ' +
      'ifc-lite.d.ts. Restore the types with `git checkout -- packages/wasm/pkg/ifc-lite.d.ts`, then run ' +
      '`pnpm build:wasm:fetch`, or install Rust + wasm-pack and run `pnpm build:wasm`.',
  };
}
