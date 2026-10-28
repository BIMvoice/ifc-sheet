/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMADDPOINT, DIMREMOVEPOINT, DIMSPLIT: edit a chain of dimensions (the ones
 * the DIM commands continue from one another). Pick a dimension of the chain,
 * then click: a point to add, the witness point to remove, the point to split
 * at. Each click is one undo step; the command goes on until Enter.
 */

import { useProjectStore } from '@/project/project-store';
import { commitDrafts } from '../draft-store';
import { addChainPoint, removeChainPoint, splitChain } from '../dimension-chain-edit';
import type { DraftEntity, Pt } from '../types';
import type { DraftCommandDef } from './types';

type Edit = (drafts: readonly DraftEntity[], id: string, p: Pt, tolerance: number) => DraftEntity[] | null;

function chainEdit(id: string, aliases: string[], labelKey: DraftCommandDef['labelKey'], promptKey: 'drafting.prompt.chainAdd' | 'drafting.prompt.chainRemove' | 'drafting.prompt.chainSplit', edit: Edit): DraftCommandDef {
  return {
    id, aliases, labelKey,
    create(ctx) {
      let picked: string | null = null;
      return {
        prompt: () => ({ key: picked ? promptKey : 'drafting.prompt.chainPick' }),
        input: () => (picked ? 'point' : 'pick'),
        basePoint: () => null,
        onPick(entity) {
          if (entity.shape.type === 'dimension') picked = entity.id;
          else ctx.say('drafting.msg.chainNotDimension');
          return 'continue';
        },
        onPoint(p) {
          const next = picked ? edit(useProjectStore.getState().drafts, picked, p, 2 * ctx.settings.textHeight) : null;
          if (next) commitDrafts(next);
          else ctx.say('drafting.msg.chainNoChange');
          return 'continue';
        },
        onEnter: () => 'done',
      };
    },
  };
}

export const DIM_POINT_COMMANDS: readonly DraftCommandDef[] = [
  chainEdit('dimaddpoint', ['DIMADDPOINT', 'DIMADD'], 'drafting.cmd.dimAddPoint', 'drafting.prompt.chainAdd', (d, id, p) => addChainPoint(d, id, p)),
  chainEdit('dimremovepoint', ['DIMREMOVEPOINT', 'DIMREMOVE'], 'drafting.cmd.dimRemovePoint', 'drafting.prompt.chainRemove', removeChainPoint),
  chainEdit('dimsplit', ['DIMSPLIT'], 'drafting.cmd.dimSplit', 'drafting.prompt.chainSplit', splitChain),
];
