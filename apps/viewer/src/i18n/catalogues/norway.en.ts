/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/**
 * The Norwegian permit drawings (byggesak, SAK10 § 5-4): the checklist and the sheets of the set (#372). The Norwegian terms
 * are the ones the DiBK pages use (situasjonsplan, målsatt, terrenglinjer, hovedmål); the rest is English.
 */
export const norwayEn = {
  'norway.title': 'Norway (byggesak)',
  'norway.switch': 'Norge (byggesak)',
  'norway.intro': 'The drawings of a Norwegian building application, SAK10 § 5-4: "tegninger og målsatt situasjonsplan". Each item says where it comes from. Items marked unverified are not stated by the official pages read.',
  'norway.set.name': 'Norway (byggesak)',
  'norway.set.plans': 'Floor plans (plantegninger)',
  'norway.set.sections': 'Sections (snitt)',
  'norway.set.facades': 'Facades (fasadetegninger)',
  'norway.set.site': 'Site plan (situasjonsplan)',
  'norway.set.siteScale': 'Scale 1:500 is usual; the regulation sets none.',
  'norway.set.siteToAdd': 'Plot, distances and terrain must be drawn in (tomt, avstander og terreng), with a north arrow and a scale bar.',
  'norway.item.plans': 'Floor plans of all floors, at 1:100',
  'norway.item.roomUse': 'Room sizes and the intended use of each room on the plans',
  'norway.item.sections': 'Lengthwise and crosswise sections, at 1:100',
  'norway.item.floorHeights': 'The height of each floor on the sections',
  'norway.item.facades': 'Facades of all sides, at 1:100',
  'norway.item.facadeTerrain': 'The terrain around the building before and after the work, on the facades',
  'norway.item.mainDimensions': 'Main dimensions (hovedmål) on plans and sections',
  'norway.item.sitePlan': 'Site plan sheet (målsatt situasjonsplan), the ground-floor cut only: dimension it from the municipality\'s situasjonskart',
  'norway.item.siteDistances': 'On the site plan: shortest distance to the property boundary, the road centreline, the nearest building on the property and the nearest neighbouring building',
  'norway.item.terrainLines': 'New terrain lines (nye terrenglinjer) on the site plan',
  'norway.item.neighbourNotice': 'Site plan, sections and facades attached to the neighbour notification',
  'norway.item.eaveRidgeHeights': 'Eave and ridge height marked on sections and facades',
  'norway.source': 'Source: {source}',
  'norway.read': 'Read in the official text',
  'norway.unverified': 'Unverified',
  'norway.scale': 'Drawn at 1:{scale}',
  'norway.scaleUnverified': 'Drawn at 1:{scale}; the scale is unverified',
  'norway.drawn': 'Drawn from the model',
  'norway.supply': 'To add',
  'norway.missingLevels': 'No plan on a sheet for: {list}',
  'norway.siteNote': 'The site plan scale is not set in the regulation text read; 1:500 is the usual one and is a default here, not a rule. Municipalities may ask for more.',
  'norway.useSet': 'Use the Norway sheets for a new project',
} as const satisfies Record<string, TranslationValue>;
