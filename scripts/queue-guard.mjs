#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * queue-guard (#561): at most 5 open PRs, at most one per area. A PR that is
 * the 6th open, or the second in its area, is converted to a draft with a
 * comment naming the PR that holds the slot. A draft frees no slot and is
 * checked again when it is marked ready for review.
 *
 * Counted: open, non-draft PRs that are not Dependabot's and do not carry the
 * `queue-exempt` label. Those two are the only exemptions. There is NO
 * exemption for maintainers: every agent PR here comes from the maintainer's
 * account, so exempting its author would exempt everything.
 *
 * Area of a PR: the `area:<name>` label if there is one, else the area with the
 * most changed files in `.github/queue-areas.json` (first in the file wins a
 * tie). A PR whose files match no area still counts toward the 5 but holds no
 * area.
 *
 * `decideQueue` is pure and tested over fixtures. `main` runs it against the
 * live list. It runs from a pull_request_target workflow that checks out the
 * base branch only, never the PR, and calls the API with env values.
 *
 * Env: GH_TOKEN, GH_REPO, EVENT_NAME, PR (the event's PR number, if any).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAll, graphql, post } from './lib/gh-rest.mjs';

export const QUEUE_LIMIT = 5;
export const EXEMPT_LABEL = 'queue-exempt';

export function isDependabot(login) {
  return /^(app\/)?dependabot(\[bot\])?$/i.test(login || '');
}

/** The area of a PR from its label, else from the most changed files. */
export function areaOf({ labels, files }, map) {
  const label = labels.find((l) => l.startsWith('area:'));
  if (label) return label.slice('area:'.length).trim() || null;
  const counts = new Map();
  for (const file of files) {
    const hit = map.areas.find(
      (a) => (a.prefixes || []).some((p) => file.startsWith(p)) || (a.fragments || []).some((f) => file.includes(f)),
    );
    if (hit) counts.set(hit.name, (counts.get(hit.name) || 0) + 1);
  }
  let best = null;
  for (const a of map.areas) {
    if (counts.has(a.name) && (best === null || counts.get(a.name) > counts.get(best))) best = a.name;
  }
  return best;
}

/**
 * @param {{ number: number, draft: boolean, login: string, labels: string[], area: string | null }[]} prs
 *   every open PR.
 * @param {{ subject?: number, limit?: number }} [opts] With `subject`, only
 *   that PR may be drafted and every other counted PR holds its slot (an event
 *   run). Without it, PRs are ranked by number, lowest first (the hourly run).
 * @returns {{ number: number, action: 'keep' | 'draft', reason?: 'limit' | 'area', holders?: number[], area?: string | null }[]}
 */
export function decideQueue(prs, { subject, limit = QUEUE_LIMIT } = {}) {
  const counted = prs
    .filter((p) => !p.draft && !isDependabot(p.login) && !p.labels.includes(EXEMPT_LABEL))
    .sort((a, b) => a.number - b.number);
  const out = [];
  for (const pr of counted) {
    if (subject !== undefined && pr.number !== subject) continue;
    const holders = subject === undefined ? counted.filter((o) => o.number < pr.number) : counted.filter((o) => o.number !== pr.number);
    const sameArea = pr.area ? holders.filter((o) => o.area === pr.area) : [];
    if (sameArea.length > 0) {
      out.push({ number: pr.number, action: 'draft', reason: 'area', holders: [sameArea[0].number], area: pr.area });
    } else if (holders.length >= limit) {
      out.push({ number: pr.number, action: 'draft', reason: 'limit', holders: holders.slice(0, limit).map((o) => o.number) });
    } else {
      out.push({ number: pr.number, action: 'keep' });
    }
  }
  return out;
}

/** `drafted: false` is the wording when GitHub refused the conversion. */
export function commentFor(decision, { drafted = true } = {}) {
  const refs = decision.holders.map((n) => `#${n}`).join(', ');
  const why =
    decision.reason === 'area'
      ? `${refs} already holds the slot for the ${decision.area} area, and the rule is one open PR per area.`
      : `${QUEUE_LIMIT} PRs are already open (${refs}), and the rule is at most ${QUEUE_LIMIT}.`;
  return [
    drafted
      ? `Converted to draft by the queue guard. ${why}`
      : `The queue guard would convert this PR to draft, but GitHub refused the conversion, so it is still open. ${why} Please mark it as a draft by hand.`,
    '',
    'Mark this PR ready for review when a slot is free. The guard checks it again then. A maintainer can add the `queue-exempt` label to skip the guard, or an `area:<name>` label to correct the area.',
    'See AGENTS.md, "Keep the queue small".',
  ].join('\n');
}

const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { GH_TOKEN, GH_REPO, EVENT_NAME, PR } = process.env;
  if (!GH_TOKEN || !GH_REPO) {
    console.error('queue-guard: GH_TOKEN and GH_REPO are required.');
    return 2;
  }
  const map = JSON.parse(readFileSync(join(HERE, '..', '.github', 'queue-areas.json'), 'utf8'));
  const subject = EVENT_NAME === 'pull_request_target' && PR ? Number(PR) : undefined;
  const open = await getAll(GH_TOKEN, `/repos/${GH_REPO}/pulls?state=open`);
  const prs = [];
  for (const p of open) {
    const labels = p.labels.map((l) => l.name);
    const counted = !p.draft && !isDependabot(p.user.login) && !labels.includes(EXEMPT_LABEL);
    const files = counted && !labels.some((l) => l.startsWith('area:'))
      ? (await getAll(GH_TOKEN, `/repos/${GH_REPO}/pulls/${p.number}/files`, 30)).map((f) => f.filename)
      : [];
    prs.push({ number: p.number, nodeId: p.node_id, draft: p.draft, login: p.user.login, labels, area: areaOf({ labels, files }, map) });
  }
  const decisions = decideQueue(prs, { subject });
  const countedTotal = prs.filter((p) => !p.draft && !isDependabot(p.login) && !p.labels.includes(EXEMPT_LABEL)).length;
  console.log(`queue-guard: ${countedTotal} counted PRs, ${decisions.length} checked, ${decisions.filter((d) => d.action === 'draft').length} to draft.`);
  return enforce(decisions, prs, {
    draft: (nodeId) =>
      graphql(
        GH_TOKEN,
        'mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { number } } }',
        { id: nodeId },
      ),
    comment: (number, body) => post(GH_TOKEN, `/repos/${GH_REPO}/issues/${number}/comments`, { body }),
  });
}

/**
 * Applies the decisions. A refused draft conversion must not stop the comment
 * naming the PR that holds the slot: the comment is posted either way, the
 * wording says which happened, and the run exits 1 with one reason line.
 * @returns {Promise<number>} the exit code.
 */
export async function enforce(decisions, prs, { draft, comment }) {
  const refused = [];
  for (const d of decisions) {
    console.log(`  #${d.number}: ${d.action}${d.reason ? ` (${d.reason}, held by ${d.holders.join(', ')})` : ''}`);
    if (d.action !== 'draft') continue;
    const pr = prs.find((p) => p.number === d.number);
    let drafted = true;
    try {
      await draft(pr.nodeId);
    } catch (err) {
      drafted = false;
      refused.push(`#${d.number}: ${err.message}`);
    }
    await comment(d.number, commentFor(d, { drafted }));
  }
  if (refused.length > 0) {
    console.error(
      `queue-guard: GitHub refused convertPullRequestToDraft (${refused.join('; ')}). The comment was posted. Set the QUEUE_GUARD_TOKEN secret, see .github/workflows/queue-guard.yml.`,
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`queue-guard: ${err.message}`);
      process.exit(2);
    },
  );
}
