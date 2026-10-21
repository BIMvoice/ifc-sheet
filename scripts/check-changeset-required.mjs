#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A pull request that changes a published package's `src/` carries a
 * changeset naming that package.
 *
 * WHY: CONTRIBUTING.md says "A change to any published `packages/*` needs a
 * changeset", and review kept finding package API changes without one. The two
 * changeset gates already in `scripts/` do not catch it: `check-changesets.mjs`
 * checks that each pending changeset names a workspace package, and
 * `check-changeset-bump.mjs` checks the bump level when the recorded API
 * surface shrank. Neither looks at a pull request that adds no changeset.
 *
 * THE RULE. Against the base commit (`--base <sha>`, else `$BASE_SHA`, else
 * `git merge-base origin/main HEAD`), take the files the head changed. A file
 * under `packages/<name>/src/` counts unless it is a test (`*.test.*`,
 * `*.spec.*`, `__tests__/`, `__fixtures__/`, `__snapshots__/`). Its package
 * counts when its package.json is not `"private": true`. Nothing under
 * `apps/` counts: the apps (`apps/viewer` among them) are not published, so a
 * viewer-only, docs-only or CI-only pull request passes without a changeset.
 * Each counted package must be named by a changeset the pull request adds or
 * edits in `.changeset/`. The check never refuses a changeset it does not
 * require.
 *
 * A change no user would notice (an internal refactor) is declared with an
 * empty changeset, `pnpm changeset --empty`: the decision is then written down
 * in the pull request, which is the point. The gate says which packages that
 * empty changeset covered.
 *
 * Changesets are read with `@changesets/parse`, the parser Changesets uses
 * (see check-changesets.mjs for why not a regex).
 *
 * Usage: node scripts/check-changeset-required.mjs [--base <sha>] [--root <dir>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import parseChangeset from '@changesets/parse';
import { isMainEntry } from './lib/is-main-entry.mjs';

const SRC_RE = /^(packages\/[^/]+)\/src\//;
const TEST_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:__tests__|__fixtures__|__snapshots__)\//;
const CHANGESET_RE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/i;

function git(root, ...argv) {
  const r = spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${argv.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** `[{ status, path }]` the head changed against `base` (the new path for a rename). */
export function changedFiles(root, base) {
  return git(root, 'diff', '--name-status', '--no-renames', base, 'HEAD')
    .split('\n')
    .filter(Boolean)
    .map((line) => { const [status, path] = line.split('\t'); return { status, path }; });
}

/** The package directories (`packages/x`) whose non-test `src/` files appear in `paths`, with the files. */
export function touchedPackages(paths) {
  const out = new Map();
  for (const path of paths) {
    const m = SRC_RE.exec(path);
    if (!m || TEST_RE.test(path)) continue;
    out.set(m[1], [...(out.get(m[1]) ?? []), path]);
  }
  return out;
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const root = resolve(arg('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  let base = arg('--base') ?? process.env.BASE_SHA ?? null;
  let changes;
  try {
    if (!base) base = git(root, 'merge-base', 'origin/main', 'HEAD').trim();
    changes = changedFiles(root, base);
  } catch (err) {
    console.error(`check-changeset-required: ${err.message}. Pass --base <sha> (the pull request's base commit).`);
    return 2;
  }

  const published = new Map();
  for (const [dir, files] of touchedPackages(changes.map((c) => c.path))) {
    const manifest = join(root, dir, 'package.json');
    if (!existsSync(manifest)) continue; // the package itself was deleted
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (pkg.private === true || !pkg.name) continue;
    published.set(pkg.name, { dir, files });
  }
  if (published.size === 0) {
    console.log('changeset required: no published package src/ changed; nothing to check.');
    return 0;
  }

  const named = new Set();
  const empty = [];
  const unreadable = [];
  for (const { status, path } of changes) {
    if (status === 'D' || !CHANGESET_RE.test(path)) continue;
    try {
      const releases = parseChangeset(readFileSync(join(root, path), 'utf8')).releases;
      if (releases.length === 0) empty.push(path);
      for (const r of releases) named.add(r.name);
    } catch (err) {
      unreadable.push(`${path}: ${err.message}`);
    }
  }
  if (unreadable.length > 0) {
    console.error('❌ Changesets Changesets cannot parse:\n');
    for (const line of unreadable) console.error(`   ${line}`);
    return 1;
  }

  const missing = [...published].filter(([name]) => !named.has(name));
  if (missing.length > 0 && empty.length > 0) {
    console.log(`changeset required: ${missing.map(([n]) => n).join(', ')} declared as no release by ${empty.join(', ')}.`);
    return 0;
  }
  if (missing.length > 0) {
    console.error('❌ Published packages whose src/ changed, with no changeset in this pull request naming them:\n');
    for (const [name, { files }] of missing) {
      console.error(`   ${name}: ${files.length} file(s), e.g. ${files[0]}`);
    }
    console.error('\nRun `pnpm changeset`, pick each package above and the bump (AGENTS.md, "Changesets &');
    console.error('published API"). If no user would notice the change, `pnpm changeset --empty`');
    console.error('records that decision instead. Private packages (apps/viewer) never need one.');
    return 1;
  }
  console.log(`changeset required: ${[...published.keys()].join(', ')} changed, each named by a changeset.`);
  return 0;
}

if (isMainEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
