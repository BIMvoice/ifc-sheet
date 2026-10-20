/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The label types TAGALL draws with, and what a run did. */

import type { AnnotationType } from '@/catalogue/types';

export const MARK_TYPE_ID = 'tagall-mark';
export const ROOM_TYPE_ID = 'tagall-room';

/** The model's quantities a room's area is read from, first that has a value; then the footprint (`{Computed.Area}`). */
export const AREA_FIELDS = ['Qto_SpaceBaseQuantities.NetFloorArea', 'BaseQuantities.NetFloorArea', 'Qto_SpaceBaseQuantities.GrossFloorArea', 'BaseQuantities.GrossFloorArea'] as const;

const AREA_LINE = `{${[...AREA_FIELDS, 'Computed.Area'].join(' ?? ')}:0.00} m²`;
/** The room label: the tag name (the office's sources for it; by default the long name, else the Name), then the area. */
export const ROOM_TEMPLATE = `{TagName}\\n${AREA_LINE}`;
/** What the room label said before the tag name could be mapped; a project that still has it exactly takes the new one. */
export const LEGACY_ROOM_TEMPLATE = `{LongName ?? Name}\\n${AREA_LINE}`;

/**
 * The label types of TAGALL, ordinary label types the Standards dialog lists and edits: a door or window shows its
 * Tag (unless that is only the element's unique id), else its Name; a room shows its long name (else its Name) and its area.
 */
export const TAGALL_TYPES: readonly AnnotationType[] = [
  { id: MARK_TYPE_ID, name: 'Door and window mark', tool: 'label', label: { template: '{Mark ?? Name}', frame: 'box', missing: 'empty' } },
  { id: ROOM_TYPE_ID, name: 'Room name and area', tool: 'label', label: { template: ROOM_TEMPLATE, missing: 'empty', leader: 'never' } },
];

/** The types with a room label the office never changed taken to the template that reads the tag name; the same array when none is. */
export function upgradeTagAllTypes(types: AnnotationType[]): AnnotationType[] {
  if (!types.some((t) => t.id === ROOM_TYPE_ID && t.label?.template === LEGACY_ROOM_TEMPLATE)) return types;
  return types.map((t) => (t.id === ROOM_TYPE_ID && t.label?.template === LEGACY_ROOM_TEMPLATE ? { ...t, label: { ...t.label, template: ROOM_TEMPLATE } } : t));
}

export interface TagAllSummary {
  /** Marks added to doors and windows, and how many of those the tool numbered because the model gives neither Tag nor Name. */
  marks: number;
  numbered: number;
  /** Rooms labelled, and where each one's area came from. */
  rooms: number;
  areaFromModel: number;
  areaFromFootprint: number;
  /** Rooms whose label is bigger than the room. */
  roomsTooSmall: number;
  /** Doors, windows and rooms that already had theirs. */
  already: number;
  /** The plan shows no room at all (the model has no space at this level, or none reached the cut). */
  noRooms: boolean;
}
