/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The block a text shape draws: its lines and the frame around them (`packages/ifcsheet/src/text-block.ts`, which the PDF of
 * `ifcsheet build` draws a text's frame from too), measured here with the browser's font where there is one (`text-width.ts`).
 */

import { TEXT_FRAMES, asTextFrame, textBlock as engineTextBlock, LINE_PITCH, GLYPH_ASCENT, GLYPH_DESCENT, textLines, type FrameShape, type TextBlock, type TextFrame } from '@bimvoice/ifcsheet';
import { textWidthEm, type TextFace } from './text-width';

// The frames are part of the drafted shape, which the engine reads (`draft-types.ts`).
export { TEXT_FRAMES, asTextFrame, LINE_PITCH, GLYPH_ASCENT, GLYPH_DESCENT, textLines, type FrameShape, type TextBlock, type TextFrame };

/** `face` is the font the text is drawn in; the width is that font's, measured where the browser can, else from a table (`text-width.ts`). */
export function textBlock(text: string, height: number, frame?: TextFrame, face?: TextFace): TextBlock {
  return engineTextBlock(text, height, frame, face, textWidthEm);
}
