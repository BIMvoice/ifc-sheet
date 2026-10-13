/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a new sheet's title block starts from: the first sheet's or the model's values, the project's own defaults over them (`check/fill.ts` sets them). */
export const withDefaults = (start: Record<string, string>, defaults: Readonly<Record<string, string>> | undefined): Record<string, string> => ({
  ...start,
  ...Object.fromEntries(Object.entries(defaults ?? {}).filter(([, v]) => v.trim() !== '')),
});
