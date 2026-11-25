#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pack `@bimvoice/ifcsheet` as ONE installable tarball.
 *
 * The engine runs on this repository's own copies of the `@ifc-lite/*` packages, which differ from the ones ifc-lite
 * publishes under the same versions (`docs/architecture/npm-publishing.md`), so a tarball that merely depends on those
 * names installs and then fails on load. This script puts our copies INSIDE the tarball, as npm's bundled dependencies:
 * they travel in `node_modules/` of the package, nothing is published under a name that is not ours, and the wasm
 * geometry engine comes with them. Their own outside dependencies (fflate, jspdf, decimal.js...) become plain
 * dependencies of the package and are installed from the registry as usual. What one of them loads only on request
 * and marks as an optional peer (the Parquet export's apache-arrow and parquet-wasm) stays an optional peer of the
 * package and is not installed.
 *
 * It reads built output only: build first (`pnpm turbo run build --filter="@bimvoice/ifcsheet..."`, and the wasm with
 * `pnpm build:wasm` or `pnpm build:wasm:fetch`). It writes nothing into the repository and never contacts a registry.
 *
 *   node scripts/pack-ifcsheet.mjs --out <dir>      writes <dir>/bimvoice-ifcsheet-<version>.tgz and prints its path
 *
 * `scripts/pack-ifcsheet.install.test.mjs` installs the tarball in an empty folder and builds a drawing set with it.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE = '@bimvoice/ifcsheet';
/** Optional in the workspace and wanted only inside a third party's own desktop shell: not installed with the engine. */
const LEFT_OUT = new Set(['@tauri-apps/api']);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Every workspace package under `packages/`, by name. */
function workspace(root) {
  const byName = new Map();
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifest = join(root, 'packages', dir, 'package.json');
    if (existsSync(manifest)) byName.set(readJson(manifest).name, { dir: join(root, 'packages', dir), manifest: readJson(manifest) });
  }
  return byName;
}

/** A package's peers, split by whether `peerDependenciesMeta` marks them optional. */
function peersOf(manifest) {
  const required = {};
  const optional = {};
  for (const [dep, range] of Object.entries(manifest.peerDependencies ?? {})) {
    (manifest.peerDependenciesMeta?.[dep]?.optional ? optional : required)[dep] = range;
  }
  return { required, optional };
}

/**
 * What the tarball must carry and ask for: the workspace packages the engine reaches (`bundled`, in dependency order
 * of discovery), the registry packages any of them needs (`outside`, name to range), and the registry packages one of
 * them loads only on request (`optionalPeers`: an optional peer dependency, such as the Parquet export's
 * `apache-arrow`). An optional peer is not installed with the engine; the tarball names it as an optional peer of its
 * own, so whoever wants that feature installs it at a range that fits. Two ranges for one outside package are refused:
 * one install cannot satisfy both without nesting, and nothing here nests.
 */
export function closureOf(root = ROOT) {
  const byName = workspace(root);
  const top = byName.get(PACKAGE);
  if (!top) throw new Error(`${PACKAGE} is not a package of this workspace.`);
  const bundled = [];
  const outside = new Map();
  const optionalPeers = new Map();
  const seen = new Set([PACKAGE]);
  const ask = (into, dep, range, by) => {
    const had = into.get(dep);
    if (had !== undefined && had !== range) throw new Error(`${dep} is asked for as ${had} and as ${range} (by ${by}): align the two ranges.`);
    into.set(dep, range);
  };
  const walk = (name) => {
    const { manifest } = byName.get(name);
    const peers = peersOf(manifest);
    for (const [dep, range] of Object.entries({ ...manifest.optionalDependencies, ...manifest.dependencies, ...peers.required })) {
      if (byName.has(dep)) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        bundled.push(dep);
        walk(dep);
      } else if (!LEFT_OUT.has(dep)) {
        ask(outside, dep, range, name);
      }
    }
    for (const [dep, range] of Object.entries(peers.optional)) {
      if (byName.has(dep)) throw new Error(`${name} has the workspace package ${dep} as an optional peer: the tarball can only bundle it or leave it out.`);
      ask(optionalPeers, dep, range, name);
    }
  };
  walk(PACKAGE);
  // A package another bundled package needs outright is installed anyway: it is a plain dependency, not an optional peer.
  for (const dep of outside.keys()) optionalPeers.delete(dep);
  const sorted = (map) => new Map([...map].sort(([a], [b]) => a.localeCompare(b)));
  return { byName, bundled: bundled.sort(), outside: sorted(outside), optionalPeers: sorted(optionalPeers) };
}

