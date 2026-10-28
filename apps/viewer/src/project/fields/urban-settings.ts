/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UrbanSettings } from '@/urban/indicators';
import { readUrbanSettings } from '../project-read';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The urban indicators' terrain level, ±0.00 and the storeys left out of Ad for CUT (`urban/indicators.ts`). */
    urbanSettings?: UrbanSettings;
  }
}

export const urbanSettingsField = optionalField('urbanSettings', (raw) => readUrbanSettings(raw.urbanSettings));
