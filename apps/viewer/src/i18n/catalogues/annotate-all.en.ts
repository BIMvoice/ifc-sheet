/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
export const annotateAllEn = {
  'drafting.cmd.dimAll': 'DIMALL',
  'drafting.tool.dimAll': 'Dimension the plan',
  'drafting.msg.dimAllPlanOnly': 'DIMALL works on a plan.',
  'drafting.msg.dimAllNotOnDetail': 'DIMALL works on a whole plan: a detail shows only part of the building, so its edges are not facades. Run it on the source plan, or dimension the detail by hand.',
  'drafting.msg.dimAllNone': 'Nothing to dimension: no walls cut in this plan, or no facade with an opening or a cross wall.',
  'drafting.msg.dimAllHave': 'This plan has all its dimension strings already.',
  'drafting.msg.dimAllDone': 'Added {count} dimensions in {strings} strings. Facades with nothing to dimension: {skipped}.',
  'drafting.msg.dimAllDropped': {
    one: '{count} string left out: on a notch or courtyard facade it would run through the building, its wall stands at an angle to the plan and it could not be measured exactly, or, inside a room, there is no place clear of walls, labels, tags and symbols. Dimension it by hand.',
    other: '{count} strings left out: on a notch or courtyard facade they would run through the building, their walls stand at an angle to the plan and they could not be measured exactly, or, inside rooms, there is no place clear of walls, labels, tags and symbols. Dimension them by hand.',
  },
  'drafting.msg.dimAllTagsMoved': {
    one: '{count} tag moved along its facade to clear the extension lines; it still points at the same element.',
    other: '{count} tags moved along their facades to clear the extension lines; they still point at the same elements.',
  },
  'drafting.msg.dimAllNoRooms': 'This plan has no rooms in the model (no IfcSpace), so no room sizes were drawn: DIMALL does not guess rooms from the walls. Dimension the rooms by hand.',
  'drafting.msg.dimAllOpenings': {
    one: '{count} door or window left out of the strings: the plan does not show exactly where its edges are. Dimension it by hand.',
    other: '{count} doors or windows left out of the strings: the plan does not show exactly where their edges are. Dimension them by hand.',
  },
  'drafting.msg.dimAllHeads': '{count} strings run through the arrow or letter of a section mark; their figures keep clear of it, but you may want to move the mark.',
  'drafting.cmd.tagAll': 'TAGALL',
  'drafting.cmd.ceilTag': 'CEILTAG',
  'drafting.tool.ceilTag': 'Tag ceiling heights',
  'drafting.msg.ceilTagCeilingPlanOnly': 'CEILTAG works on a reflected ceiling plan.',
  'drafting.msg.ceilTagDone': 'Tagged {count} ceilings with their height above the level. Already tagged: {already}.',
  'drafting.msg.ceilTagStacked': 'Ceilings that share another one\'s tag, lying exactly under it (same spot, same height): {stacked}. Tags in all: {tags}.',
  'drafting.msg.ceilTagNone': 'Every ceiling of this plan has its height already ({already}), or the plan has none.',
  'drafting.tool.tagAll': 'Tag doors, windows and rooms',
  'drafting.msg.tagAllPlanOnly': 'TAGALL works on a plan.',
  'drafting.msg.tagAllNeedsTypes': 'TAGALL needs the label types "Door and window mark" and "Room name and area"; restore them in the Standards dialog.',
  'drafting.msg.tagAllDone': 'Tagged {marks} doors and windows and {rooms} rooms. Already tagged: {already}.',
  'drafting.msg.tagAllHave': 'Every door, window and room of this plan has its label already ({already}).',
  'drafting.msg.tagAllNumbered': '{count} doors and windows have neither Tag nor Name in the model; the tool numbered them.',
  'drafting.msg.tagAllAreas': 'Room areas: {model} read from the model quantities, {footprint} computed from the room footprint.',
  'drafting.msg.tagAllTooSmall': '{count} rooms are smaller than their label; the label sits at the deepest point and runs over the walls.',
  'drafting.msg.tagAllNoRooms': 'This plan shows no room: the model has no space cut at this level, so only doors and windows were tagged.',
  'drafting.cmd.levelAll': 'LEVELALL',
  'drafting.tool.levelAll': 'Level marks for the view',
  'drafting.msg.levelAllViewOnly': 'LEVELALL works on a section or an elevation.',
  'drafting.msg.levelAllEmpty': 'Nothing to mark: this view shows no model elements.',
  'drafting.msg.levelAllHave': 'This view has all its level marks already ({count}).',
  'drafting.msg.levelAllDoneLeft': 'Added {count} level marks on the left of the building, in line. Already there: {already}.',
  'drafting.msg.levelAllDoneRight': 'Added {count} level marks on the right of the building, in line. Already there: {already}.',
} as const satisfies Record<string, TranslationValue>;
