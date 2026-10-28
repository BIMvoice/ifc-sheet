/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Registers the offline service worker (`sw.js`, written by the build:
 * `vite-plugins/offline-sw.ts`) and offers an update when a new one is waiting
 * (#456).
 *
 * Only in a production build: the dev server serves modules the worker would
 * cache and serve stale. A worker that is already running keeps serving until
 * the user accepts "Update available — reload" (or closes every tab), so a
 * deploy never swaps the shell under a session that is part-way through
 * loading chunks of the old one.
 */

import { toast } from '@/components/ui/toast';
import { resolve } from '@/i18n/registry';
import { listenForInstallPrompt } from './install-prompt';

function offerUpdate(waiting: ServiceWorker): void {
  toast.infoLive(() => resolve('offline.updateAvailable'), {
    label: () => resolve('offline.updateReload'),
    onClick: () => {
      // The new worker takes over; `controllerchange` (listened for in every
      // tab, see reloadOnTakeover) reloads this tab and the others.
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
  });
}

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Every tab reloads once when a new worker takes over from an existing one,
 *  so the other tabs do not keep running old chunks against a deleted cache. */
function reloadOnTakeover(): void {
  if (!navigator.serviceWorker.controller) return; // first install: nothing to reload
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/** Long-open tabs learn about new deploys, and the worker re-reads its kill switch. */
function checkPeriodically(registration: ServiceWorkerRegistration): void {
  const check = () => {
    registration.update().catch(() => {});
    registration.active?.postMessage({ type: 'CHECK_CONTROL' });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.setInterval(check, UPDATE_CHECK_MS);
}

function watch(registration: ServiceWorkerRegistration): void {
  // `controller` is null on the very first install: that is not an update.
  const update = (worker: ServiceWorker | null) => { if (worker && navigator.serviceWorker.controller) offerUpdate(worker); };
  update(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => { if (installing.state === 'installed') update(installing); });
  });
}

export function registerOfflineApp(): void {
  if (typeof window === 'undefined') return;
  listenForInstallPrompt();
  if (!import.meta.env?.PROD || !('serviceWorker' in navigator)) return;
  reloadOnTakeover();
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => { watch(registration); checkPeriodically(registration); registration.active?.postMessage({ type: 'CHECK_CONTROL' }); }).catch((error) => {
      console.warn('[offline] service worker not registered', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
