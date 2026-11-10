/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * COPYCLIP, PASTE and DUPLICATE: the commands behind Ctrl+C, Ctrl+V and Ctrl+D.
 * COPYCLIP and DUPLICATE act at once on the selection; PASTE holds the
 * clipboard at the cursor and puts it down where the next click lands.
 */

import { editDrafts, newDraft } from '../draft-store';
import { entitySkeleton, translateEntity } from '../annotation';
import { clipboardAnchor, clipboardEmpty, clipboardItems, setClipboard } from '../clipboard';
import { sub } from '../vec';
import { useProjectStore } from '@/project/project-store';
import { withoutSectionLink } from '../section-symbol';
import type { DraftCommandDef, DraftContext } from './types';

/** Paper millimetres a duplicate sits from its source. */
const DUPLICATE_OFFSET_MM = 5;

function selectedOf(ctx: DraftContext) {
  const ids = ctx.selection();
  return ctx.entities().filter((e) => ids.has(e.id));
}

export const copyClipCommand: DraftCommandDef = {
  id: 'copyclip',
  aliases: ['COPYCLIP'],
  labelKey: 'drafting.cmd.copyclip',
  needsSelection: true,
  create: () => ({ prompt: () => ({ key: 'drafting.prompt.idle' }), input: () => 'point', basePoint: () => null }),
  run(ctx) {
    const items = selectedOf(ctx);
    if (items.length === 0) return;
    // A copy is plain drawing: a section symbol's link to its view stays with the original.
    setClipboard(items, (e) => withoutSectionLink(e.params));
    ctx.say('drafting.msg.copied', { count: items.length });
  },
};

export const pasteCommand: DraftCommandDef = {
  id: 'paste',
  aliases: ['PASTE'],
  labelKey: 'drafting.cmd.paste',
  create(ctx) {
    const anchor = clipboardAnchor();
    if (clipboardEmpty()) ctx.say('drafting.msg.clipboardEmpty');
    return {
      prompt: () => ({ key: 'drafting.prompt.pastePoint' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const d = sub(p, anchor);
        const layers = new Set(useProjectStore.getState().draftLayers.map((l) => l.id));
        const added = editDrafts({
          add: clipboardItems().map((i) => newDraft(ctx.viewId, layers.has(i.layerId) ? i.layerId : ctx.layerId, translateEntity(i.shape, d), i.params)),
        });
        ctx.setSelection(new Set(added));
        return 'done';
      },
      onEnter: () => 'done',
      preview: (cursor) => clipboardItems().flatMap((i) => entitySkeleton(translateEntity(i.shape, sub(cursor, anchor)))),
    };
  },
};

export const duplicateCommand: DraftCommandDef = {
  id: 'duplicate',
  aliases: ['DUPLICATE'],
  labelKey: 'drafting.cmd.duplicate',
  needsSelection: true,
  create: () => ({ prompt: () => ({ key: 'drafting.prompt.idle' }), input: () => 'point', basePoint: () => null }),
  run(ctx) {
    const items = selectedOf(ctx);
    if (items.length === 0) return;
    const scale = ctx.view()?.scale ?? 100;
    const step = (DUPLICATE_OFFSET_MM * scale) / 1000;
    const added = editDrafts({ add: items.map((e) => newDraft(ctx.viewId, e.layerId, translateEntity(e.shape, { x: step, y: step }), withoutSectionLink(e.params))) });
    ctx.setSelection(new Set(added));
  },
};

export const CLIPBOARD_COMMANDS: readonly DraftCommandDef[] = [copyClipCommand, pasteCommand, duplicateCommand];
