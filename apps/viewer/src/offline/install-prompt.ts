/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The browser's install prompt, held until the user asks for it (#456).
 *
 * Chromium fires `beforeinstallprompt` once, early, when the page qualifies
 * (manifest, icons, service worker). We keep the event and show an "Install"
 * entry in the Info dialog; clicking it calls `prompt()`. Browsers that never
 * fire the event (Firefox, Safari) leave `canInstall` false and the entry is
 * not shown: there is nothing for it to do there.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** The browser offered the prompt and it has not been used. */
  canInstall: boolean;
  /** Running as an installed app, or the user just accepted. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canInstall: false, installed: false };
let listening = false;
const listeners = new Set<() => void>();

function set(next: InstallState): void {
  state = next;
  for (const listener of listeners) listener();
}

function runningInstalled(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

/** Start listening for the prompt. Idempotent; call once at boot. */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  if (runningInstalled()) set({ canInstall: false, installed: true });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canInstall: true, installed: false });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false, installed: true });
  });
}

/** Show the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  set({ canInstall: false, installed: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') set({ canInstall: false, installed: true });
  return outcome === 'accepted';
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getInstallState(): InstallState {
  return state;
}
