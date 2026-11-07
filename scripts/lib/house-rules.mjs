/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pure parts of `scripts/check-house-rules.mjs` (#563): which oxlint
 * diagnostics count as a house-rule hit, and whether the measured counts may
 * stand against the committed baseline.
 */

import { relative, resolve } from 'node:path';
import { compareToBaseline } from './count-ratchet.mjs';

/** The three rules AGENTS.md names, as oxlint reports them. */
export const HOUSE_RULES = {
  'typescript(no-explicit-any)': 'no-explicit-any',
  'typescript(ban-ts-comment)': 'ts-ignore',
  'eslint(no-empty)': 'empty-catch',
};

/** An oxlint config that runs only the three rules, at warn. */
export const HOUSE_RULES_CONFIG = {
  plugins: ['typescript'],
  categories: {},
  rules: {
    'typescript/no-explicit-any': 'warn',
    'typescript/ban-ts-comment': ['warn', {
      'ts-ignore': true,
      'ts-expect-error': false,
      'ts-nocheck': false,
      'ts-check': false,
    }],
    'no-empty': ['warn', { allowEmptyCatch: false }],
  },
};

/** Baseline key for one rule in one file. */
export const keyOf = (file, rule) => `${file} :: ${rule}`;

/**
 * Count house-rule diagnostics per file and rule.
 * @param {Array<{ code?: unknown, filename: string }>} diagnostics oxlint's report
 * @param {string} root the tree the filenames are relative to
 * @param {string} cwd where oxlint ran, which its filenames are relative to
 * @returns {Record<string, number>}
 */
export function countHits(diagnostics, root, cwd) {
  const counts = {};
  for (const d of diagnostics) {
    const rule = typeof d.code === 'string' ? HOUSE_RULES[d.code] : undefined;
    if (rule === undefined) continue;
    const file = relative(root, resolve(cwd, d.filename)).split('\\').join('/');
    const key = keyOf(file, rule);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * The gate's decision. A count above its baseline row fails, and so does a
 * hit in a file with no row (its allowance is zero). Equal or lower passes;
 * a lower count is returned in `improvements` so the caller can say the
 * baseline may shrink, without failing (see check-jsx-a11y.mjs for why).
 * @param {Record<string, number>} counts
 * @param {Record<string, number>} baseline
 */
export function decide(counts, baseline) {
  const { regressions, improvements } = compareToBaseline(counts, baseline);
  return { ok: regressions.length === 0, regressions, improvements };
}

/** Totals per rule name, for the summary line. */
export function totalsByRule(counts) {
  const totals = Object.fromEntries(Object.values(HOUSE_RULES).map((r) => [r, 0]));
  for (const [key, n] of Object.entries(counts)) totals[key.slice(key.lastIndexOf(' :: ') + 4)] += n;
  return totals;
}
