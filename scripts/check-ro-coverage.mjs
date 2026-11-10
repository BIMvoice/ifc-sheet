#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Romanian coverage ratchet. Three PRs (#474, #512, #514) added English
 * catalogue keys with no Romanian and two whole panels (#475, #513) shipped
 * without any; `scripts/check-i18n-literals.mjs` only sees literals in
 * components and `locales/ro.test.ts` only some key prefixes.
 *
 * This gate covers ALL English catalogue keys. A key is missing when the
 * Romanian catalogue the app serves (`locales/ro.ts`, which merges every
 * `*.ro.ts` and the engine tables) has no entry for it. The committed
 * baseline records today's missing keys (the exact keys, not a count), one
 * file per key namespace: `scripts/ro-coverage-baseline/<namespace>.txt`
 * holds the sorted keys that start with `<namespace>.`, one per line. Two PRs
 * that translate keys of different features shrink different files, so they
 * never touch neighbouring lines (one sorted array did: removals at the
 * boundary between two namespaces, and the comma before a removed last key,
 * conflicted). It fails when
 *
 *   - a key is missing and NOT in the baseline (a new English key with no
 *     Romanian: translate it), and
 *   - a baselined key now has Romanian, or no longer exists in English
 *     (the baseline only shrinks: run `--update`).
 *
 * `--update` refuses to add a key; there is no override. Same shape as
 * `check-i18n-literals.mjs` and `check-unused-locals.mjs`; the comparison is
 * `compareToBaseline` from `scripts/lib/count-ratchet.mjs` with one per key.
 *
 * Flags:
 *   --baseline <path>  read/write this baseline instead of the committed one: a
 *                      directory of `<namespace>.txt` files, or a path ending in
 *                      `.json` for one sorted array (the tests use that)
 *   --measured <path>  read the missing keys from this JSON (an array, or
 *                      { missing: [...] }) instead of running the probe (tests)
 *   --json             also print { unlisted, stale } (the two failing sets) on stdout
 *   --update           rewrite the baseline to the measured list (shrink only)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareToBaseline } from './lib/count-ratchet.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');
const VIEWER_DIR = join(REPO_ROOT, 'apps', 'viewer');
const PROBE = join(SCRIPTS_DIR, 'lib', 'ro-missing-keys-probe.ts');
const SELF = 'node scripts/check-ro-coverage.mjs';

function fail(message) {
  console.error(`check-ro-coverage: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { baseline: join(SCRIPTS_DIR, 'ro-coverage-baseline'), measured: null, update: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--baseline' || flag === '--measured') {
      if (argv[i + 1] === undefined) fail(`${flag} needs a value. Pass a path after ${flag}.`);
      out[flag.slice(2)] = argv[i + 1];
      i += 1;
    } else if (flag === '--json') {
      out.json = true;
    } else if (flag === '--update') {
      out.update = true;
    } else {
      fail(`unknown argument: ${flag}. Supported: --baseline, --measured, --json, --update.`);
    }
  }
  return out;
}

function readKeys(path, what) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`cannot read ${what} ${path}: ${err.message}. Regenerate the baseline with \`${SELF} --update\`.`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.missing;
  if (!Array.isArray(list) || !list.every((k) => typeof k === 'string')) fail(`${what} ${path} is not an array of key strings.`);
  return list;
}

/** The namespace of a key: what comes before its first dot. It names the baseline file the key is listed in. */
const namespaceOf = (key) => key.split('.')[0];
const NAMESPACE = /^[A-Za-z0-9_-]+$/;
const isJsonBaseline = (path) => path.endsWith('.json');

/** The baselined keys, from a `.json` array or a directory of `<namespace>.txt` files; null when there is none. */
function readBaseline(path) {
  if (!existsSync(path)) return null;
  if (isJsonBaseline(path)) return readKeys(path, 'baseline');
  const keys = [];
  for (const file of readdirSync(path).filter((f) => f.endsWith('.txt')).sort()) {
    const namespace = file.slice(0, -'.txt'.length);
    const listed = readFileSync(join(path, file), 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    for (const key of listed) {
      if (namespaceOf(key) !== namespace) fail(`${relative(REPO_ROOT, join(path, file))} lists ${key}, which belongs in ${namespaceOf(key)}.txt. Regenerate the baseline with \`${SELF} --update\`.`);
      keys.push(key);
    }
  }
  return keys;
}

/** Writes `keys` as the baseline: one sorted `.json` array, or one sorted `<namespace>.txt` per namespace (a namespace with none left loses its file). */
function writeBaseline(path, keys) {
  const sorted = [...keys].sort();
  if (isJsonBaseline(path)) {
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
    return;
  }
  const byNamespace = new Map();
  for (const key of sorted) {
    const namespace = namespaceOf(key);
    if (!NAMESPACE.test(namespace)) fail(`the key ${key} has a namespace that cannot name a file; nothing was written.`);
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), key]);
  }
  mkdirSync(path, { recursive: true });
  for (const file of readdirSync(path).filter((f) => f.endsWith('.txt'))) {
    if (!byNamespace.has(file.slice(0, -'.txt'.length))) rmSync(join(path, file));
  }
  for (const [namespace, list] of byNamespace) {
    const file = join(path, `${namespace}.txt`);
    const text = `${list.join('\n')}\n`;
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
  }
}

