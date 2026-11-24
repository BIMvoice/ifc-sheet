/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a stepped-in sheet starts a command handed to it from outside (an annotation type's "Draw with it" or "Label
 * all", #842): a tool of the rail starts as a click on the rail does (rail lit, card shown); any other command (LABEL,
 * LABELALL) runs on the drawing in front, else the one chosen on the sheet, which is opened for it.
 */

import { useEffect, useRef } from 'react';
import { registerSheetDrawingStart } from '@/drafting/drawing-in-front';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions';

const onRail = (command: string): boolean => [...DRAW_TOOLS, ...WALL_TOOLS].some((x) => x.command === command);

/** Registers the sheet's start for as long as the sheet is stepped into; `startTool` is the rail's, `runOnDrawing` the one-action twins'. */
export function useSheetDrawingStart(startTool: (command: string) => void, runOnDrawing: (command: string) => boolean): void {
  const latest = useRef({ startTool, runOnDrawing });
  latest.current = { startTool, runOnDrawing };
  useEffect(() => registerSheetDrawingStart((command) => {
    if (!onRail(command)) return latest.current.runOnDrawing(command);
    latest.current.startTool(command);
    return true;
  }), []);
}
