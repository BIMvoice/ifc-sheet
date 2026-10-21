/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PTEXT (#143): a text whose words may name title block parameters, `{Phase}`
 * (`project/parametric-text.ts`). The sheet prints it with the current values.
 * Only a sheet's paper resolves the names, so on a drawing the command
 * declines and says so rather than draft text that prints its braces.
 */

import { styledParams } from '@/project/drafting-standards';
import { PARAMETRIC_TEXT } from '@/project/parametric-text';
import { useProjectStore } from '@/project/project-store';
import { editDrafts, newDraft } from '../draft-store';
import type { Pt } from '../types';
import type { DraftCommandDef, StepResult } from './types';

export const pTextCommand: DraftCommandDef = {
  id: 'ptext',
  aliases: ['PTEXT', 'PARAMTEXT'],
  labelKey: 'drafting.cmd.ptext',
  create(ctx) {
    let at: Pt | null = null;
    const onSheet = (): boolean => useProjectStore.getState().sheets.some((s) => s.id === ctx.viewId);
    return {
      prompt: () => ({ key: at ? 'tbparams.text.prompt' : 'drafting.prompt.textPoint', params: { height: ctx.settings.textHeight, token: '{Name}' } }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p): StepResult {
        if (!onSheet()) {
          ctx.say('tbparams.text.sheetOnly');
          return 'done';
        }
        at = p;
        return 'continue';
      },
      wantsText: () => at !== null,
      onText(text): StepResult {
        if (at && text) {
          const shape = { type: 'text' as const, p: at, text, height: ctx.settings.textHeight, rotation: 0 };
          const params = { ...styledParams(ctx.viewId, shape, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), [PARAMETRIC_TEXT]: true };
          editDrafts({ add: [newDraft(ctx.viewId, ctx.layerId, shape, params)] });
        }
        return 'done';
      },
      preview: () => [],
    };
  },
};
