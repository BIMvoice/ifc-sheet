/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What each row of the Wall's keymap does on a sheet stepped into. One
 * property per row, so a row added to the keymap without an action here does
 * not compile; `null` is "not on offer now" (see `wall-key-bus.ts`).
 */

import type { WallKeyId } from '@/lib/commands/wall-key-commands';
import type { WallHandlers } from './wall-key-bus';

/** The rows that line chosen drawings up with each other (#168). */
export type ArrangeKeyId = Extract<WallKeyId, `wall.align.${string}` | `wall.distribute.${string}`>;

/** Nothing to line up: what a sheet with fewer than two drawings chosen offers. */
export const NO_ARRANGE: SteppedActions['arrange'] = {
  'wall.align.left': null, 'wall.align.right': null, 'wall.align.top': null, 'wall.align.bottom': null, 'wall.align.centreH': null, 'wall.align.centreV': null,
  'wall.distribute.across': null, 'wall.distribute.down': null,
};

export interface SteppedActions {
  startTool: (command: string) => void;
  toggleAdd: () => void;
  /** Absent while a drawing is in front: the sheet's own controls are not showing. */
  fit: (() => void) | null;
  print: (() => void) | null;
  previous: (() => void) | null;
  next: (() => void) | null;
  back: () => void;
  /** Present only with a drawing in front. */
  leaveEdit: (() => void) | null;
  /** The sheet's buttons, absent while a drawing is in front (they are not showing then). */
  comment: (() => void) | null;
  paper: (() => void) | null;
  titleBlock: (() => void) | null;
  revisions: (() => void) | null;
  printPreview: (() => void) | null;
  exportDxf: (() => void) | null;
  /** Lining up and spacing the chosen drawings: each `null` until enough drawings are chosen. */
  arrange: Readonly<Record<ArrangeKeyId, (() => void) | null>>;
}

export function steppedHandlers(a: SteppedActions): WallHandlers {
  const tool = (command: string) => () => a.startTool(command);
  return {
    'wall.tool.dimaligned': tool('dimaligned'),
    'wall.tool.tag': tool('tag'),
    'wall.tool.leader': tool('leader'),
    'wall.tool.level': tool('level'),
    'wall.tool.sectionline': tool('sectionline'),
    'wall.tool.symbol': tool('symbol'),
    'wall.draw.line': tool('line'),
    'wall.draw.polyline': tool('polyline'),
    'wall.draw.rectangle': tool('rectangle'),
    'wall.draw.circle': tool('circle'),
    'wall.draw.text': tool('text'),
    'wall.draw.hatch': tool('hatch'),
    'wall.draw.revcloud': tool('revcloud'),
    'wall.draw.ptext': tool('ptext'),
    'wall.draw.trim': tool('trim'),
    'wall.draw.extend': tool('extend'),
    'wall.draw.fillet': tool('fillet'),
    'wall.draw.offset': tool('offset'),
    'wall.draw.chamfer': tool('chamfer'),
    'wall.addDrawing': a.toggleAdd,
    'wall.fit': a.fit,
    'wall.print': a.print,
    'wall.prevSheet': a.previous,
    'wall.nextSheet': a.next,
    'wall.back': a.back,
    'wall.leaveEdit': a.leaveEdit,
    'wall.comment': a.comment,
    'wall.paper': a.paper,
    'wall.titleBlock': a.titleBlock,
    'wall.revisions': a.revisions,
    'wall.printPreview': a.printPreview,
    'wall.exportDxf': a.exportDxf,
    ...a.arrange,
  } satisfies Record<WallKeyId, (() => void) | null>;
}
