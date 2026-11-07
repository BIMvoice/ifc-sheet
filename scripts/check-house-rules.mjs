#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A per-file ratchet for the three TypeScript house rules in AGENTS.md (#563):
 * no `as any` (`typescript/no-explicit-any`), no `@ts-ignore`
 * (`typescript/ban-ts-comment`) and no silent `catch {}` (`no-empty` with
 * `allowEmptyCatch: false`).
 *
 * The rules cannot go into `.oxlintrc.json` at error, because the tree
 * already holds hits and a gate that starts red forces a sweep of old code.
 * So this runs them from its own config and compares per-file counts with
 * `scripts/house-rules-baseline.json`, the way `check-jsx-a11y.mjs` does: a
 * file whose count RISES, or a file with no row that gains a hit, fails; a
 * count that falls is reported and never fails (a PR that fixes a hit without
 * touching the baseline must not turn main red). Lower the baseline with
 * `--update`.
 *
 * It lints the same directories as `pnpm lint` (`TARGETS` in
 * `check-lint-ran.mjs`).
 *
 * Flags:
 *   --root <dir>       lint this tree instead of the repo
 *   --baseline <path>  read/write this baseline instead of the committed one
 *   --update           re-record every file's count
 *   --allow-raise      with --update, permit a count to increase
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS } from './check-lint-ran.mjs';
import { HOUSE_RULES_CONFIG, countHits, decide, totalsByRule } from './lib/house-rules.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');

function fail(message) {
  console.error(`check-house-rules: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { root: REPO_ROOT, baseline: null, update: false, allowRaise: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--root' || flag === '--baseline') {
      if (value === undefined) fail(`${flag} needs a value. Pass a path after ${flag}.`);
      out[flag.slice(2)] = resolve(value);
      i += 1;
    } else if (flag === '--update') {
      out.update = true;
    } else if (flag === '--allow-raise') {
      out.allowRaise = true;
    } else {
      fail(`unknown argument: ${flag}. Supported: --root, --baseline, --update, --allow-raise.`);
    }
  }
  if (out.allowRaise && !out.update) fail('--allow-raise only means something with --update');
  if (out.baseline === null) out.baseline = join(out.root, 'scripts', 'house-rules-baseline.json');
  return out;
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/** Lint every target once. Fails closed on anything but a complete report. */
function measure(root) {
  const dirs = TARGETS.map(({ dir }) => join(root, dir));
  const missing = dirs.filter((d) => !isDir(d));
  if (missing.length > 0) fail(`lint target(s) missing: ${missing.join(', ')}.`);

  const tmp = mkdtempSync(join(tmpdir(), 'house-rules-'));
  try {
    const config = join(tmp, 'oxlintrc.json');
    writeFileSync(config, JSON.stringify(HOUSE_RULES_CONFIG));
    const result = spawnSync(
      'pnpm',
      ['exec', 'oxlint', '--config', config, '--format', 'json', ...dirs],
      { cwd: REPO_ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 },
    );
    if (result.error) fail(`could not run oxlint: ${result.error.message}`);
    if (result.signal) fail(`oxlint was killed by ${result.signal}; its report is incomplete.`);
    const jsonStart = result.stdout.indexOf('{');
    let report;
    try {
      report = JSON.parse(jsonStart >= 0 ? result.stdout.slice(jsonStart) : result.stdout);
    } catch (err) {
      fail(`oxlint's JSON report did not parse (${err.message}). stderr:\n${result.stderr}`);
    }
    if (!Array.isArray(report.diagnostics) || !(report.number_of_files > 0)) {
      fail(`oxlint reported ${report.number_of_files} file(s) linted; exiting 0 would certify a tree nobody looked at.`);
    }
    return { counts: countHits(report.diagnostics, root, REPO_ROOT), files: report.number_of_files };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readBaseline(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`cannot parse baseline ${path}: ${err.message}. Fix the JSON by hand or regenerate it with --update.`);
  }
}

const sortedObject = (counts) => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const summary = (counts) =>
  Object.entries(totalsByRule(counts)).map(([rule, n]) => `${rule} ${n}`).join(', ');

const args = parseArgs(process.argv.slice(2));
const { counts, files } = measure(args.root);

if (args.update) {
  // The first recording has no prior rows to rise above.
  const first = !existsSync(args.baseline);
  const { regressions } = decide(counts, first ? counts : readBaseline(args.baseline));
  if (regressions.length > 0 && !args.allowRaise) {
    fail(
      `refusing to raise the ratchet.\n\n${regressions.map(({ key, count, allowed }) => `${key}: ${allowed} -> ${count}`).join('\n')}\n\n` +
        `Fix the new hits instead. If the increase is genuinely intentional, re-run with --allow-raise.\n\nNothing was written.`,
    );
  }
  writeFileSync(args.baseline, `${JSON.stringify(sortedObject(counts), null, 2)}\n`);
  console.log(`check-house-rules: wrote ${Object.keys(counts).length} row(s) to ${relative(REPO_ROOT, args.baseline)} (${summary(counts)}).`);
  process.exit(0);
}

if (!existsSync(args.baseline)) fail(`no baseline at ${args.baseline}. Run: node scripts/check-house-rules.mjs --update`);
const { ok, regressions, improvements } = decide(counts, readBaseline(args.baseline));

if (!ok) {
  console.error('check-house-rules: a house rule was broken (AGENTS.md):\n');
  for (const { key, count, allowed } of regressions) console.error(`  ${key}: ${count} (baseline ${allowed}, +${count - allowed})`);
  console.error(
    '\nempty-catch: log or rethrow the error. no-explicit-any: give the value a real type.\n' +
      'ts-ignore: fix the type. See the hit with: pnpm exec oxlint <file>\n' +
      'If the increase is genuinely intentional: node scripts/check-house-rules.mjs --update --allow-raise',
  );
  process.exit(1);
}

for (const { key, count, allowed } of improvements) {
  console.log(`note: ${key}: ${count}, baseline ${allowed}; lower the baseline with \`node scripts/check-house-rules.mjs --update\``);
}
console.log(`check-house-rules: OK (${files} file(s) linted; ${summary(counts)})`);
