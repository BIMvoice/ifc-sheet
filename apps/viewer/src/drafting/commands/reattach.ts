/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * REATTACH: point the selected tags and labels at another model element: click the element. It is the remedy for an
 * annotation whose element is gone (WHAT IS MISSING): the annotation keeps its place and style, and takes the new
 * element's GlobalId (`tagOf` or `labelOf`); a tag then reads its text from the new element (`useElementTagSync`).
 * A dimension is not offered it: what it measures cannot move to another element.
 */

import { renderIdGlobalId } from '@/project/element-guid';
import { refreshElementTags } from '@/project/useElementTagSync';
import { setDraftParams } from '../draft-store';
import type { DraftCommandDef } from './types';

export const reattachCommand: DraftCommandDef = {
  id: 'reattach',
  aliases: ['REATTACH'],
  labelKey: 'check.cmd.reattach',
  needsSelection: true,
  create(ctx) {
    return {
      prompt: () => ({ key: 'check.prompt.reattach' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const id = ctx.elementAt(p);
        const guid = id === null ? null : renderIdGlobalId(id);
        if (!guid) {
          ctx.say('drafting.msg.notAnElement');
          return 'continue';
        }
        const chosen = ctx.entities().filter((d) => ctx.selection().has(d.id));
        for (const param of ['tagOf', 'labelOf'] as const) {
          const ids = new Set(chosen.filter((d) => typeof d.params[param] === 'string').map((d) => d.id));
          if (ids.size > 0) setDraftParams(ids, { [param]: guid });
        }
        refreshElementTags();
        ctx.say('check.msg.reattached', { count: chosen.filter((d) => d.params.tagOf !== undefined || d.params.labelOf !== undefined).length });
        return 'done';
      },
      onEnter: () => 'done',
    };
  },
};
