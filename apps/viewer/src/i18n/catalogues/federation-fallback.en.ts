/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A model placed by its map conversion because its CRS had no projection definition. */
export const federationFallbackEn = {
  'properties.federationAlignment.mapConversion': 'Placed by map conversion only (no CRS definition)',
} as const satisfies Record<string, TranslationValue>;
