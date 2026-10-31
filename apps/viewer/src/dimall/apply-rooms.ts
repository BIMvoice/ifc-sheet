/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room dimensions of a plan (`rooms.ts`) as drafts on the view, stamped (`params.dimAll`) like the outer strings so a
 * second run adds only what is missing. The stamp names the room, the direction and the two faces and not where the line
 * stands: a rerun that places the line elsewhere (a tag moved in between) still finds its dimension there.
 */

import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import { styledParams } from '@/project/drafting-standards';
import type { DimensionTarget } from './apply';
import type { RoomChain, RoomPlan } from './rooms';

export function roomStamp(c: RoomChain): string {
  const cm = (v: number) => Math.round(v * 100);
  return `${c.key}|${cm(c.from)}|${cm(c.to)}`;
}

/** Whether a dimension of the view is one of the room dimensions of an earlier run. */
export const isRoomDim = (d: DraftEntity): boolean => typeof d.params.dimAll === 'string' && d.params.dimAll.startsWith('room:');

/** The room dimensions of `plan` that the view does not carry yet. */
export function roomDrafts(plan: RoomPlan, target: DimensionTarget, existing: readonly DraftEntity[]): DraftEntity[] {
  const done = new Set(existing.flatMap((d) => (typeof d.params.dimAll === 'string' ? [d.params.dimAll] : [])));
  const out: DraftEntity[] = [];
  plan.chains.forEach((c, i) => {
    const stamp = roomStamp(c);
    if (done.has(stamp)) return;
    done.add(stamp);
    const styled = styledParams(target.viewId, plan.shapes[i], { textStyle: target.textStyle, dimStyle: target.dimStyle });
    out.push(newDraft(target.viewId, target.layerId, plan.shapes[i], { ...styled, dimAll: stamp }));
  });
  return out;
}
