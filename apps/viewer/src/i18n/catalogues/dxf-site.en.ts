/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A surveyor's DXF placed under a site plan by the model's georeference (#182). */
export const dxfSiteEn = {
  'dxfSite.place': 'Place by the model georeference',
  'dxfSite.placed': "The DXF is placed by the model's map conversion.",
  'dxfSite.noGeoref': 'The model has no usable map conversion. Align the DXF by two points instead.',
  'dxfSite.locked': 'The DXF is locked. Unlock it to place it.',
} as const satisfies Record<string, TranslationValue>;
