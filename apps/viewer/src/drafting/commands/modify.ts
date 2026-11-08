/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Modify commands on a selection: ERASE, MOVE, COPY, ROTATE, MIRROR.
 * (Pick-driven edits — OFFSET, TRIM, EXTEND, FILLET — are in `edit.ts`.)
 */

import { editDrafts, newDraft, runAsOneUndoStep } from '../draft-store';
import { entitySkeleton, mirrorEntity, rotateEntity, translateEntity } from '../annotation';
import { sub } from '../vec';
import { removeProjectItem, useProjectStore } from '@/project/project-store';
import { detailLink, isDetailMark } from '../detail-mark';
import { isLockedToView, withSectionParts, withoutSectionLink } from '../section-symbol';
import type { DraftEntity, DraftShape, Pt } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

function selected(ctx: DraftContext): DraftEntity[] {
  const ids = ctx.selection();
  return ctx.entities().filter((e) => ids.has(e.id));
}

/**
 * The part of the selection that may move or turn: all of it, a section
 * symbol whole. Its section's cut plane follows the symbol
 * (`section-link.ts`), so moving it is how a section is moved. A detail's
 * mark is the exception: its area has grips of its own, so it is left out
 * and the user is told.
 */
function editable(ctx: DraftContext): DraftEntity[] {
  const { items, locked } = movableOf(ctx.selection(), ctx.entities());
  if (locked) ctx.say('drafting.msg.sectionSymbolLocked');
  return items;
}

/** What of the selection `ids` moves (see `editable`), and whether a detail's mark was left out. Shared with dragging a selection (#168). */
export function movableOf(ids: ReadonlySet<string>, entities: readonly DraftEntity[]): { items: DraftEntity[]; locked: boolean } {
  const whole = withSectionParts(new Set(entities.filter((e) => ids.has(e.id)).map((e) => e.id)), entities);
  const all = entities.filter((e) => whole.has(e.id));
  const views = useProjectStore.getState().views;
  const items = all.filter((e) => !isDetailMark(e, views));
  return { items, locked: items.length < all.length };
}

/**
 * MOVE's and COPY's one edit, by the vector `d`: a move shifts `items` in place, a copy adds them shifted (as plain
 * drawing, no section link), each one undo step. Returns the ids of the copies. Shared with dragging a selection (#168).
 */
export function displaceDrafts(mode: 'move' | 'copy', viewId: string, items: readonly DraftEntity[], d: Pt): string[] {
  if (mode === 'move') {
    editDrafts({ update: new Map(items.map((e) => [e.id, translateEntity(e.shape, d)])) });
    return [];
  }
  return editDrafts({ add: items.map((e) => newDraft(viewId, e.layerId, translateEntity(e.shape, d), withoutSectionLink(e.params))) });
}

/** ROTATE's one edit: `items` turned in place about `centre` by `angle` (drawing radians), one undo step. Shared with turning a selection by its handle (#168). */
export function rotateDrafts(items: readonly DraftEntity[], centre: Pt, angle: number): void {
  editDrafts({ update: new Map(items.map((e) => [e.id, rotateEntity(e.shape, centre, angle)])) });
}

/**
 * MIRROR's one edit about the line `a`-`b`, one undo step: `copies` are added mirrored (as plain drawing, no section
 * link) and `flips` are mirrored in place. Text is mirrored in position and stays readable (`mirrorEntity`). Returns
 * the ids of the copies. Shared with the selection bar's flip buttons (#168).
 */
export function mirrorDrafts(viewId: string, a: Pt, b: Pt, { copies = [], flips = [] }: { copies?: readonly DraftEntity[]; flips?: readonly DraftEntity[] }): string[] {
  const add = copies.map((e) => newDraft(viewId, e.layerId, mirrorEntity(e.shape, a, b), withoutSectionLink(e.params)));
  return editDrafts({ add, update: new Map(flips.map((e) => [e.id, mirrorEntity(e.shape, a, b)])) });
}

export const eraseCommand: DraftCommandDef = {
  id: 'erase',
  aliases: ['ERASE', 'E', 'DELETE'],
  labelKey: 'drafting.cmd.erase',
  needsSelection: true,
  create(ctx) {
    return {
      prompt: () => ({ key: 'drafting.prompt.selectObjects' }),
      input: () => 'pick',
      basePoint: () => null,
      onEnter() {
        // The parts of a section symbol go together.
        const ids = withSectionParts(new Set(selected(ctx).map((e) => e.id)), ctx.entities());
        if (ids.size) {
          // Erasing a detail's mark removes the detail, as removing the detail removes its mark.
          const details = new Set(ctx.entities().flatMap((e) => (ids.has(e.id) ? [detailLink(e)] : [])).filter((d): d is string => d !== null));
          runAsOneUndoStep(() => {
            editDrafts({ remove: ids });
            for (const id of details) removeProjectItem(id);
          });
          ctx.say('drafting.msg.erased', { count: ids.size });
        }
        ctx.setSelection(new Set());
        return 'done';
      },
    };
  },
};

