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
      // The new worker takes over, then the page reloads onto its shell.
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
  });
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
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(watch).catch((error) => {
      console.warn('[offline] service worker not registered', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
