/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a typed line means to the command that is running: free text, a
 * keyword, a coordinate in the user's frame, or a bare number (a value when
 * the step wants one, else a distance from the base point toward the cursor).
 */

import type { DraftCommand, StepResult } from './commands/types';
import { drawingToUserPoint, userToDrawingPoint, type SectionAxisName } from './frame';
import { parseCoordinateInput, pointAlong } from './input';
import type { Pt } from './types';

export interface TypedFrame {
  axis: SectionAxisName;
  /** Where typed absolute coordinates count from, in drawing space. */
  origin: Pt;
  /** Applies ortho against the command's base point. */
  constrain: (p: Pt) => Pt;
}

/** The step's result for `text`, 'invalid' when the command cannot read it, or null when the line was meant for nothing the command wants. */
export function applyTypedLine(command: DraftCommand, text: string, cursor: Pt | null, frame: TypedFrame): StepResult | 'invalid' | null {
  if (command.wantsText?.() && command.onText) return command.onText(text);
  const word = text.toUpperCase();
  if (/^[A-Z][A-Z0-9_.-]*$/.test(word) && command.onKeyword) {
    const result = command.onKeyword(word);
    if (result) return result;
  }
  const base = command.basePoint();
  const parsed = parseCoordinateInput(text, { last: base ? drawingToUserPoint(base, frame.axis, frame.origin) : null });
  if (!parsed) return 'invalid';
  if (parsed.kind === 'point') return command.onPoint ? command.onPoint(userToDrawingPoint(parsed.pt, frame.axis, frame.origin)) : null;
  if (command.wantsValue?.() && command.onValue) return command.onValue(parsed.d);
  if (base && cursor && command.onPoint) return command.onPoint(pointAlong(base, frame.constrain(cursor), parsed.d));
  return 'invalid';
}
