/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tool texts shown while AutoCAD mode is off (#168): each names the button
 * that ends the tool, not a key. `lib/commands/plain-texts.ts` maps the
 * AutoCAD-mode text to its plain one; with AutoCAD mode on the old text stays.
 */
export const plainHintsEn = {
  'plainHints.drawHint': 'Done ends the tool (Esc or Enter work too). Back to sheet leaves the drawing.',
  'plainHints.dimensionHint': 'Click to continue the chain. Done stops it (Esc works too).',
  'plainHints.pickLine': 'Click a line to hide it, or press Hide a line again to stop.',
  'plainHints.levelPoint': 'Click where the level mark goes. Choose Done when you are finished.',
  'plainHints.placeDoor': 'Click on a wall to put a door there (on the wall\'s base). Choose Done when you are finished.',
  'plainHints.placeWindow': 'Click on a wall to put a window there (centred on the click). Choose Done when you are finished.',
  'plainHints.placeOpening': 'Click on a wall to cut an opening there (centred on the click). Choose Done when you are finished.',
  'plainHints.labelElement': 'Click the element to label. Choose Done when you are finished.',
  'plainHints.tagElement': 'Click the element to tag. The tag shows {fieldWords}; change that under The tag shows on the tool card.',
  'plainHints.tagLabel': 'Click where the tag goes. The tag shows {fieldWords}; change that under The tag shows on the tool card.',
  'plainHints.chainAdd': 'Click the point to add to the chain. Choose Done when you are finished.',
  'plainHints.chainRemove': 'Click the point to remove from the chain. Choose Done when you are finished.',
  'plainHints.chainSplit': 'Click the point to split the chain at. Choose Done when you are finished.',
  'plainHints.secondPoint': 'Click the second point. Choose Done when you are finished.',
  'plainHints.trimPick': 'Click the part to trim. Choose Done when you are finished.',
  'plainHints.extendPick': 'Click the end to extend. Choose Done when you are finished.',
} as const;
