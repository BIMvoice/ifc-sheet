/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The heading of the legend of a view's colours (#92): the title the user wrote in the scheme, else the readable name of the
 * attribute (`LongName` → "Room name", in the app's language), else the property's own name (`Pset_SpaceCommon.Category` →
 * `Category`). One function for the card, the legend on screen and the legend on the sheet.
 */

import { schemeTitle, type ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';

export function schemeHeading(scheme: Pick<ColourScheme, 'property' | 'title'>, attribute?: (name: string) => string | undefined): string {
  return scheme.title?.trim() || attribute?.(scheme.property) || schemeTitle(scheme.property);
}
