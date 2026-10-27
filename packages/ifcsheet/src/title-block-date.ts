/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The date a title block prints, per the project's language. The project keeps the date as typed or seeded
 * (`2026-10-27`); Romanian drawings write it dd.mm.yyyy. One formatter, used by the app's sheets and the engine's PDF
 * (`fieldBuiltins`), so the screen and the paper cannot disagree.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `value` as the language writes it: Romanian turns an ISO date into dd.mm.yyyy; every other language, and any text that is not an ISO date (a date typed by hand), is printed as it is. */
export function formatTitleBlockDate(value: string, language: string | undefined): string {
  if (!language || language.toLowerCase().split('-')[0] !== 'ro') return value;
  const m = ISO_DATE.exec(value.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}
