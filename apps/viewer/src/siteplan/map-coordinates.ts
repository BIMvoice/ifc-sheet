/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A drawing point's Easting and Northing on the map: the engine's one chain (`packages/ifcsheet/src/georef/map-coordinates.ts`), which the PDF of `ifcsheet build` reads too. */

export { drawingPointToMap, type MapAnchor, type MapPoint } from '@bimvoice/ifcsheet/georef';
export { drawingPointToLocal } from '@bimvoice/ifcsheet';
