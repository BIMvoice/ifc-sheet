/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbol commands. SYMBOL places instances of the current symbol at picked
 * points (S types the next size factor, R the rotation in degrees; Enter
 * ends). MAKESYMBOL turns the selection into a symbol about a picked
 * insertion point and puts an instance in its place (with a symbol being
 * edited, it redefines that symbol instead). EXPLODESYMBOL turns selected
 * instances back into plain shapes to edit them.
 */

import { explodeSymbols, makeSymbolFromEntities, projectSymbols, symbolInstance } from '@/catalogue/symbol-actions';
import { resolve } from '@/i18n/registry';
import { annotationScreenUp, entitySkeleton } from '../annotation';
import { editDrafts } from '../draft-store';
import { allSymbols, findSymbol } from '../symbols';
import type { DraftCommandDef, DraftContext } from './types';

const selectedEntities = (ctx: DraftContext) => ctx.entities().filter((e) => ctx.selection().has(e.id));

export const symbolCommand: DraftCommandDef = {
  id: 'symbol',
  aliases: ['SYMBOL', 'SYM', 'INSERT'],
  labelKey: 'drafting.cmd.symbol',
  create(ctx) {
    const s = ctx.settings;
    let waiting: 'scale' | 'rotation' | null = null;
    const current = () => findSymbol(s.symbolId ?? '') ?? allSymbols()[0];
    return {
      prompt: () => ({
        key: waiting === 'scale' ? 'drafting.prompt.symbolScale' : waiting === 'rotation' ? 'drafting.prompt.symbolRotation' : 'drafting.prompt.symbolPoint',
        params: { name: current()?.name ?? '', scale: s.symbolScale, rotation: s.symbolRotation },
      }),
      input: () => 'point',
      basePoint: () => null,
      wantsValue: () => waiting !== null,
      onValue(v) {
        if (waiting === 'scale' && v > 0) s.symbolScale = v;
        if (waiting === 'rotation') s.symbolRotation = v;
        waiting = null;
        return 'continue';
      },
      onKeyword(word) {
        if (word === 'S' || word === 'SCALE') waiting = 'scale';
        else if (word === 'R' || word === 'ROTATE') waiting = 'rotation';
        else return undefined;
        return 'continue';
      },
      onPoint(p) {
        const def = current();
        const entity = def && symbolInstance(ctx.viewId, ctx.layerId, def.id, p, s.symbolScale, s.symbolRotation);
        if (entity) editDrafts({ add: [entity] });
        return 'continue';
      },
      onEnter: () => 'done',
      preview(cursor) {
        const def = current();
        const entity = def && symbolInstance(ctx.viewId, ctx.layerId, def.id, cursor, s.symbolScale, s.symbolRotation);
        return entity ? entitySkeleton(entity.shape) : [];
      },
    };
  },
};

export const makeSymbolCommand: DraftCommandDef = {
  id: 'makesymbol',
  aliases: ['MAKESYMBOL', 'MSYM', 'BLOCK'],
  labelKey: 'drafting.cmd.makeSymbol',
  needsSelection: true,
  create(ctx) {
    const items = selectedEntities(ctx);
    return {
      prompt: () => ({ key: 'drafting.prompt.symbolOrigin' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const target = ctx.settings.symbolTarget;
        const name = resolve('symbol.newName', { n: projectSymbols().length + 1 });
        const made = makeSymbolFromEntities(ctx.viewId, new Set(items.map((e) => e.id)), p, annotationScreenUp(), name, target);
        ctx.settings.symbolTarget = null;
        ctx.setSelection(new Set());
        if (!made || made.id === '') ctx.say('drafting.msg.symbolNothing');
        else {
          ctx.settings.symbolId = made.id;
          ctx.say(target ? 'drafting.msg.symbolRedefined' : 'drafting.msg.symbolMade', { name: projectSymbols().find((x) => x.id === made.id)?.name ?? name, skipped: made.skipped });
        }
        return 'done';
      },
      onEnter: () => 'done',
    };
  },
};

export const explodeSymbolCommand: DraftCommandDef = {
  id: 'explodesymbol',
  aliases: ['EXPLODESYMBOL', 'XSYM', 'EXPLODE'],
  labelKey: 'drafting.cmd.explodeSymbol',
  needsSelection: true,
  create(ctx) {
    return {
      prompt: () => ({ key: 'drafting.prompt.selectObjects' }),
      input: () => 'pick',
      basePoint: () => null,
      onEnter() {
        const { ids, symbolId } = explodeSymbols(new Set(selectedEntities(ctx).map((e) => e.id)), annotationScreenUp());
        if (ids.size === 0) ctx.say('drafting.msg.symbolNoneSelected');
        else {
          // The next MAKESYMBOL redefines the symbol these shapes came from.
          ctx.settings.symbolTarget = symbolId && projectSymbols().some((x) => x.id === symbolId) ? symbolId : null;
          ctx.setSelection(ids);
          ctx.say(ctx.settings.symbolTarget ? 'drafting.msg.symbolExploded' : 'drafting.msg.symbolExplodedBuiltIn');
        }
        return 'done';
      },
    };
  },
};

export const SYMBOL_COMMANDS: readonly DraftCommandDef[] = [symbolCommand, makeSymbolCommand, explodeSymbolCommand];