function measure(args) {
  if (args.measured !== null) return { missing: readKeys(args.measured, 'measured list'), total: null };
  const run = spawnSync('pnpm', ['exec', 'tsx', '--import', './src/test/vite-module-hooks.mjs', PROBE], {
    cwd: VIEWER_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    fail(`the catalogue probe failed (exit ${run.status}). Build the packages first: pnpm turbo run build --filter='./packages/*'\n${run.stderr ?? run.error}`);
  }
  try {
    const { missing, total } = JSON.parse(run.stdout);
    if (!Array.isArray(missing) || typeof total !== 'number' || total === 0) throw new Error('unexpected probe output');
    return { missing, total };
  } catch (err) {
    fail(`cannot parse the probe output: ${err.message}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const { missing, total } = measure(args);
const measuredCounts = Object.fromEntries(missing.map((k) => [k, 1]));
const baselineKeys = readBaseline(args.baseline);
if (baselineKeys === null && !args.update) fail(`no baseline at ${args.baseline}. Run: ${SELF} --update`);
const { regressions, improvements } = compareToBaseline(measuredCounts, Object.fromEntries((baselineKeys ?? []).map((k) => [k, 1])));

if (args.json) console.log(JSON.stringify({ unlisted: regressions.map((r) => r.key), stale: improvements.map((r) => r.key) }));

if (args.update) {
  if (baselineKeys !== null && regressions.length > 0) {
    fail(
      `refusing to raise the ratchet. English key(s) with no Romanian that the baseline does not list:\n\n` +
        `${regressions.map((r) => `  ${r.key}`).join('\n')}\n\nAdd the Romanian entry (in the key's \`*.ro.ts\`, wired into barrels/ro-*.ts). Nothing was written.`,
    );
  }
  writeBaseline(args.baseline, missing);
  console.log(`check-ro-coverage: wrote ${missing.length} key(s) to ${relative(REPO_ROOT, args.baseline)}.`);
  process.exit(0);
}

if (regressions.length > 0) {
  console.error(`check-ro-coverage: ${regressions.length} English catalogue key(s) have no Romanian entry and are not in the baseline:\n`);
  for (const { key } of regressions) console.error(`  ${key}`);
  console.error(
    '\nAdd the Romanian text next to the English one (apps/viewer/src/i18n/catalogues/<feature>.ro.ts, wired into\n' +
      'barrels/ro-a-l.ts or ro-m-z.ts; term choices: apps/viewer/src/i18n/ro-glossary.md). The baseline never grows.',
  );
  process.exit(1);
}
if (improvements.length > 0) {
  console.error(`check-ro-coverage: ${improvements.length} baselined key(s) now have Romanian (or are gone from English) but are still listed:\n`);
  for (const { key } of improvements) console.error(`  ${key}`);
  fail(`the baseline carries slack; run \`${SELF} --update\` and commit to shrink it.`);
}
console.log(`check-ro-coverage: OK (${missing.length} key(s) still without Romanian, all baselined${total === null ? '' : `, of ${total} English keys`})`);
