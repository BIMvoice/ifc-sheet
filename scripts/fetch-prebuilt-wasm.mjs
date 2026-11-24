/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Install a prebuilt engine runtime (ifc-lite.js + ifc-lite_bg.wasm) when
 * Rust/wasm-pack is unavailable, e.g. on Windows without WSL (#856).
 *
 * Usage: node scripts/fetch-prebuilt-wasm.mjs [--force]
 *
 * Sources, in order:
 *   1. The `prebuilt-wasm` branch of this repository, which
 *      .github/workflows/prebuilt-wasm.yml rebuilds from main's Rust. Every
 *      file is checked against the branch's manifest.json (sha256).
 *   2. Only if that branch cannot be reached at all: the published
 *      @ifc-lite/wasm on npm. That is ifc-lite's build and is usually behind
 *      this repository's Rust.
 * `IFCSHEET_PREBUILT_WASM_URL` replaces the branch URL (tests, forks).
 *
 * Whatever the source, the runtime is checked against the COMMITTED
 * ifc-lite.d.ts before it is installed, and an installed runtime is checked
 * the same way. `--force` re-fetches even if a runtime is installed; the
 * existing runtime is replaced only if the fetched one passes the check.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tarballNameFromPackOutput } from './lib/npm-pack-output.mjs';
import { DEFAULT_PREBUILT_BASE_URL, RUNTIME_FILES, downloadPrebuilt, sha256 } from './lib/prebuilt-wasm.mjs';
import { compareWasmExports } from './lib/wasm-export-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const wasmPkgJson = JSON.parse(readFileSync(join(rootDir, 'packages/wasm/package.json'), 'utf8'));
const tarball = `@ifc-lite/wasm@${wasmPkgJson.version}`;

const wasmOut = join(rootDir, 'packages/wasm/pkg');
const wasmFile = join(wasmOut, 'ifc-lite_bg.wasm');

const force = process.argv.includes('--force');
const committedDts = join(wasmOut, 'ifc-lite.d.ts');
const BUILD_FROM_SOURCE =
  'build from source instead: install Rust nightly + wasm-pack (the pinned toolchain is in ' +
  '.github/actions/setup-wasm-build; on Windows use rustup, or WSL) and run `pnpm build:wasm`, then `pnpm build`.';

// Without the committed .d.ts there is nothing to check the runtime against, and
// the build then fails two steps later with TS7016 or a bundler error (#856).
if (!existsSync(committedDts)) {
  console.error(
    `\n${committedDts} is missing, so the runtime cannot be checked against this checkout.\n` +
      `It is committed to the repository: restore it with \`git checkout -- packages/wasm/pkg/ifc-lite.d.ts\`, ` +
      `or build everything from source with a Rust toolchain (pnpm build:wasm).`,
  );
  process.exit(1);
}

if (existsSync(wasmFile) && !force) {
  console.log(`Prebuilt WASM already present at ${wasmFile}`);
  // An installed runtime may have been fetched before this check existed, or
  // by an older checkout, or built before the Rust sources moved on. Check it
  // like a fresh fetch, but never delete it: its origin is unknown and it may
  // be a source build.
  const installedJs = join(wasmOut, 'ifc-lite.js');
  if (!existsSync(installedJs)) {
    console.error(
      `\n${wasmFile} is present but ${installedJs} is missing, so the runtime is incomplete.\n` +
        `Rebuild from source (pnpm build:wasm) or re-fetch with: node scripts/fetch-prebuilt-wasm.mjs --force`,
    );
    process.exit(1);
  }
  const parity = parityAgainstCommittedDts(readFileSync(installedJs, 'utf8'));
  if (parity.missing.length > 0) {
    console.error(
      `\nThe installed WASM runtime in ${wasmOut} is behind this checkout (${checkoutCommit()}).\n` +
        listMissing(parity.missing) +
        `\n\nThe installed runtime was left untouched. Either build from source with a Rust toolchain ` +
        `(pnpm build:wasm), or re-fetch with: node scripts/fetch-prebuilt-wasm.mjs --force ` +
        `(replaces the installed runtime only if the fetched one passes this check).`,
    );
    process.exit(1);
  }
  warnExtra(parity.extra);
  process.exit(0);
}

const baseUrl = (process.env.IFCSHEET_PREBUILT_WASM_URL || DEFAULT_PREBUILT_BASE_URL).replace(/\/+$/, '');
console.log(`Fetching the prebuilt engine runtime from ${baseUrl} …`);
const prebuilt = await downloadPrebuilt(baseUrl);

if (prebuilt.ok) {
  installFromBranch(prebuilt);
} else if (!prebuilt.unreachable) {
  console.error(
    `\nThe prebuilt runtime on ${baseUrl} cannot be used: ${prebuilt.reason}.\n\nNothing was installed. ` +
      (prebuilt.hashMismatch
        ? 'The branch may have been rebuilt while you downloaded (raw.githubusercontent.com caches files ' +
          'for a few minutes, so the manifest and a file can briefly come from different builds): run ' +
          '`pnpm build:wasm:fetch` again in five minutes. If it keeps failing, '
        : 'Report it to the maintainers, or ') +
      BUILD_FROM_SOURCE,
  );
  process.exit(1);
} else {
  console.warn(
    `The prebuilt-wasm branch could not be reached: ${prebuilt.reason}.\n` +
      `Falling back to the published ${tarball} on npm. That is ifc-lite's build and is usually ` +
      `behind this repository's Rust, so the check below may refuse it.`,
  );
  installFromNpm(prebuilt.reason);
}

