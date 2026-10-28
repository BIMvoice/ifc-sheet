/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prints, as JSON, every English catalogue key that has no entry in the
 * Romanian catalogue the app actually serves. Run under tsx by
 * `scripts/check-ro-coverage.mjs`; both sides are the REAL merged catalogues
 * (the `*.en.ts` / `*.ro.ts` barrels, with the engine tables they spread:
 * ENGINE_NAMES_*, SET_TEMPLATE_*), not a text scan of the files.
 */
import { en } from '../../apps/viewer/src/i18n/en';
import ro from '../../apps/viewer/src/i18n/locales/ro';

const have = new Set(Object.keys(ro));
const missing = Object.keys(en)
  .filter((key) => !have.has(key))
  .sort();
process.stdout.write(JSON.stringify({ total: Object.keys(en).length, missing }));
