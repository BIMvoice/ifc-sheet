/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * UNDERLAYSCALE (#457): the person clicks two points on the scanned page that they know the distance between
 * (a dimension printed on it, a wall of known length) and types that distance in metres; the underlay of the
 * view is scaled so the two points are exactly that far apart, the first staying put. A locked underlay is
 * left alone, and the person is told.
 */

import { scaleUnderlay, unlockedUnderlayOf } from '@/underlay/underlay-actions';
import { useProjectStore } from '@/project/project-store';
import type { Pt } from '../types';
import type { DraftCommandDef } from './types';

export const underlayScaleCommand: DraftCommandDef = {
  id: 'underlayscale',
  aliases: ['UNDERLAYSCALE', 'ULSCALE'],
  labelKey: 'drafting.cmd.underlayScale',
  create(ctx) {
    const target = unlockedUnderlayOf(ctx.viewId);
    let first: Pt | null = null;
    let second: Pt | null = null;
    const none = (): 'done' => {
      const locked = (useProjectStore.getState().underlays ?? []).some((u) => u.viewId === ctx.viewId);
      ctx.say(locked ? 'drafting.msg.underlayLocked' : 'drafting.msg.underlayNone');
      return 'done';
    };
    return {
      prompt: () => ({ key: !first ? 'drafting.prompt.underlayFirst' : !second ? 'drafting.prompt.underlaySecond' : 'drafting.prompt.underlayDistance' }),
      input: () => 'point',
      basePoint: () => first,
      onPoint(p) {
        if (!target) return none();
        if (!first) first = p;
        else if (!second && Math.hypot(p.x - first.x, p.y - first.y) > 1e-9) second = p;
        return 'continue';
      },
      wantsValue: () => second !== null,
      onValue(distance) {
        if (!target) return none();
        if (!first || !second) return 'continue';
        if (!scaleUnderlay(target.id, first, second, distance)) {
          ctx.say('drafting.msg.underlayDistanceBad');
          return 'continue';
        }
        ctx.say('drafting.msg.underlayScaled', { distance });
        return 'done';
      },
      onEnter: () => 'done',
      preview: (cursor) => (first ? [{ type: 'line', a: first, b: second ?? cursor }] : []),
    };
  },
};

/** Found by `./registry.ts` (every `*.command.ts`), not listed there. */
export const draftCommands: readonly DraftCommandDef[] = [underlayScaleCommand];