function installFromBranch({ manifest, files }) {
  const source = `the prebuilt-wasm branch (built from main at ${manifest.commit.slice(0, 12)})`;
  const parity = parityAgainstCommittedDts(files.get('ifc-lite.js').toString('utf8'));
  if (parity.missing.length > 0) {
    console.error(
      `\nThe runtime on ${source} does not match this checkout (${checkoutCommit()}).\n` +
        listMissing(parity.missing) +
        `\n\nNothing was installed. The prebuilt is rebuilt from main after every merge that changes Rust, so ` +
        `this happens when this checkout's Rust is not main's: a branch that changes Rust (its prebuilt ` +
        `exists only after it merges), main in the minutes before the "Prebuilt wasm" workflow finishes, ` +
        `or a checkout older than a change that removed an export (update it from main). ` +
        `Run \`pnpm build:wasm:fetch\` again once the prebuilt has caught up, or ${BUILD_FROM_SOURCE}`,
    );
    process.exit(1);
  }
  mkdirSync(wasmOut, { recursive: true });
  for (const name of RUNTIME_FILES) writeFileSync(join(wasmOut, name), files.get(name));
  warnExtra(parity.extra);
  if (manifest.dtsSha256 && manifest.dtsSha256 !== sha256(readFileSync(committedDts))) {
    console.warn(
      `Note: ${source} was built from an ifc-lite.d.ts that differs from this checkout's; ` +
        `every export this checkout declares is present.`,
    );
  }
  console.log(`Installed the runtime from ${source} to ${wasmOut}`);
}

function installFromNpm(branchReason) {
  const EXTRACT_DIR_NAME = '.wasm-fetch-tmp';
  const extractDir = join(rootDir, EXTRACT_DIR_NAME);
  let tgzName;
  try {
    tgzName = tarballNameFromPackOutput(execSync(`npm pack ${tarball} --json`, { cwd: rootDir, encoding: 'utf8' }));
  } catch (err) {
    console.error(
      `\nNo prebuilt runtime could be fetched.\n  - prebuilt-wasm branch: ${branchReason}\n` +
        `  - npm: \`npm pack ${tarball}\` failed (${err.message})\n\n` +
        `Check the network connection and run \`pnpm build:wasm:fetch\` again, or ${BUILD_FROM_SOURCE}`,
    );
    process.exit(1);
  }
  const cleanup = () => {
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(join(rootDir, tgzName), { force: true });
  };
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  // Relative paths, not absolute ones. GNU tar — what Git for Windows ships and
  // what is first on PATH there — reads a leading `C:` as a REMOTE HOST and
  // fails with "Cannot connect to C: resolve failed" before it opens anything.
  // `--force-local` would fix that for GNU tar and break Windows' own bsdtar,
  // which does not know the flag; running from `rootDir` with relative paths
  // works for both and needs no branch on which tar is installed.
  execSync(`tar -xzf ${JSON.stringify(tgzName)} -C ${JSON.stringify(EXTRACT_DIR_NAME)}`, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  const pkgDir = join(extractDir, 'package/pkg');

  // Install only the runtime. `pkg/ifc-lite.d.ts` is COMMITTED and tracks this
  // checkout's Rust crate; the published copy describes the last publish, so
  // overwriting it dirties the tree and breaks the typecheck of anything built
  // against newer bindings. The published .d.ts is used for nothing here.
  //
  // A symbol the committed .d.ts declares and the fetched .js lacks
  // type-checks, then fails in a bundler far from here, so name it BEFORE
  // installing anything: a stale bundle is never left behind for the
  // "already present" early exit to accept, and under --force the previously
  // installed runtime survives a failed fetch.
  const parity = parityAgainstCommittedDts(readFileSync(join(pkgDir, 'ifc-lite.js'), 'utf8'));
  if (parity.missing.length > 0) {
    cleanup();
    console.error(
      `\nThe published ${tarball} is behind this checkout (${checkoutCommit()}).\n` +
        listMissing(parity.missing) +
        `\n\nNothing was installed. npm was tried only because the prebuilt-wasm branch could not be ` +
        `reached (${branchReason}); it carries a runtime built from this repository's Rust. Check the ` +
        `network connection and run \`pnpm build:wasm:fetch\` again, or ${BUILD_FROM_SOURCE}`,
    );
    process.exit(1);
  }
  mkdirSync(wasmOut, { recursive: true });
  for (const name of RUNTIME_FILES) writeFileSync(join(wasmOut, name), readFileSync(join(pkgDir, name)));
  cleanup();
  warnExtra(parity.extra);
  console.log(`Installed the runtime from npm (${tarball}) to ${wasmOut}`);
}

function checkoutCommit() {
  try {
    return `commit ${execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()}`;
  } catch (err) {
    return `this checkout, commit unknown: ${err.message.split('\n')[0]}`;
  }
}

/** Exports the committed .d.ts declares vs those `js` provides. */
function parityAgainstCommittedDts(js) {
  return compareWasmExports(readFileSync(committedDts, 'utf8'), js);
}

function listMissing(missing) {
  return (
    `packages/wasm/pkg/ifc-lite.d.ts declares ${missing.length} export(s) the runtime does not provide:\n` +
    missing.map((n) => `  - ${n}`).join('\n')
  );
}

function warnExtra(extra) {
  if (extra.length === 0) return;
  console.warn(
    `Warning: the runtime provides ${extra.length} export(s) this checkout's ` +
      `ifc-lite.d.ts does not declare (${extra.join(', ')}). The runtime is ahead of ` +
      `${checkoutCommit()}; harmless unless this checkout is stale.`,
  );
}
