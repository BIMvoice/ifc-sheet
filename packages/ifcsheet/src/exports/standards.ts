/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Drawing standards: draft styles, graphic standards and the packs that bundle them. Add new exports of this area here, not in `../index.ts`. */

// Drawing standards: the graphic standards (pens, sheet pens, lettering) and the packs that bundle them (#365)
export { DEFAULT_DIM_STYLE, STANDARD_STYLE_ID, type ArrowKind, type DimStyle, type DraftLengthUnit, type FontKind, type TextPlacement, type TextStyle } from '../draft-styles.js';
export {
  DEFAULT_GRAPHIC_STANDARD, GRAPHIC_STANDARDS, ISO_128_LINE_WIDTHS, ISO_3098_HEIGHTS, GERMAN_PRACTICE, MARK_STYLES, ROMANIAN_PRACTICE, graphicStandardOf, knownGraphicStandard, markStyleOf, standardValues,
  type GraphicStandard, type MarkStyle,
} from '../graphic-standard.js';
export type { OpeningLineDirection } from '../graphic-standard.js';
export {
  COMMAND_LINE_STANDARDS, COMMAND_LINE_STANDARD_IDS, PACK_NOT_SET, GERMANY_PACK_ID, PACK_PARTS, ROMANIA_PACK_ID, STANDARD_PACK_VERSION, TITLE_BLOCK_CAPTIONS_DE, builtInPacks, germanyPack, packForCommandLine, packPartsOf, romaniaPack,
  type PackNotSet, type PackPart, type StandardPack,
} from '../standard-pack.js';
