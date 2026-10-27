/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The service worker template (#456) is plain JS the build fills in. These
 * run its fetch handler against stand-ins for the worker globals: it must
 * leave `/api/*`, non-GET requests and other origins to the network, and it
 * must never write a page navigation into the cache.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const template = readFileSync(new URL('../../vite-plugins/offline-sw.template.js', import.meta.url), 'utf8');

type Listener = (event: unknown) => void;

function load() {
  const listeners = new Map<string, Listener>();
  const calls = { skipWaiting: 0, put: [] as string[], deleted: [] as string[], fetched: [] as string[] };
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Listener) => { listeners.set(type, fn); },
    clients: { claim: async () => {} },
    skipWaiting: () => { calls.skipWaiting += 1; },
  };
  const caches = {
    match: async () => undefined,
    open: async () => ({ put: async (url: string) => { calls.put.push(url); } }),
    keys: async () => ['ifcsheet-precache-old', 'ifcsheet-runtime-old', 'ifcsheet-precache-v1', 'other-app-cache'],
    delete: async (name: string) => { calls.deleted.push(name); return true; },
  };
  const fetchStub = async (input: { url: string }) => { calls.fetched.push(input.url); return new Response('x'); };
  const source = template.replace("'__BUILD_VERSION__'", "'v1'").replace("'__PRECACHE_URLS__'", "['/', '/assets/a.js']");
  vm.runInNewContext(source, { self, caches, URL, Request: class { constructor(readonly url: string) {} }, fetch: fetchStub, setTimeout, clearTimeout, AbortController });
  return { listeners, calls };
}

type Worker = ReturnType<typeof load>;

function dispatch({ listeners }: Worker, url: string, init: { method?: string; mode?: string } = {}): boolean {
  let handled = false;
  const request = { method: init.method ?? 'GET', mode: init.mode ?? 'cors', url, clone: () => request };
  listeners.get('fetch')!({ request, respondWith: (answer: Promise<unknown>) => { handled = true; answer.catch(() => {}); } });
  return handled;
}

async function lifecycle({ listeners }: Worker, type: 'install' | 'activate'): Promise<void> {
  let work: Promise<unknown> = Promise.resolve();
  listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
  await work;
}

describe('offline service worker template (#456)', () => {
  it('does not answer /api, /oauth, the MCP protocol, other origins or non-GET requests', () => {
    const worker = load();
    assert.equal(dispatch(worker, 'https://app.test/api/mcp'), false);
    assert.equal(dispatch(worker, 'https://app.test/api/dalux?path=x'), false);
    assert.equal(dispatch(worker, 'https://app.test/oauth/autodesk/callback', { mode: 'navigate' }), false);
    assert.equal(dispatch(worker, 'https://app.test/mcp'), false);
    assert.equal(dispatch(worker, 'https://app.test/assets/a.js', { method: 'POST' }), false);
    assert.equal(dispatch(worker, 'https://api.bsdd.buildingsmart.org/x'), false);
    assert.equal(dispatch(worker, 'https://app.test/sw.js'), false);
  });

  it('answers app files and page navigations', () => {
    const worker = load();
    assert.equal(dispatch(worker, 'https://app.test/assets/a.js'), true);
    assert.equal(dispatch(worker, 'https://app.test/', { mode: 'navigate' }), true);
  });

  it('installs by caching every listed file, and does not skip waiting: a new version waits for the user', async () => {
    const worker = load();
    await lifecycle(worker, 'install');
    assert.deepEqual(worker.calls.put.sort(), ['/', '/assets/a.js']);
    assert.equal(worker.calls.skipWaiting, 0);
  });

  it('skips waiting only when the page asks', () => {
    const worker = load();
    worker.listeners.get('message')!({ data: { type: 'SOMETHING_ELSE' } });
    assert.equal(worker.calls.skipWaiting, 0);
    worker.listeners.get('message')!({ data: { type: 'SKIP_WAITING' } });
    assert.equal(worker.calls.skipWaiting, 1);
  });

  it('on activation deletes its own older caches and nobody else\'s', async () => {
    const worker = load();
    await lifecycle(worker, 'activate');
    assert.deepEqual(worker.calls.deleted.sort(), ['ifcsheet-precache-old', 'ifcsheet-runtime-old']);
  });
});
