/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pick-driven edits: OFFSET, TRIM, EXTEND, FILLET. Each repeats on new
 * picks until Enter / Escape, like the CAD commands they are named after.
 */

import { editDrafts, newDraft } from '../draft-store';
import { shapeBounds } from '../curves';
import { offsetShape } from '../offset';
import { extendShape, trimShape } from '../trim';
import { useProjectStore } from '@/project/project-store';
import { isLockedToView, withoutSectionLink } from '../section-symbol';
import { isGeometry, type DraftEntity, type DraftShape } from '../types';
import { editModelLine, filletSides, modelFilletSide, offsetModelLine, sameSide, type FilletSide } from './edit-model-line';
import { chamferSides, cornerPreview } from './edit-corner';
import type { DraftCommandDef, DraftContext, ModelLinePick } from './types';

/** Every other drafted shape of the view plus the generated drawing lines around `shape`. */
export function boundariesFor(ctx: DraftContext, entity: DraftEntity | { id: null; shape: DraftShape }, margin: number): DraftShape[] {
  if (!isGeometry(entity.shape)) return [];
  const b = shapeBounds(entity.shape);
  const others: DraftShape[] = [];
  for (const e of ctx.entities()) if (e.id !== entity.id && isGeometry(e.shape)) others.push(e.shape);
  const min = { x: b.min.x - margin, y: b.min.y - margin };
  const max = { x: b.max.x + margin, y: b.max.y + margin };
  return [...others, ...ctx.referenceShapes(min, max)];
}

/** A section symbol's parts are not trimmed, offset or filleted one by one (the symbol is moved, turned or stretched whole), nor is a detail mark. Says so when `entity` is one. */
function lockedSymbol(ctx: DraftContext, entity: DraftEntity): boolean {
  const locked = isLockedToView(entity, useProjectStore.getState().views);
  if (locked) ctx.say('drafting.msg.sectionSymbolLocked');
  return locked;
}

export const offsetCommand: DraftCommandDef = {
  id: 'offset',
  aliases: ['OFFSET', 'O'],
  labelKey: 'drafting.cmd.offset',
  create(ctx) {
    let distance = ctx.settings.offsetDistance;
    let source: DraftEntity | null = null;
    // A line of the generated drawing picked instead of a drafted one (#189): the offset copy is drafted, the model's line stays.
    let model: ModelLinePick | null = null;
    return {
      prompt: () => {
        if (distance === null) return { key: 'drafting.prompt.offsetDistance' };
        return source || model ? { key: 'drafting.prompt.offsetSide' } : { key: 'drafting.prompt.offsetPick', params: { distance } };
      },
      input: () => (distance !== null && !source && !model ? 'pick' : 'point'),
      basePoint: () => null,
      wantsValue: () => !source && !model,
      onValue(v) {
        if (v <= 0) return 'continue';
        distance = v;
        ctx.settings.offsetDistance = v;
        return 'continue';
      },
      onPick(entity) {
        if (isGeometry(entity.shape)) source = entity;
        return 'continue';
      },
      onPickModelLine(pick) {
        model = pick;
        return 'continue';
      },
      onPoint(p) {
        if (model && distance !== null) {
          offsetModelLine(ctx, model, distance, p);
          model = null;
          return 'continue';
        }
        if (!source || distance === null || !isGeometry(source.shape)) return 'continue';
        const shape = offsetShape(source.shape, distance, p);
        if (shape) editDrafts({ add: [newDraft(ctx.viewId, source.layerId, shape, withoutSectionLink(source.params))] });
        source = null;
        return 'continue';
      },
      onEnter: () => 'done',
      preview: (cursor) => {
        if (model && distance !== null) {
          const shape = offsetShape({ type: 'line', a: model.a, b: model.b }, distance, cursor);
          return shape ? [shape] : [];
        }
        if (!source || distance === null || !isGeometry(source.shape)) return [];
        const shape = offsetShape(source.shape, distance, cursor);
        return shape ? [shape] : [];
      },
    };
  },
};

