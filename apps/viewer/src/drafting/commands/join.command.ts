/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * JOIN (alias J) (#668): turn the selected lines and open polylines that touch end to end into one polyline, so a shape drawn
 * as separate lines changes as a whole. It acts at once on the selection, as one undoable step (`commitDrafts`).
 *
 * The polyline stays the entity of the first piece (its id, layer, style and parameters), so the selection and everything that
 * points at it carry on; the other pieces of its chain are removed. Ends within 1 mm count as touching; pieces further apart
 * are left as they are, and the command says how many and why. Arcs and circles are left alone: a polyline holds points only.
 */

import { useProjectStore } from '@/project/project-store';
import { commitDrafts } from '../draft-store';
import { chainPieces, JOIN_TOLERANCE, type Piece } from '../join-chain';
import type { DraftEntity } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

/** The selected entities that can be a piece of a chain, as pieces, in the order they are stored. */
function piecesOf(ctx: DraftContext): Piece[] {
  const ids = ctx.selection();
  return ctx.entities().flatMap((e): Piece[] => {
    if (!ids.has(e.id)) return [];
    if (e.shape.type === 'line') return [{ id: e.id, pts: [e.shape.a, e.shape.b] }];
    if (e.shape.type === 'polyline' && !e.shape.closed) return [{ id: e.id, pts: e.shape.pts }];
    return [];
  });
}

function join(ctx: DraftContext): void {
  const chains = chainPieces(piecesOf(ctx));
  const joined = chains.filter((c) => c.ids.length > 1);
  if (joined.length === 0) {
    ctx.say('drafting.msg.joinNone', { mm: JOIN_TOLERANCE * 1000 });
    return;
  }
  const seeds = new Map(joined.map((c) => [c.seed, c]));
  const gone = new Set(joined.flatMap((c) => c.ids.filter((id) => id !== c.seed)));
  const next = useProjectStore.getState().drafts.flatMap((d): DraftEntity[] => {
    if (gone.has(d.id)) return [];
    const chain = seeds.get(d.id);
    return [chain ? { ...d, shape: { type: 'polyline', pts: chain.pts, closed: chain.closed } } : d];
  });
  commitDrafts(next);
  ctx.setSelection(new Set(seeds.keys()));
  ctx.say('drafting.msg.joined', { count: joined.reduce((n, c) => n + c.ids.length, 0), polylines: joined.length });
  const left = chains.length - joined.length;
  if (left > 0) ctx.say('drafting.msg.joinLeft', { count: left, mm: JOIN_TOLERANCE * 1000 });
}

export const joinCommand: DraftCommandDef = {
  id: 'join',
  aliases: ['JOIN', 'J'],
  labelKey: 'drafting.cmd.join',
  needsSelection: true,
  create: () => ({ prompt: () => ({ key: 'drafting.prompt.idle' as const }), input: () => 'point' as const, basePoint: () => null }),
  run: join,
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [joinCommand];
