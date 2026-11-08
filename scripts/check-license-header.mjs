#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A pull request's ADDED source files carry the MPL-2.0 header (#563, item 7).
 *
 * LICENSE_HEADER.md says every new source file has one, and
 * `scripts/lib/license-header.mjs` knows which file types the rule covers,
 * which generated trees are exempt and what counts as a declaration. Nothing
 * called it on a pull request. This check lists the files the head ADDED
 * against the base (`git diff --diff-filter=A`), keeps those the rule covers
 * (`licenseHeaderFor`), reads each from the head commit and fails naming every
 * one without a declaration (`hasLicenseHeader`). There is no second matcher
 * here. Files that already existed are never looked at, so old headerless
 * files do not fail a pull request that edits them.
 *
 * The base is `--base <ref>`, else `$BASE_SHA`, else
 * `git merge-base origin/main HEAD`, as in check-changeset-required.mjs.
 *
 * Usage: node scripts/check-license-header.mjs [--base <ref>] [--root <dir>]
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLicenseHeader, licenseHeaderFor } from './lib/license-header.mjs';
import { isMainEntry } from './lib/is-main-entry.mjs';

function git(root, ...argv) {
  const r = spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${argv.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** Repo-relative paths the head added against `base`. */
export function addedFiles(root, base) {
  return git(root, '-c', 'core.quotepath=off', 'diff', '--name-only', '--no-renames', '--diff-filter=A', base, 'HEAD')
    .split('\n')
    .filter(Boolean);
}

/** The added, in-scope files whose text at HEAD has no MPL declaration. */
export function missingHeaders(root, base) {
  return addedFiles(root, base)
    .filter((path) => licenseHeaderFor(path) !== null)
    .filter((path) => !hasLicenseHeader(git(root, 'show', `HEAD:${path}`)));
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const root = resolve(arg('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  let base = arg('--base') ?? process.env.BASE_SHA ?? null;
  let missing;
  try {
    if (!base) base = git(root, 'merge-base', 'origin/main', 'HEAD').trim();
    missing = missingHeaders(root, base);
  } catch (err) {
    console.error(`check-license-header: ${err.message}. Pass --base <sha> (the pull request's base commit).`);
    return 2;
  }
  if (missing.length === 0) {
    console.log('license header: every added source file carries the MPL-2.0 header.');
    return 0;
  }
  console.error('❌ Added files without the MPL-2.0 header:\n');
  for (const path of missing) console.error(`   ${path}`);
  console.error('\nAdd the notice for the file type (LICENSE_HEADER.md), or run');
  console.error('`node scripts/add-license-headers.mjs` to write the missing headers.');
  return 1;
}

if (isMainEntry(import.meta.url)) process.exitCode = main(process.argv.slice(2));