/** TRIM / EXTEND: pick the piece to cut away / the end to lengthen. */
function cutCommand(id: 'trim' | 'extend'): DraftCommandDef {
  return {
    id,
    aliases: id === 'trim' ? ['TRIM', 'TR'] : ['EXTEND', 'EX'],
    labelKey: id === 'trim' ? 'drafting.cmd.trim' : 'drafting.cmd.extend',
    create(ctx) {
      return {
        prompt: () => ({ key: id === 'trim' ? 'drafting.prompt.trimPick' : 'drafting.prompt.extendPick' }),
        input: () => 'pick',
        basePoint: () => null,
        onPick(entity, at) {
          if (!isGeometry(entity.shape)) return 'continue';
          if (lockedSymbol(ctx, entity)) return 'continue';
          // Extend looks far beyond the entity for its boundary; trim only needs its own extent.
          const margin = id === 'trim' ? 0.01 : 1000;
          const boundaries = boundariesFor(ctx, entity, margin);
          if (id === 'trim') {
            const pieces = trimShape(entity.shape, boundaries, at);
            if (!pieces) {
              ctx.say('drafting.msg.nothingToTrim');
              return 'continue';
            }
            editDrafts({
              remove: new Set([entity.id]),
              add: pieces.map((shape) => newDraft(ctx.viewId, entity.layerId, shape, withoutSectionLink(entity.params))),
            });
            return 'continue';
          }
          const extended = extendShape(entity.shape, boundaries, at);
          if (!extended) ctx.say('drafting.msg.noBoundary');
          else editDrafts({ update: new Map([[entity.id, extended]]) });
          return 'continue';
        },
        onPickModelLine: (pick, at) => {
          editModelLine(ctx, id, pick, at);
          return 'continue';
        },
        onEnter: () => 'done',
      };
    },
  };
}

export const trimCommand = cutCommand('trim');
export const extendCommand = cutCommand('extend');

/** FILLET and CHAMFER: two lines, then the corner between them is rounded or cut. A radius or a distance typed first is kept. */
function cornerCommand(kind: 'fillet' | 'chamfer'): DraftCommandDef {
  const size = (ctx: DraftContext) => (kind === 'fillet' ? ctx.settings.filletRadius : ctx.settings.chamferDistance);
  return {
    id: kind,
    aliases: kind === 'fillet' ? ['FILLET', 'F'] : ['CHAMFER', 'CHA'],
    labelKey: kind === 'fillet' ? 'drafting.cmd.fillet' : 'drafting.cmd.chamfer',
    create(ctx) {
      let first: FilletSide | null = null;
      /** The first or second pick: a drafted line or a line of the generated drawing. */
      const take = (side: FilletSide): 'continue' | 'done' => {
        if (!first) {
          first = side;
          return 'continue';
        }
        if (sameSide(first, side)) return 'continue';
        const ok = kind === 'fillet' ? filletSides(ctx, first, side, size(ctx)) : chamferSides(ctx, first, side, size(ctx));
        if (!ok) {
          ctx.say(kind === 'fillet' ? 'drafting.msg.filletFailed' : 'drafting.msg.chamferFailed');
          first = null;
          return 'continue';
        }
        return 'done';
      };
      return {
        prompt: () =>
          kind === 'fillet'
            ? { key: first ? 'drafting.prompt.filletSecond' : 'drafting.prompt.filletFirst', params: { radius: size(ctx) } }
            : { key: first ? 'drafting.prompt.chamferSecond' : 'drafting.prompt.chamferFirst', params: { distance: size(ctx) } },
        input: () => 'pick',
        basePoint: () => null,
        wantsValue: () => !first,
        onValue(r) {
          if (r >= 0) {
            if (kind === 'fillet') ctx.settings.filletRadius = r;
            else ctx.settings.chamferDistance = r;
          }
          return 'continue';
        },
        onPick(entity, at) {
          if (entity.shape.type !== 'line') {
            ctx.say(kind === 'fillet' ? 'drafting.msg.filletLinesOnly' : 'drafting.msg.chamferLinesOnly');
            return 'continue';
          }
          if (lockedSymbol(ctx, entity)) return 'continue';
          return take({ shape: entity.shape, at, entity });
        },
        onPickModelLine: (pick, at) => take(modelFilletSide(pick, at)),
        preview: (cursor) => (first ? cornerPreview(ctx, first, cursor, kind, size(ctx)) : []),
      };
    },
  };
}

export const filletCommand = cornerCommand('fillet');
export const chamferCommand = cornerCommand('chamfer');

export const EDIT_COMMANDS: readonly DraftCommandDef[] = [offsetCommand, trimCommand, extendCommand, filletCommand, chamferCommand];
