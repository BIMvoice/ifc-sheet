/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The language choice made from the UI (#53). `locales.boot.ts` owns the
 * discovered locale files and hands the activator over here, so a component
 * can list and switch languages without importing the Vite-only boot module.
 * A choice is remembered under the same key `?lang=` uses
 * (`LOCALE_STORAGE_KEY`), so it is read back by the startup negotiation on
 * the next load: one persistence path.
 */
import { storeLocale, type LocaleActivator, type LocaleEnvironment } from './locale-activation';
import { negotiateLocale } from './negotiate-locale';
import { getLocale, type Locale } from './registry';

let provided: { activator: LocaleActivator; storage: LocaleEnvironment['storage'] } | null = null;

export function provideLocaleActivator(activator: LocaleActivator, storage: LocaleEnvironment['storage']): void {
  provided = { activator, storage };
}

/** English first, then every locale file shipped; just English before boot. */
export function availableLocales(): readonly Locale[] {
  return provided?.activator.available ?? ['en'];
}

/** Switch the interface language and remember the choice. Resolves to the locale now active. */
export async function chooseLocale(tag: Locale): Promise<Locale> {
  if (!provided) return getLocale();
  const active = await provided.activator.activate([tag]);
  if (negotiateLocale([tag], provided.activator.available) === active) storeLocale(provided.storage, active);
  return active;
}
