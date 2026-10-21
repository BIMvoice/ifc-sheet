/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * REVCLOUD: the person marks a rectangle and a revision cloud is drawn round it,
 * on the sheet or on the drawing in front. The cloud is the one WHATCHANGED draws
 * (`@/whatchanged/cloud`) and belongs to a revision (`@/project/revision-tool`:
 * the one chosen, else the latest). Without a revision there is nothing to belong
 * to, and it says so.
 */

import { editDrafts } from '../draft-store';
import { paperUnitOf } from '@/project/drafting-standards';
import { cloudRevisionNow } from '@/project/revision-tool';
import { REVISION_ID_PARAM } from '@/project/revisions';
import { cloudDraft, ensureRevisionsLayer } from '@/whatchanged/cloud';
import type { Pt } from '../types';
import type { DraftCommandDef } from './types';

export const revCloudCommand: DraftCommandDef = {
  id: 'revcloud',
  aliases: ['REVCLOUD', 'RC'],
  labelKey: 'drafting.cmd.revcloud',
  create(ctx) {
    let first: Pt | null = null;
    const box = (a: Pt, b: Pt) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    return {
      prompt: () => (cloudRevisionNow() === null ? { key: 'revision.msg.none' } : { key: first ? 'drafting.prompt.oppositeCorner' : 'drafting.prompt.firstCorner' }),
      input: () => 'point',
      basePoint: () => first,
      onPoint(p) {
        const revisionId = cloudRevisionNow();
        if (revisionId === null) {
          ctx.say('revision.msg.none');
          return 'done';
        }
        if (!first) {
          first = p;
          return 'continue';
        }
        if (Math.abs(p.x - first.x) > 1e-9 && Math.abs(p.y - first.y) > 1e-9) {
          ensureRevisionsLayer();
          editDrafts({ add: [cloudDraft(ctx.viewId, box(first, p), paperUnitOf(ctx.viewId), { [REVISION_ID_PARAM]: revisionId })] });
        }
        return 'done';
      },
      preview: (cursor) => (first ? [{ type: 'polyline', pts: [first, { x: cursor.x, y: first.y }, cursor, { x: first.x, y: cursor.y }], closed: true }] : []),
    };
  },
};
