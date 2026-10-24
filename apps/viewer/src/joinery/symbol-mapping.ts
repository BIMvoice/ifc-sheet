/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbol mapping: which configurator entry draws a door or window that the model does not type itself.
 * The rules live in the engine (`@bimvoice/ifcsheet`, `joinery-mapping.ts`), so the headless `ifcsheet check --project`
 * matches an element exactly as the app does; this re-exports them for the app's imports.
 */

export {
  DEFAULT_JOINERY_MAPPING, fitToElement, normaliseName, readJoineryMapping, resolveMapping,
  type ElementFacts, type JoineryMapping, type MappingMatch, type MappingSource,
} from '@bimvoice/ifcsheet';
