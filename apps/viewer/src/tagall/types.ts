/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The label types TAGALL draws with, and what a run did. */

import type { AnnotationType } from '@/catalogue/types';

export const MARK_TYPE_ID = 'tagall-mark';
export const ROOM_TYPE_ID = 'tagall-room';

/** The door and window label: the one mark the schedule shares (`@bimvoice/ifcsheet` `elementMark`), never the Name (#631). */
export const MARK_TEMPLATE = '{Mark}';
/** What the mark label said before: the Name stood in for a missing mark, which put "Window" on a plan. */
const OLD_MARK_TEMPLATE = '{Mark ?? Name}';

/** The model's quantities a room's area is read from, first that has a value; then the footprint (`{Computed.Area}`). */
export const AREA_FIELDS = ['Qto_SpaceBaseQuantities.NetFloorArea', 'BaseQuantities.NetFloorArea', 'Qto_SpaceBaseQuantities.GrossFloorArea', 'BaseQuantities.GrossFloorArea'] as const;

const AREA_LINE = `{${[...AREA_FIELDS, 'Computed.Area'].join(' ?? ')}:0.00} m²`;
/** The room label: its number (the Name when a long name names the room; nothing otherwise), the tag name (the office's sources for it; by default the long name, else the Name), then the area. */
export const ROOM_TEMPLATE = `{RoomNumber|}\\n{TagName}\\n${AREA_LINE}`;
/** What the room label said before the number: the tag name and the area. */
export const NUMBERLESS_ROOM_TEMPLATE = `{TagName}\\n${AREA_LINE}`;
/** What the room label said before the tag name could be mapped. */
export const LEGACY_ROOM_TEMPLATE = `{LongName ?? Name}\\n${AREA_LINE}`;
/** The templates an office that never changed the room label may still have; a project with one of them exactly takes the current one. */
const OLD_ROOM_TEMPLATES: readonly string[] = [LEGACY_ROOM_TEMPLATE, NUMBERLESS_ROOM_TEMPLATE];

/**
 * The label types of TAGALL, ordinary label types the Standards dialog lists and edits: a door or window shows its
 * mark (its Tag unless that is only the element's unique id, else its type's schedule mark; never its Name); a room shows its long name (else its Name) and its area.
 */
export const TAGALL_TYPES: readonly AnnotationType[] = [
  { id: MARK_TYPE_ID, name: 'Door and window mark', tool: 'label', label: { template: MARK_TEMPLATE, frame: 'box', missing: 'empty' } },
  { id: ROOM_TYPE_ID, name: 'Room name and area', tool: 'label', label: { template: ROOM_TEMPLATE, missing: 'empty', leader: 'never' } },
];

/** The types with a room label the office never changed taken to the template that reads the tag name; the same array when none is. */
export function upgradeTagAllTypes(types: AnnotationType[]): AnnotationType[] {
  const old = (t: AnnotationType) => !!t.label && ((t.id === ROOM_TYPE_ID && OLD_ROOM_TEMPLATES.includes(t.label.template)) || (t.id === MARK_TYPE_ID && t.label.template === OLD_MARK_TEMPLATE));
  if (!types.some(old)) return types;
  return types.map((t) => (old(t) && t.label ? { ...t, label: { ...t.label, template: t.id === MARK_TYPE_ID ? MARK_TEMPLATE : ROOM_TEMPLATE } } : t));
}

/** Which of TAGALL's three kinds of label to place (#497). A kind left out is not placed; one already placed stays. */
export interface TagParts {
  doors: boolean;
  windows: boolean;
  rooms: boolean;
}

export const ALL_TAG_PARTS: Readonly<TagParts> = { doors: true, windows: true, rooms: true };

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