/** The manifest a bundled package travels with: its entry points and metadata, its dependencies as plain versions, no scripts. */
function travelManifest(manifest, byName) {
  const pinned = (deps) => Object.fromEntries(Object.entries(deps ?? {}).filter(([name]) => !LEFT_OUT.has(name)).map(([name, range]) => [name, byName.has(name) ? byName.get(name).manifest.version : range]));
  const { scripts: _scripts, devDependencies: _dev, optionalDependencies, publishConfig: _publish, ...kept } = manifest;
  return { ...kept, dependencies: pinned({ ...optionalDependencies, ...manifest.dependencies }) };
}

/** Copy a package's shipped files (its `files` list) into `to`, leaving source maps behind. */
function copyShipped(from, files, to) {
  for (const entry of files) {
    if (entry.startsWith('!')) continue;
    const source = join(from, entry);
    if (!existsSync(source)) throw new Error(`${source} is missing: build the packages (and the wasm) before packing.`);
    const target = join(to, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, filter: (path) => !path.endsWith('.map') && !/\.test\.(js|d\.ts)$/.test(path) });
  }
}

/** Stage the package in `stage` and return the manifest written there. */
export function stage(stageDir, root = ROOT) {
  const { byName, bundled, outside, optionalPeers } = closureOf(root);
  const top = byName.get(PACKAGE);
  copyShipped(top.dir, ['dist', 'fonts', 'README.md'], stageDir);
  for (const legal of ['LICENSE', 'NOTICE']) cpSync(join(root, legal), join(stageDir, legal));
  for (const name of bundled) {
    const { dir, manifest } = byName.get(name);
    const to = join(stageDir, 'node_modules', name);
    copyShipped(dir, (manifest.files ?? ['dist']).filter((f) => f !== 'README.md'), to);
    cpSync(join(root, 'LICENSE'), join(to, 'LICENSE'));
    writeFileSync(join(to, 'package.json'), `${JSON.stringify(travelManifest(manifest, byName), null, 2)}\n`);
  }
  const { scripts: _scripts, devDependencies: _dev, private: _private, ...kept } = top.manifest;
  const manifest = {
    ...kept,
    dependencies: { ...Object.fromEntries(bundled.map((name) => [name, byName.get(name).manifest.version])), ...Object.fromEntries(outside) },
    bundleDependencies: bundled,
    ...(optionalPeers.size > 0 && {
      peerDependencies: { ...kept.peerDependencies, ...Object.fromEntries(optionalPeers) },
      peerDependenciesMeta: { ...kept.peerDependenciesMeta, ...Object.fromEntries([...optionalPeers.keys()].map((name) => [name, { optional: true }])) },
    }),
    files: ['dist', 'fonts', 'README.md', 'LICENSE', 'NOTICE'],
  };
  writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Pack into `outDir`; returns the tarball's path. */
export function pack(outDir, root = ROOT) {
  const stageDir = mkdtempSync(join(tmpdir(), 'ifcsheet-pack-'));
  try {
    stage(stageDir, root);
    mkdirSync(outDir, { recursive: true });
    const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', resolve(outDir)], { cwd: stageDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
    return join(resolve(outDir), filename.replace(/^@/, '').replace('/', '-'));
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  if (at < 0 || !process.argv[at + 1]) {
    console.error('usage: node scripts/pack-ifcsheet.mjs --out <dir>');
    process.exit(2);
  }
  try {
    const tarball = pack(process.argv[at + 1]);
    console.log(`${tarball} (${(statSync(tarball).size / 1e6).toFixed(1)} MB)`);
  } catch (error) {
    console.error(`pack-ifcsheet: ${error.message}`);
    process.exit(1);
  }
}
