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

function load(options: { fetch?: (input: unknown) => Promise<unknown>; shell?: unknown; clients?: { url: string; navigate: (url: string) => Promise<unknown> }[]; keys?: string[] } = {}) {
  const listeners = new Map<string, Listener>();
  const calls = { skipWaiting: 0, unregistered: 0, put: [] as string[], deleted: [] as string[], fetched: [] as string[], fetchArgs: [] as unknown[][] };
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Listener) => { listeners.set(type, fn); },
    clients: { claim: async () => {}, matchAll: async () => options.clients ?? [] },
    registration: { unregister: async () => { calls.unregistered += 1; } },
    skipWaiting: () => { calls.skipWaiting += 1; },
  };
  const caches = {
    match: async () => options.shell,
    open: async () => ({ put: async (url: string) => { calls.put.push(url); } }),
    keys: async () => ['ifcsheet-precache-old', 'ifcsheet-runtime-old', 'ifcsheet-precache-v1', 'other-app-cache'],
    delete: async (name: string) => { calls.deleted.push(name); return true; },
  };
  const fetchStub = async (...args: unknown[]) => {
    calls.fetchArgs.push(args);
    calls.fetched.push((args[0] as { url: string }).url);
    return options.fetch ? options.fetch(args[0]) : new Response('x');
  };
  const source = template.replace("'__BUILD_VERSION__'", "'v1'").replace("'__PRECACHE_URLS__'", "['/', '/assets/a.js']");
  vm.runInNewContext(source, { self, Response, caches, URL, Request: class { constructor(readonly url: string, readonly init?: { cache?: string }) {} }, fetch: fetchStub, setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout, AbortController });
  return { listeners, calls };
}

type Worker = ReturnType<typeof load>;

function dispatch({ listeners }: Worker, url: string, init: { method?: string; mode?: string } = {}, onAnswer?: (answer: Promise<unknown>) => void): boolean {
  let handled = false;
  const request = { method: init.method ?? 'GET', mode: init.mode ?? 'cors', url, clone: () => request };
  listeners.get('fetch')!({ request, respondWith: (answer: Promise<unknown>) => { handled = true; answer.catch(() => {}); onAnswer?.(answer); } });
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

  it('fetches a navigation as the browser made it, with no init that would turn it into a non-navigation request', async () => {
    const worker = load();
    let answer: Promise<unknown> = Promise.resolve();
    dispatch(worker, 'https://app.test/project', { mode: 'navigate' }, (a) => { answer = a; });
    await answer;
    assert.equal(worker.calls.fetchArgs.length, 1);
    assert.equal(worker.calls.fetchArgs[0].length, 1, 'fetch(request, init) re-issues a navigation as mode "same-origin"');
    assert.equal((worker.calls.fetchArgs[0][0] as { mode: string }).mode, 'navigate');
  });

  it('falls back to the cached shell when the navigation does not answer in time', async () => {
    const shell = { cached: true };
    const worker = load({ fetch: () => new Promise(() => {}), shell });
    let answer: Promise<unknown> = Promise.resolve();
    dispatch(worker, 'https://app.test/project', { mode: 'navigate' }, (a) => { answer = a; });
    assert.equal(await answer, shell);
  });

  it('revalidates instead of re-downloading what the visit already fetched', async () => {
    const worker = load();
    await lifecycle(worker, 'install');
    for (const [request] of worker.calls.fetchArgs) assert.equal((request as { init?: { cache?: string } }).init?.cache, 'no-cache');
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

  const control = (body: string, ok = true) => (input: unknown) =>
    (input as { url: string }).url === '/sw-control.json' ? Promise.resolve(new Response(body, { status: ok ? 200 : 404 })) : Promise.resolve(new Response('x'));

  it('kill switch: disabled true deletes its caches, unregisters and reloads its tabs', async () => {
    const navigated: string[] = [];
    const clients = [{ url: 'https://app.test/p', navigate: async (u: string) => { navigated.push(u); } }];
    const worker = load({ fetch: control('{"disabled": true}'), clients });
    await lifecycle(worker, 'activate');
    assert.deepEqual([...new Set(worker.calls.deleted)].sort(), ['ifcsheet-precache-old', 'ifcsheet-precache-v1', 'ifcsheet-runtime-old']);
    assert.equal(worker.calls.unregistered, 1);
    assert.deepEqual(navigated, ['https://app.test/p']);
  });

  it('kill switch: the page-driven CHECK_CONTROL message also switches it off', async () => {
    const worker = load({ fetch: control('{"disabled":true}') });
    let work: Promise<unknown> = Promise.resolve();
    worker.listeners.get('message')!({ data: { type: 'CHECK_CONTROL' }, waitUntil: (p: Promise<unknown>) => { work = p; } });
    await work;
    assert.equal(worker.calls.unregistered, 1);
  });

  it('kill switch: disabled false, a missing file or garbage leaves the worker running', async () => {
    for (const fetcher of [control('{"disabled": false}'), control('', false), control('not json'), () => Promise.reject(new Error('offline'))]) {
      const worker = load({ fetch: fetcher });
      await lifecycle(worker, 'activate');
      assert.equal(worker.calls.unregistered, 0);
      assert.deepEqual(worker.calls.deleted.sort(), ['ifcsheet-precache-old', 'ifcsheet-runtime-old']);
    }
  });

  it('reads the control file without the HTTP cache', async () => {
    const worker = load({ fetch: control('{"disabled": false}') });
    await lifecycle(worker, 'activate');
    const request = worker.calls.fetchArgs.map((a) => a[0] as { url: string; init?: { cache?: string } }).find((r) => r.url === '/sw-control.json');
    assert.equal(request?.init?.cache, 'no-store');
  });

  it('offline /mcp navigation gets a notice, never the app shell', async () => {
    const worker = load({ fetch: () => Promise.reject(new Error('offline')), shell: { cached: true } });
    for (const path of ['/mcp', '/mcp/docs']) {
      let answer: Promise<unknown> = Promise.resolve();
      dispatch(worker, 'https://app.test' + path, { mode: 'navigate' }, (a) => { answer = a; });
      const response = (await answer) as Response;
      assert.equal(response.status, 503);
    }
  });
});
