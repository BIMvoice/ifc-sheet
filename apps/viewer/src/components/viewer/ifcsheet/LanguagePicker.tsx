/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The interface language, chosen from IfcSheet's header and remembered on
 * this browser. Each language is named in itself ("Română"), whatever the
 * language now showing, so a person can always find their own.
 */

import { availableLocales, chooseLocale, useTranslation } from '@/i18n';

function endonym(tag: string): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
    return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
  } catch {
    return tag;
  }
}

export function LanguagePicker() {
  const { t, locale } = useTranslation();
  const locales = availableLocales();
  if (locales.length < 2) return null;
  return (
    <select
      aria-label={t('wall.shell.language')}
      value={locale}
      onChange={(e) => void chooseLocale(e.target.value)}
      className="rounded-full border border-sky-300/30 bg-transparent px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70"
    >
      {locales.map((tag) => <option key={tag} value={tag} className="bg-[#061a36]">{endonym(tag)}</option>)}
    </select>
  );
}