/** MOVE and COPY: a base point, then a destination (COPY repeats until Enter). */
function displaceCommand(id: 'move' | 'copy'): DraftCommandDef {
  return {
    id,
    aliases: id === 'move' ? ['MOVE', 'M'] : ['COPY', 'CO', 'CP'],
    labelKey: id === 'move' ? 'drafting.cmd.move' : 'drafting.cmd.copy',
    needsSelection: true,
    create(ctx) {
      // A copy is plain drawing; only a move would pull the symbol away from its section.
      const items = id === 'move' ? editable(ctx) : selected(ctx);
      let base: Pt | null = null;
      return {
        prompt: () => ({ key: base ? 'drafting.prompt.secondPoint' : 'drafting.prompt.basePoint' }),
        input: () => 'point',
        basePoint: () => base,
        onPoint(p) {
          if (!base) {
            base = p;
            return 'continue';
          }
          displaceDrafts(id, ctx.viewId, items, sub(p, base));
          return id === 'move' ? 'done' : 'continue';
        },
        onEnter: () => 'done',
        preview: (cursor) => (base ? items.flatMap((e) => entitySkeleton(translateEntity(e.shape, sub(cursor, base as Pt)))) : []),
      };
    },
  };
}

export const moveCommand = displaceCommand('move');
export const copyCommand = displaceCommand('copy');

export const rotateCommand: DraftCommandDef = {
  id: 'rotate',
  aliases: ['ROTATE', 'RO'],
  labelKey: 'drafting.cmd.rotate',
  needsSelection: true,
  create(ctx) {
    const items = editable(ctx);
    let base: Pt | null = null;
    const apply = (angle: number) => {
      if (base) rotateDrafts(items, base, angle);
      return 'done' as const;
    };
    const angleTo = (p: Pt) => (base ? Math.atan2(p.y - base.y, p.x - base.x) : 0);
    return {
      prompt: () => ({ key: base ? 'drafting.prompt.rotationAngle' : 'drafting.prompt.basePoint' }),
      input: () => 'point',
      basePoint: () => base,
      onPoint(p) {
        if (!base) {
          base = p;
          return 'continue';
        }
        return apply(angleTo(p));
      },
      wantsValue: () => base !== null,
      // Typed degrees are counter-clockwise ON SCREEN.
      onValue: (deg) => apply(((deg * Math.PI) / 180) * ctx.orientation),
      preview: (cursor) => (base ? items.flatMap((e) => entitySkeleton(rotateEntity(e.shape, base as Pt, angleTo(cursor)))) : []),
    };
  },
};

export const mirrorCommand: DraftCommandDef = {
  id: 'mirror',
  aliases: ['MIRROR', 'MI'],
  labelKey: 'drafting.cmd.mirror',
  needsSelection: true,
  create(ctx) {
    const items = selected(ctx);
    let first: Pt | null = null;
    let eraseSource = false;
    return {
      prompt: () => ({ key: first ? 'drafting.prompt.mirrorSecond' : 'drafting.prompt.mirrorFirst', params: { erase: eraseSource ? 'Y' : 'N' } }),
      input: () => 'point',
      basePoint: () => first,
      onPoint(p) {
        if (!first) {
          first = p;
          return 'continue';
        }
        // Erasing the source cannot take a section symbol (or a detail's mark) with it: that would be moving it. Those get a
        // mirrored copy and stay; the rest is mirrored in place, which is the same drawing as a copy and the source erased.
        const locked = eraseSource ? items.filter((e) => isLockedToView(e, useProjectStore.getState().views)) : [];
        if (locked.length) ctx.say('drafting.msg.sectionSymbolLocked');
        mirrorDrafts(ctx.viewId, first, p, eraseSource ? { copies: locked, flips: items.filter((e) => !locked.includes(e)) } : { copies: items });
        return 'done';
      },
      onKeyword(word) {
        if (word !== 'E' && word !== 'ERASE') return undefined;
        eraseSource = !eraseSource;
        return 'continue';
      },
      preview: (cursor): DraftShape[] => (first ? items.flatMap((e) => entitySkeleton(mirrorEntity(e.shape, first as Pt, cursor))) : []),
    };
  },
};

export const MODIFY_COMMANDS: readonly DraftCommandDef[] = [eraseCommand, moveCommand, copyCommand, rotateCommand, mirrorCommand];
