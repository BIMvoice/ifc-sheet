/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * FLIP (#168): mirrors the selection at once about its own centre, left to right (`FLIP`, `FLIP H`) or up and down
 * (`FLIP V`), as one undo step. It makes the same edit as MIRROR (`mirrorDrafts` in `./modify.ts`): in place, a
 * section symbol whole and a detail's mark left out as a move does (`movableOf`); with `KEEP` the original stays and a
 * mirrored copy (plain drawing) is added and selected. Text is mirrored in position and stays readable. The selection
 * bar's two flip buttons start it, so a button and the typed command cannot differ.
 */

import { entityBounds } from '../annotation';
import { mirrorDrafts, movableOf } from './modify';
import type { DraftEntity, Pt } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

export interface FlipArgs {
  /** Up and down (about a horizontal line) instead of left to right. */
  vertical: boolean;
  keep: boolean;
}

/** `H`, `V` and `KEEP` in any order, case-insensitive. */
export function flipArgsOf(args: string): FlipArgs {
  const words = args.trim().toUpperCase().split(/\s+/);
  return { vertical: words.includes('V'), keep: words.some((w) => w === 'K' || w === 'KEEP') };
}

function centreOf(items: readonly DraftEntity[]): Pt {
  const boxes = items.map((e) => entityBounds(e.shape));
  const x = (Math.min(...boxes.map((b) => b.min.x)) + Math.max(...boxes.map((b) => b.max.x))) / 2;
  const y = (Math.min(...boxes.map((b) => b.min.y)) + Math.max(...boxes.map((b) => b.max.y))) / 2;
  return { x, y };
}

/** Flips the selection; the number of elements flipped or copied. */
export function flipSelection(ctx: DraftContext, { vertical, keep }: FlipArgs): number {
  const ids = ctx.selection();
  const { items, locked } = keep ? { items: ctx.entities().filter((e) => ids.has(e.id)), locked: false } : movableOf(ids, ctx.entities());
  if (locked) ctx.say('drafting.msg.sectionSymbolLocked');
  if (items.length === 0) return 0;
  // Drawing x and y run along the screen's axes (either way), so a line through the centre along drawing y is upright on screen.
  const a = centreOf(items);
  const b = vertical ? { x: a.x + 1, y: a.y } : { x: a.x, y: a.y + 1 };
  const copies = mirrorDrafts(ctx.viewId, a, b, keep ? { copies: items } : { flips: items });
  if (keep) ctx.setSelection(new Set(copies));
  return items.length;
}

export const flipCommand: DraftCommandDef = {
  id: 'flip',
  aliases: ['FLIP'],
  labelKey: 'drafting.cmd.flip',
  needsSelection: true,
  takesArgs: true,
  create: () => ({ prompt: () => ({ key: 'drafting.prompt.idle' as const }), input: () => 'point' as const, basePoint: () => null }),
  run(ctx, args) {
    flipSelection(ctx, flipArgsOf(args));
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [flipCommand];
