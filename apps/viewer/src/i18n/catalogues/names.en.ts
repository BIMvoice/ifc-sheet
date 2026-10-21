/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/**
 * Names the app gives things it creates: the starting set's sheets, the
 * default views, a section or a detail, an untitled project. Resolved once,
 * when the item is created, and stored as plain text: a stored name is never
 * translated again, so a project made in one language reads the same in
 * another.
 */
export const namesEn = {
  'names.project.untitled': 'Untitled project',
  'names.sheet.plans': 'Floor plans',
  'names.sheet.plansN': 'Floor plans {n}',
  'names.sheet.elevations': 'Elevations',
  'names.sheet.interiors': 'Interior elevations',
  'names.sheet.elevationsSouthNorth': 'Elevations, south and north',
  'names.sheet.elevationsEastWest': 'Elevations, east and west',
  'names.sheet.sections': 'Sections',
  'names.sheet.sectionsN': 'Sections {n}',
  'names.sheet.schedules': 'Schedules',
  'names.view.plan': 'Plan',
  'names.view.north': 'North Elevation',
  'names.view.east': 'East Elevation',
  'names.view.south': 'South Elevation',
  'names.view.west': 'West Elevation',
  'names.view.section': 'Section {mark}-{mark}',
  'names.view.detail': 'Detail {number} - {source}',
} as const satisfies Record<string, TranslationValue>;
