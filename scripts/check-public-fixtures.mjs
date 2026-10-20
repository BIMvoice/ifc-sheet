#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Test fixtures do not go under `apps/<app>/public/`.
 *
 * WHY: everything under an app's `public/` is copied into every deploy and
 * served to every user. Review kept finding IFC test models committed there
 * (`apps/viewer/public/_fixtures/`), which a test reads from disk and no user
 * ever asks for. A fixture belongs next to its test (a `__fixtures__/` folder
 * under `apps/viewer/src/`, as recent pull requests do) or in the downloaded fixture set
 * (`tests/models/manifest.json` and `pnpm fixtures`).
 *
 * THE RULE, over files git tracks under `apps/<app>/public/`:
 *  1. An IFC model (`.ifc`, `.ifczip`, `.ifcxml`, `.ifcx`) fails.
 *  2. Any other file over 1 MiB fails: the app's own assets (icons, fonts,
 *     logos, OAuth callback pages) are all well under that, so a file this
 *     big is either a fixture or an asset someone should decide on.
 *
 * A file the app really loads at runtime (the demo model, the sample models
 * the tours and the MCP playground open) is listed in
 * `scripts/public-assets-allowlist.txt`, one `path  # reason` per line. The
 * reason is required: a row without one fails, so the exception stays
 * readable. A row whose file no longer exists prints a `note:` and does not
 * fail; delete the row.
 *
 * Only tracked files count (`git ls-files`): the wasm runtime the build copies
 * into `apps/viewer/public/` is gitignored and is not a fixture.
 *
 * Usage: node scripts/check-public-fixtures.mjs [--root <dir>] [--allowlist <file>]
 * `--root` points every read at another git tree; the tests use it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainEntry } from './lib/is-main-entry.mjs';

export const MAX_BYTES = 1024 * 1024;
const IFC_RE = /\.(ifc|ifczip|ifcxml|ifcx)$/i;
const PUBLIC_RE = /^apps\/[^/]+\/public\//;
const MIN_REASON = 10;

/** `{ entries: Map<path, reason>, errors: string[] }` from the allowlist text. */
export function parseAllowlist(text) {
  const entries = new Map();
  const errors = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const hash = line.indexOf('#');
    const path = (hash === -1 ? line : line.slice(0, hash)).trim();
    const reason = hash === -1 ? '' : line.slice(hash + 1).trim();
    if (reason.length < MIN_REASON) errors.push(`line ${i + 1}: "${path}" has no reason (write \`${path}  # why the app ships it\`)`);
    else entries.set(path, reason);
  });
  return { entries, errors };
}

/** Why a tracked public file is not allowed, or null. */
export function violation(path, bytes) {
  if (IFC_RE.test(path)) return 'an IFC model';
  if (bytes > MAX_BYTES) return `${(bytes / MAX_BYTES).toFixed(1)} MiB, over the 1 MiB limit`;
  return null;
}

function trackedPublicFiles(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', 'apps'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files failed in ${root}: ${r.stderr.trim()}`);
  return r.stdout.split('\0').filter((p) => PUBLIC_RE.test(p));
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const root = resolve(arg('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const allowlistPath = resolve(arg('--allowlist') ?? join(root, 'scripts', 'public-assets-allowlist.txt'));
  const { entries, errors } = existsSync(allowlistPath)
    ? parseAllowlist(readFileSync(allowlistPath, 'utf8'))
    : { entries: new Map(), errors: [] };

  let files;
  try {
    files = trackedPublicFiles(root);
  } catch (err) {
    console.error(`check-public-fixtures: ${err.message}`);
    return 2;
  }
  // Anti-vacuity: no public file at all means the scan looked in the wrong tree.
  if (files.length === 0) {
    console.error(`check-public-fixtures: git tracks no file under apps/*/public/ in ${root}; the scan cannot be trusted.`);
    return 2;
  }

  const bad = [];
  for (const path of files) {
    const full = join(root, path);
    if (!existsSync(full)) continue; // deleted in the working tree, not yet staged
    const why = violation(path, statSync(full).size);
    if (why && !entries.has(path)) bad.push(`${path}: ${why}`);
  }
  const tracked = new Set(files);
  for (const path of entries.keys()) if (!tracked.has(path)) console.log(`note: ${path} is in the allowlist but not tracked; delete its row.`);

  if (errors.length > 0) {
    console.error(`❌ ${allowlistPath}:`);
    for (const e of errors) console.error(`   ${e}`);
  }
  if (bad.length > 0) {
    console.error('❌ Files under apps/*/public/ ship with every deploy:\n');
    for (const line of bad) console.error(`   ${line}`);
    console.error('\nA test fixture goes next to its test (apps/viewer/src/**/__fixtures__/) or into');
    console.error('tests/models/manifest.json and `pnpm fixtures`. A file the app loads at runtime');
    console.error('goes in scripts/public-assets-allowlist.txt as `<path>  # why the app ships it`.');
  }
  if (errors.length > 0 || bad.length > 0) return 1;
  console.log(`public fixtures: ${files.length} tracked files under apps/*/public/, ${entries.size} allowlisted, none to move.`);
  return 0;
}

if (isMainEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
