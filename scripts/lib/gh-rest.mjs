/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * A small GitHub REST and GraphQL client for the queue gates: the workflow's
 * own token, node's fetch, no dependencies. Every failure throws, so a gate
 * never passes over data it did not read.
 */

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'ifcsheet-queue-gates',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** GET a list endpoint, following pages, up to `maxPages` (100 items each). */
export async function getAll(token, path, maxPages = 10) {
  const sep = path.includes('?') ? '&' : '?';
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await call(token, 'GET', `${path}${sep}per_page=100&page=${page}`);
    items.push(...chunk);
    if (chunk.length < 100) return items;
  }
  throw new Error(`${path} has more than ${maxPages * 100} items; refusing to decide on a partial read`);
}

export const post = (token, path, body) => call(token, 'POST', path, body);

export async function graphql(token, query, variables) {
  const out = await call(token, 'POST', '/graphql', { query, variables });
  if (out.errors?.length) throw new Error(`GitHub GraphQL: ${JSON.stringify(out.errors).slice(0, 300)}`);
  return out.data;
}
