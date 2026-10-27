#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Publish allowlist guard (#422).
 *
 * IfcSheet vendors and modifies the `@ifc-lite/*` packages. Publishing one of
 * them would put our modified code on npm under ifc-lite's name. This script
 * reads every workspace package.json (the globs in pnpm-workspace.yaml, plus
 * the root) and exits 1 when any package that `changeset publish` or
 * `pnpm -r publish` would send to npm is not on ALLOWED_TO_PUBLISH. Those
 * tools publish exactly the members that are not `"private": true` (and have a
 * name), so that is the test used here. It reads files only; it never
 * contacts a registry.
 *
 * A name under `@ifc-lite/` (or `create-ifc-lite`) is refused even if someone
 * adds it to the allowlist: that scope is not ours.
 *
 * Run first in `release:npm`, `publish:npm`, `publish:dry`, the manual
 * release workflow and CI. Usage: node scripts/check-publish-allowlist.mjs [--root dir]
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only packages this repository may publish. */
export const ALLOWED_TO_PUBLISH = ['@bimvoice/ifcsheet'];

const FOREIGN = (name) => name.startsWith('@ifc-lite/') || name === 'create-ifc-lite';

/** Directories named by the `packages:` globs. Supports `dir/*` and plain dirs. */
function workspaceDirs(root) {
  const yamlPath = join(root, 'pnpm-workspace.yaml');
  const globs = [];
  if (existsSync(yamlPath)) {
    let inPackages = false;
    for (const line of readFileSync(yamlPath, 'utf8').split('\n')) {
      if (/^packages:\s*$/.test(line)) { inPackages = true; continue; }
      if (inPackages) {
        const m = line.match(/^\s*-\s*['"]?([^'"#\s]+)['"]?/);
        if (m) globs.push(m[1]);
        else if (/^\S/.test(line)) inPackages = false;
      }
    }
  }
  const dirs = [''];
  for (const g of globs) {
    if (g.startsWith('!')) continue;
    if (g.endsWith('/*') && !g.slice(0, -2).includes('*')) {
      const parent = join(root, g.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const d of readdirSync(parent, { withFileTypes: true })) {
        if (d.isDirectory()) dirs.push(join(g.slice(0, -2), d.name));
      }
    } else if (g.includes('*')) {
      throw new Error(`pnpm-workspace.yaml glob "${g}" is not supported by the publish guard; use dir/*`);
    } else dirs.push(g);
  }
  return dirs;
}

/** @returns {{name: string, dir: string}[]} packages a publish would send to npm */
export function publishablePackages(root) {
  const out = [];
  for (const dir of workspaceDirs(root)) {
    const p = join(root, dir, 'package.json');
    if (!existsSync(p)) continue;
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    if (!pkg.name || pkg.private === true) continue;
    out.push({ name: pkg.name, dir: dir || '.' });
  }
  return out;
}

/** @returns {string[]} one message per violation */
export function violations(root, allowed = ALLOWED_TO_PUBLISH) {
  const msgs = [];
  for (const a of allowed) {
    if (FOREIGN(a)) msgs.push(`allowlist entry ${a} is in ifc-lite's namespace and can never be published from here`);
  }
  for (const { name, dir } of publishablePackages(root)) {
    if (FOREIGN(name)) {
      msgs.push(`${name} (${dir}) is not private: publishing it would put our modified copy on npm under ifc-lite's name. Set "private": true`);
    } else if (!allowed.includes(name)) {
      msgs.push(`${name} (${dir}) is not private and not on the publish allowlist (scripts/check-publish-allowlist.mjs). Set "private": true or add it deliberately`);
    }
  }
  return msgs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? resolve(process.argv[i + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  const msgs = violations(root);
  if (msgs.length) {
    console.error('Publish refused: packages outside the allowlist would be published.');
    for (const m of msgs) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`publish allowlist ok (${publishablePackages(root).length} publishable; allowed: ${ALLOWED_TO_PUBLISH.join(', ')})`);
}
