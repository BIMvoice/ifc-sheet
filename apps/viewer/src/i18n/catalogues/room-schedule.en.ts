/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The room and area schedule (#42): the table on the sheet, its notes, and the button that adds it. */
export const roomScheduleEn = {
  'roomSched.newName': 'Room and area schedule',
  'roomSched.add': '+ Room and area schedule',
  'roomSched.number': 'No.',
  'roomSched.room': 'Room',
  'roomSched.area': 'Useful area m²',
  'roomSched.levelTotal': 'Total {level}',
  'roomSched.total': 'Total building (Au)',
  'roomSched.noLevel': 'No level',
  'roomSched.empty': 'The loaded models have no rooms (IfcSpace).',
  'roomSched.note.source': 'Area: the model\'s NetFloorArea, else GrossFloorArea (Qto_SpaceBaseQuantities, else any quantity set). The building total is Au on the urban indicators sheet: the same rooms, the same areas.',
  'roomSched.note.geometry': '* Estimated area: the model states no NetFloorArea or GrossFloorArea for this room, so the footprint of its geometry is used ({count} rooms).',
  'roomSched.note.none': '{count} rooms have no area (the model states none and they have no geometry); they are listed and not in the totals.',
  'roomSched.note.leftOut': 'Left out: {external} external (balconies, terraces), {gfa} area-scheme (GFA), {parents} split into rooms of their own.',
  'ready.estimatedAreas.go': 'Go to the first room',
  'urban.rule.auEstimated': 'Au includes {count} rooms whose area the model does not state: they are measured from their geometry (≈ {area} m², {share} % of Au) and may be wrong under sloped ceilings: {list}.',
} as const satisfies Record<string, TranslationValue>;
