/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALL: a level mark at each storey level a section or elevation shows and
 * at the top of the building, aligned on one vertical line outside the
 * building (the engine's `planLevelAll`). The marks keep their references, so they
 * follow the model; one undo step; a second run adds only what is missing.
 */

import { rectsOf } from '@/labels/label-annotations';
import { planLevelAll } from '@bimvoice/ifcsheet';
import { paperUnitOf, styledParams } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { editDrafts } from '../draft-store';
import type { DraftCommandDef } from './types';

export const levelAllCommand: DraftCommandDef = {
  id: 'levelall',
  aliases: ['LEVELALL', 'LVL'],
  labelKey: 'drafting.cmd.levelAll',
  create: () => ({ prompt: () => ({ key: 'drafting.cmd.levelAll' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' }),
  run(ctx) {
    const result = planLevelAll({
      kind: ctx.viewKind(),
      elements: ctx.viewElements(),
      levels: useProjectStore.getState().levels,
      existing: ctx.entities(),
      rectsOf,
      heightAt: (p) => ctx.levelAt(p),
      placement: { viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, paperUnit: paperUnitOf(ctx.viewId) },
      styled: styledParams,
      newId: () => freshProjectId('draft'),
    });
    if (result.add.length) editDrafts({ add: result.add });
    for (const m of result.messages) ctx.say(m.key, m.params);
  },
};
