/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Work-plane commands. SECTION draws a section line on a floor plan: two
 * points and the side to look at give a vertical plane through the line,
 * saved as a section view — a new drawing, and a work plane to draft on.
 *
 * The plane is a custom (face-pick style) section plane: normal horizontal
 * and perpendicular to the line, tangent along the line, bitangent world
 * up, so its drawing reads left-to-right along the line with up on top.
 * The kept half (what the section shows) is the side that was picked: an
 * unflipped cut keeps `dot(p, n) − d < 0`, so `n` points away from it.
 */

import { createSectionOnPlan } from '../section-create';
import type { Pt } from '../types';
import type { DraftCommandDef } from './types';

export const sectionLineCommand: DraftCommandDef = {
  id: 'sectionline',
  aliases: ['SECTION', 'SE', 'SECTIONLINE'],
  labelKey: 'drafting.cmd.section',
  create(ctx) {
    const pts: Pt[] = [];
    return {
      prompt: () => ({ key: ['drafting.prompt.sectionStart', 'drafting.prompt.sectionEnd', 'drafting.prompt.sectionSide'][Math.min(pts.length, 2)] as 'drafting.prompt.sectionStart' }),
      input: () => 'point',
      basePoint: () => pts.at(-1) ?? null,
      onPoint(p) {
        if (ctx.viewKind() !== 'plan') {
          ctx.say('drafting.msg.sectionOnPlan');
          return 'done';
        }
        if (pts.length < 2) {
          pts.push(p);
          return 'continue';
        }
        const plan = ctx.plane();
        const viewId = plan
          ? createSectionOnPlan({
            planViewId: ctx.viewId, plan, a: pts[0], b: pts[1], side: p, layerId: ctx.layerId, textHeight: ctx.settings.textHeight,
            styles: { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle },
          })
          : null;
        if (!viewId) {
          ctx.say('drafting.msg.sectionFailed');
          return 'done';
        }
        ctx.say('drafting.msg.sectionCreated');
        return 'done';
      },
      preview(cursor) {
        if (pts.length === 1) return [{ type: 'line', a: pts[0], b: cursor }];
        if (pts.length === 2) {
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          return [{ type: 'line', a: pts[0], b: pts[1] }, { type: 'line', a: mid, b: cursor }];
        }
        return [];
      },
    };
  },
};
