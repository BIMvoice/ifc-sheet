#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * no-stack (#561): a pull request must be built on main, never on another
 * open pull request. CI tests a PR merged onto main, so a stacked PR has never
 * been tested the way it will land.
 *
 * It fails when
 *   - the PR's base is not main, or
 *   - one of its commits is the head of another open PR, or
 *   - one of its commits is on another open PR's branch and not on main
 *     (GitHub lists a PR's commits as those not on its base, so for a PR into
 *     main that is exactly "on the branch and not on main").
 * The message names the PR it sits on.
 *
 * The decision is `decideNoStack`, a pure function over commit lists and the
 * open-PR list; the rest of this file reads those from the GitHub API with the
 * workflow's token (read-only is enough).
 *
 * Env: GH_TOKEN, GH_REPO (owner/name), PR (number), EVENT_NAME, BASE_REF.
 * A merge_group run has no PR: the check skips with a log line, because the
 * queue itself tests the entry against current main.
 */
import { fileURLToPath } from 'node:url';
import { getAll } from './lib/gh-rest.mjs';

/**
 * @param {{
 *   baseRef: string,
 *   commits: string[],
 *   openPrs: { number: number, headSha: string, commits: string[] }[],
 *   mainRef?: string,
 * }} input `commits` are the PR's own commits (not on its base); `openPrs`
 *   are the OTHER open PRs, each with the commits not on its base.
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function decideNoStack({ baseRef, commits, openPrs, mainRef = 'main' }) {
  const problems = [];
  if (baseRef !== mainRef) {
    problems.push(`The base is ${baseRef}, not ${mainRef}. Open the PR against ${mainRef}; wait for the PR it builds on to merge.`);
  }
  const mine = new Set(commits);
  for (const pr of openPrs) {
    const shared = [...new Set([pr.headSha, ...pr.commits])].filter((sha) => mine.has(sha));
    if (shared.length === 0) continue;
    const head = mine.has(pr.headSha) ? ' including its head commit' : '';
    problems.push(
      `This PR contains ${shared.length} commit${shared.length === 1 ? '' : 's'} of open PR #${pr.number}${head} ` +
        `(${shared[0].slice(0, 9)}), which are not on ${mainRef}. Do not stack PRs: wait for #${pr.number} to merge, then branch from ${mainRef}.`,
    );
  }
  return { ok: problems.length === 0, problems };
}

async function main() {
  const { GH_TOKEN, GH_REPO, PR, EVENT_NAME, BASE_REF } = process.env;
  if (EVENT_NAME !== 'pull_request') {
    console.log(`no-stack: skipped, the event is ${EVENT_NAME || 'unknown'}, not pull_request. The merge queue tests the entry against current main.`);
    return 0;
  }
  if (!GH_TOKEN || !GH_REPO || !PR || !BASE_REF) {
    console.error('no-stack: GH_TOKEN, GH_REPO, PR and BASE_REF are required.');
    return 2;
  }
  const self = Number(PR);
  const commits = (await getAll(GH_TOKEN, `/repos/${GH_REPO}/pulls/${self}/commits`, 3)).map((c) => c.sha);
  const open = (await getAll(GH_TOKEN, `/repos/${GH_REPO}/pulls?state=open`)).filter((p) => p.number !== self);
  const openPrs = [];
  for (const p of open) {
    const theirs = await getAll(GH_TOKEN, `/repos/${GH_REPO}/pulls/${p.number}/commits`, 3);
    openPrs.push({ number: p.number, headSha: p.head.sha, commits: theirs.map((c) => c.sha) });
  }
  const { ok, problems } = decideNoStack({ baseRef: BASE_REF, commits, openPrs });
  if (ok) {
    console.log(`no-stack: PR #${self} is built on ${BASE_REF}; ${commits.length} commits, none shared with ${openPrs.length} other open PRs.`);
    return 0;
  }
  for (const p of problems) console.error(`::error title=no-stack::${p}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`no-stack: ${err.message}`);
      process.exit(2);
    },
  );
}
