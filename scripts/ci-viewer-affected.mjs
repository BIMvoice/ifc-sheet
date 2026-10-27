#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Can the viewer's test shards and production build be skipped for a pull
 * request? Called by the `changes` job of .github/workflows/ci.yml with the
 * changed files that would otherwise force the viewer lane on (everything
 * that is not docs, Rust or an app).
 *
 * The answer is `false` (skip) only when ALL of these hold; any doubt, and any
 * error, is `true` (run), so the worst this script can do is leave the lane on:
 *
 *   1. every file lies inside a workspace package directory (packages/<dir>/
 *      or apps/<dir>/ with a package.json) - a file anywhere else (root
 *      config, scripts/, shared/, a lockfile) is something the viewer may read;
 *   2. none of those packages is apps/viewer or in its dependency closure
 *      (dependencies, devDependencies, peerDependencies and
 *      optionalDependencies of apps/viewer and, transitively, of each package
 *      it names);
 *   3. nothing in apps/viewer, in the closure's packages or in the repo-root
 *      config mentions the package by name, by `packages/<dir>` or by a
 *      relative `../<dir>/` path. The viewer imports some packages through
 *      tsconfig `paths` and relative paths rather than through package.json
 *      (packages/ifcsheet is one), so the manifest alone proves nothing.
 *
 * Usage: node scripts/ci-viewer-affected.mjs <file listing changed paths>
 * Prints the reason on stderr and `true` or `false` on stdout.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMainEntry } from './lib/is-main-entry.mjs';

const VIEWER = 'apps/viewer';
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
/** Repo-root files that configure every package's build or tests. */
const ROOT_CONFIG = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.json',
  'tsconfig.packages.json',
  'tsconfig.tests.base.json',
];

/** @returns {Map<string, {name: string, dir: string, deps: string[]}>} keyed by directory */
export function workspacePackages(root) {
  const out = new Map();
  for (const parent of ['packages', 'apps']) {
    const base = join(root, parent);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(base, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      const json = JSON.parse(readFileSync(manifest, 'utf8'));
      const deps = DEP_FIELDS.flatMap((f) => Object.keys(json[f] ?? {}));
      out.set(`${parent}/${entry.name}`, { name: json.name, dir: `${parent}/${entry.name}`, deps });
    }
  }
  return out;
}

/** Directories of the viewer and everything it depends on, transitively. */
export function viewerClosure(packages) {
  const byName = new Map([...packages.values()].map((p) => [p.name, p]));
  const seen = new Set();
  const stack = [VIEWER];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = packages.get(dir);
    if (!pkg) continue;
    for (const dep of pkg.deps) {
      const target = byName.get(dep);
      if (target) stack.push(target.dir);
    }
  }
  return seen;
}

function ownerOf(file, packages) {
  const parts = file.split('/');
  if (parts.length < 3) return null;
  const dir = `${parts[0]}/${parts[1]}`;
  return packages.has(dir) ? dir : null;
}

/**
 * Default text search: `git grep -l -F` over pathspecs, true when anything
 * matches. Markdown is left out: a changelog naming a package is prose, not an
 * import.
 */
function gitMentions(root, needles, pathspecs) {
  const args = ['grep', '-l', '-F', ...needles.flatMap((n) => ['-e', n]), '--', ...pathspecs, ':(exclude)*.md'];
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().length > 0;
  } catch (err) {
    if (err.status === 1) return false; // git grep: no match
    throw err;
  }
}

/**
 * @param {{root: string, files: string[], mentions?: typeof gitMentions}} input
 * @returns {{affected: boolean, reason: string}}
 */
export function viewerAffected({ root, files, mentions = gitMentions }) {
  if (files.length === 0) return { affected: true, reason: 'no files given' };
  const packages = workspacePackages(root);
  const closure = viewerClosure(packages);
  const owners = new Set();
  for (const file of files) {
    const owner = ownerOf(file, packages);
    if (!owner) return { affected: true, reason: `${file} is not inside a workspace package` };
    if (closure.has(owner)) return { affected: true, reason: `${file} is in the viewer's closure (${owner})` };
    owners.add(owner);
  }
  const readers = [...closure].filter((d) => existsSync(join(root, d)));
  const pathspecs = [...readers, ...ROOT_CONFIG.filter((f) => existsSync(join(root, f)))];
  for (const dir of owners) {
    const { name } = packages.get(dir);
    const base = dir.split('/')[1];
    const needles = [name, dir, `../${base}/`];
    if (mentions(root, needles, pathspecs)) {
      return { affected: true, reason: `${dir} is mentioned by the viewer, its dependencies or the root config` };
    }
  }
  return { affected: false, reason: `only ${[...owners].join(', ')} changed; the viewer neither depends on nor mentions them` };
}

if (isMainEntry(import.meta.url)) {
  let result;
  try {
    const listing = readFileSync(process.argv[2], 'utf8');
    const files = listing.split('\n').map((l) => l.trim()).filter(Boolean);
    result = viewerAffected({ root: process.cwd(), files });
  } catch (err) {
    result = { affected: true, reason: `error, running the viewer lane: ${err.message}` };
  }
  console.error(result.reason);
  console.log(String(result.affected));
}
