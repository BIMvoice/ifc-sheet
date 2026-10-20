/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALIGN: the selected level marks line up on one picked vertical line,
 * each symbol staying at its own height and every reference untouched, as the
 * marks of a real section stack.
 */

import { editDrafts } from '../draft-store';
import { alignLevelMarks, type LevelShape } from '../level-mark';
import type { DraftEntity } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

type LevelEntity = DraftEntity & { shape: LevelShape };

function selectedMarks(ctx: DraftContext): LevelEntity[] {
  const ids = ctx.selection();
  return ctx.entities().filter((e): e is LevelEntity => ids.has(e.id) && e.shape.type === 'level');
}

export const levelAlignCommand: DraftCommandDef = {
  id: 'levelalign',
  aliases: ['LEVELALIGN', 'LVA'],
  labelKey: 'drafting.cmd.levelAlign',
  needsSelection: true,
  create(ctx) {
    const marks = selectedMarks(ctx);
    return {
      prompt: () => ({ key: 'drafting.prompt.levelAlignLine' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        if (marks.length === 0) {
          ctx.say('drafting.msg.levelAlignNone');
          return 'done';
        }
        const aligned = alignLevelMarks(marks.map((m) => m.shape), p.x);
        editDrafts({ update: new Map(marks.map((m, i) => [m.id, aligned[i]])) });
        ctx.say('drafting.msg.levelAligned', { count: marks.length });
        return 'done';
      },
      onEnter: () => 'done',
      // The line the marks will stack on, reaching past the highest and lowest symbol.
      preview(cursor) {
        const ys = marks.map((m) => m.shape.p.y);
        const pad = Math.max(...marks.map((m) => m.shape.height * 4), 1);
        if (ys.length === 0) return [];
        return [{ type: 'line', a: { x: cursor.x, y: Math.min(...ys) - pad }, b: { x: cursor.x, y: Math.max(...ys) + pad } }];
      },
    };
  },
};
