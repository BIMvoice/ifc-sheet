/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Words for a Text or Note written on the drawing where it prints (#168). AutoCAD mode keeps the typed prompts. */
export const textOnDrawingEn = {
  'textOnDrawing.prompt': 'Type the text where it prints (Shift+Enter for a new line, Enter to finish, Esc to cancel)',
  'textOnDrawing.leaderBend': 'Click the bend, at any angle',
  'textOnDrawing.leaderEnd': 'Click the end of the second segment, or click the bend again (No bend) for a straight leader',
  'textOnDrawing.noBend': 'No bend',
  'textOnDrawing.editor': 'New text',
} as const satisfies Record<string, TranslationValue>;
