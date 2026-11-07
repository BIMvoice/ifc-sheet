/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DXFALIGN (#547): the person clicks two points on the DXF underlay, then the two points of the model where those two belong
 * (the corners of a wall, a grid crossing; the clicks snap to the model's lines). The DXF is moved, turned and scaled so the first
 * pair lands on the second. A locked DXF is left alone, and the person is told.
 */

import { alignDxfUnderlay, unlockedDxfOf } from '@/underlay/dxf-underlay-actions';
import { useProjectStore } from '@/project/project-store';
import type { Pt } from '../types';
import type { DraftCommandDef } from './types';

export const dxfAlignCommand: DraftCommandDef = {
  id: 'dxfalign',
  aliases: ['DXFALIGN', 'DXALIGN'],
  labelKey: 'dxfView.cmd',
  create(ctx) {
    const target = unlockedDxfOf(ctx.viewId);
    const picked: Pt[] = [];
    const none = (): 'done' => {
      const any = (useProjectStore.getState().dxfUnderlays ?? []).some((u) => u.viewId === ctx.viewId);
      ctx.say(any ? 'dxfView.msg.locked' : 'dxfView.msg.none');
      return 'done';
    };
    const KEYS = ['dxfView.prompt.from1', 'dxfView.prompt.from2', 'dxfView.prompt.to1', 'dxfView.prompt.to2'] as const;
    return {
      prompt: () => ({ key: KEYS[Math.min(picked.length, KEYS.length - 1)] }),
      input: () => 'point',
      basePoint: () => (picked.length === 1 || picked.length === 3 ? picked[picked.length - 1] : null),
      onPoint(p) {
        if (!target) return none();
        // The second point of a pair must not sit on its first: the pair would give no direction.
        const first = picked.length % 2 === 1 ? picked[picked.length - 1] : null;
        if (first && Math.hypot(p.x - first.x, p.y - first.y) < 1e-9) return 'continue';
        picked.push(p);
        if (picked.length < 4) return 'continue';
        if (!alignDxfUnderlay(target.id, [picked[0], picked[1]], [picked[2], picked[3]])) {
          ctx.say('dxfView.msg.bad');
          return 'done';
        }
        ctx.say('dxfView.msg.aligned');
        return 'done';
      },
      onEnter: () => 'done',
      preview: (cursor) => {
        const from = picked.length >= 2 ? [{ type: 'line' as const, a: picked[0], b: picked[1] }] : [];
        const live = picked.length % 2 === 1 ? [{ type: 'line' as const, a: picked[picked.length - 1], b: cursor }] : [];
        const to = picked.length >= 4 ? [{ type: 'line' as const, a: picked[2], b: picked[3] }] : [];
        return [...from, ...live, ...to];
      },
    };
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [dxfAlignCommand];
