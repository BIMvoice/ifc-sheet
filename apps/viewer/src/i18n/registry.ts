/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Locale registry (#4785). English ships in-tree as the only locale and
 * the default; other locales register here as a `Partial<Catalogue>`
 * overlay — nothing in this module or in `useTranslation` requires a
 * locale to cover every key.
 *
 * This is a plain module-level store (subscribe/getSnapshot,
 * `useSyncExternalStore`-shaped) rather than a slice on the main viewer
 * store: the locale is UI chrome, not model or scene state, and keeping
 * it separate means converting a component to translated strings never
 * has to touch the (already large) viewer store.
 */
import { setNameResolver } from '@bimvoice/ifcsheet/names';
import { appName } from '../edition';
import { en, type TranslationKey } from './en';
import { formatLocaleNumber } from './intlFormat';
import type { PluralTranslation, TranslationParameters, TranslationValue } from './types';

export type Locale = string;
export type Catalogue = Partial<Record<TranslationKey, TranslationValue>>;

const catalogues = new Map<Locale, Catalogue>([['en', en]]);
let activeLocale: Locale = 'en';
let revision = 0;
const listeners = new Set<() => void>();

function notifyLocaleChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/** Register (or replace) the catalogue for a locale. English cannot be replaced. */
export function registerLocale(locale: Locale, catalogue: Catalogue): void {
  if (locale === 'en') {
    throw new Error('the "en" catalogue is the fallback and cannot be overridden');
  }
  catalogues.set(locale, catalogue);
  if (locale === activeLocale) notifyLocaleChanged();
}

/** Names catalogues of every shipped locale, loaded or not (`locales.boot.ts`). */
const readBackCatalogues: Catalogue[] = [];

/**
 * Keep a locale's `names.*` strings for reading back, without making the
 * locale available. A project made in Romanian and opened in English still
 * has to read `Secțiunea A-A` as mark A, before (or without) the Romanian
 * catalogue ever loading.
 */
export function registerReadBackNames(catalogue: Catalogue): void {
  readBackCatalogues.push(catalogue);
}

/** The string every registered or read-back catalogue gives a key, English
 * first, duplicates dropped. A catalogue that leaves the key out adds
 * nothing; plural forms are skipped. For reading back text that was
 * resolved in whichever language was active when it was made. */
export function registeredTranslations(key: TranslationKey): string[] {
  const out = new Set<string>();
  for (const catalogue of [...catalogues.values(), ...readBackCatalogues]) {
    const value = catalogue[key];
    if (typeof value === 'string') out.add(value);
  }
  return [...out];
}

/** Switch the active locale. Falls back to 'en' if the locale was never registered. */
export function setLocale(locale: Locale): void {
  activeLocale = catalogues.has(locale) ? locale : 'en';
  notifyLocaleChanged();
}

export function getLocale(): Locale {
  return activeLocale;
}

/** Whether the active locale owns a message instead of using English fallback. */
export function hasActiveTranslation(key: TranslationKey): boolean {
  return Object.hasOwn(catalogues.get(activeLocale) ?? {}, key);
}

/** Snapshot identity for `useSyncExternalStore`. The revision changes when an
 * active catalogue is replaced even though the locale name stays the same. */
export function getLocaleSnapshot(): string {
  return `${activeLocale}:${revision}`;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolve one key against the active locale, falling back to English when
 * the active catalogue does not have the key. A registered locale that
 * explicitly maps a key to `''` gets that empty string back — only an
 * *absent* key (not an empty translation) falls back, so a missing
 * translation is never silently indistinguishable from a deliberately
 * blank one.
 */
export function selectPluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale, { maximumSignificantDigits: 21 }).select(count);
  } catch (error) {
    console.warn(`[i18n] Invalid locale "${locale}" for plural rules; using English.`, error);
    return new Intl.PluralRules('en', { maximumSignificantDigits: 21 }).select(count);
  }
}

function pluralForm(value: PluralTranslation, params: TranslationParameters, locale: Locale): string {
  if (!Object.hasOwn(value, 'other')) {
    throw new Error('a plural translation must define its own "other" form');
  }
  const fallback = value.other;
  const count = Object.hasOwn(params, 'count') ? params.count : undefined;
  if (typeof count !== 'number') return fallback;
  const category = selectPluralCategory(locale, count);
  const selected = Object.hasOwn(value, category) ? value[category] : undefined;
  return selected ?? fallback;
}

function interpolate(template: string, params: TranslationParameters): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
    // `{app}`: the product name of the running edition, unless the caller passes one.
    const value = Object.hasOwn(params, name) ? params[name] : name === 'app' ? appName() : undefined;
    return value === undefined ? placeholder : String(value);
  });
}

function resolveFromCatalogue(key: TranslationKey, params: TranslationParameters, locale: Locale, catalogue: Catalogue | undefined): string {
  const value = catalogue?.[key];
  const resolved = value !== undefined ? value : en[key];
  const template = typeof resolved === 'string' ? resolved : pluralForm(resolved, params, value !== undefined ? locale : 'en');
  return interpolate(template, params);
}

export function resolve(key: TranslationKey, params: TranslationParameters = {}): string {
  return resolveFromCatalogue(key, params, activeLocale, catalogues.get(activeLocale));
}

// The drawing-set engine names what it makes (the starting set's sheets, the default views) in the active language.
// `@bimvoice/ifcsheet/names` imports nothing, so the catalogue does not load the engine to install it.
setNameResolver((key, params) => resolve(key, params));

/** Freeze a label context for an asynchronous document layout/export (#6610).
 * Locale or catalogue replacement must not mix languages halfway through a PDF. */
export function captureTranslation(): typeof resolve & { readonly formatNumber: (value: number) => string } {
  const locale = activeLocale;
  const catalogue = { ...catalogues.get(locale) };
  for (const key of Object.keys(catalogue) as TranslationKey[]) {
    const value = catalogue[key];
    if (value !== undefined && typeof value !== 'string') catalogue[key] = { ...value };
  }
  const formatter: typeof resolve = (key, params = {}) => resolveFromCatalogue(key, params, locale, catalogue);
  return Object.assign(formatter, { formatNumber: (value: number) => formatLocaleNumber(locale, value) });
}

/** Resolve directly from the canonical English catalogue, bypassing an active
 * partial locale. Use when the caller has already determined that a compound
 * message must fall back as one English unit rather than key-by-key. */
export function resolveEnglish(key: TranslationKey, params: TranslationParameters = {}): string {
  const value = en[key];
  const template = typeof value === 'string' ? value : pluralForm(value, params, 'en');
  return interpolate(template, params);
}
