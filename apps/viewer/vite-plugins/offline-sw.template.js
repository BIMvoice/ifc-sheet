/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/*
 * IfcSheet offline service worker (#456). This is a TEMPLATE: the build
 * (`vite-plugins/offline-sw.ts`) replaces the two quoted placeholders below
 * and writes the result to `sw.js`. It is plain JS because it runs outside the
 * bundle.
 *
 * - Install: cache the app shell, wasm engine, chunks, fonts and demo project
 *   (the list comes from the build's own file list). It does NOT skip waiting:
 *   a new version waits until the page offers "Update available" and the user
 *   accepts (message SKIP_WAITING), or until every tab of the old one closes.
 * - Fetch: GET only, same origin only. /api/*, /oauth/* and the /mcp protocol
 *   requests (POST, event stream) are never answered here. Page navigations go
 *   to the network first (so a deploy is seen at once) and fall back to the
 *   cached shell; files go to the cache first. A hashed chunk the install did
 *   not list is cached on first use.
 * - Cache names carry the build hash, and activation deletes the older ones.
 */

const VERSION = '__BUILD_VERSION__';
const URLS = '__PRECACHE_URLS__';
const PREFIX = 'ifcsheet-';
const PRECACHE = `${PREFIX}precache-${VERSION}`;
const RUNTIME = `${PREFIX}runtime-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 4000;
const RUNTIME_CACHEABLE = /^\/(assets|fonts)\/.+\.(js|mjs|css|wasm|ttf|woff2?)$/i;
const NEVER = /^\/(api|oauth)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(PRECACHE);
  const queue = [...URLS];
  const worker = async () => {
    // 'no-cache' revalidates what the visit already downloaded (a 304 for an
    // unchanged file) instead of downloading the whole list a second time.
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const response = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
      await cache.put(url, response);
    }
  };
  // A failure rejects the install; the browser retries on the next load.
  await Promise.all([worker(), worker(), worker(), worker()]);
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE, RUNTIME]);
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname) || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (url.pathname !== '/mcp' && !url.pathname.startsWith('/mcp/')) {
    event.respondWith(fromCache(request, url));
  }
});

// The navigation is fetched as the browser made it: `fetch(request)`, no init.
// `fetch(request, init)` with any init turns a "navigate" request into a
// "same-origin" one, and Vercel Skew Protection routes only real navigations
// to the latest deployment; anything else follows the `__vdpl` cookie, so the
// page would keep coming from the deployment the cookie names. The timeout is
// a race, not an abort, for the same reason.
async function navigate(request) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('navigation timed out')), NAVIGATION_TIMEOUT_MS);
    });
    return await Promise.race([fetch(request), timeout]);
  } catch (error) {
    const shell = await caches.match('/', { cacheName: PRECACHE });
    if (shell) return shell;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCache(request, url) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200 && RUNTIME_CACHEABLE.test(url.pathname)) {
    const copy = response.clone();
    caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
}
