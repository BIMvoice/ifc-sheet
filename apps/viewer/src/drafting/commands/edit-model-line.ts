/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TRIM and EXTEND on a line of the generated drawing (#189). The model's line is not edited in the model: the view hides it (the
 * same `hiddenLines` "Hide a line" writes, #33) and a drafted line takes its place with the new geometry. Both happen in ONE undo
 * step, so Undo brings the model's line back and takes the drafted one away.
 */

import { runAsOneUndoStep, editDrafts, newDraft } from '../draft-store';
import { hideLine } from '@/project/element-graphics-actions';
import { extendShape, trimShape } from '../trim';
import { filletLines, type LineShape } from '../fillet';
import { offsetShape } from '../offset';
import { isGeometry, type DraftEntity, type DraftShape, type Pt } from '../types';
import type { DraftContext, ModelLinePick } from './types';
import { boundariesFor } from './edit';

const near = (p: Pt, q: Pt): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

/** Hide `pick` in the view and draw `shapes` on the current layer instead, as one undo step. */
function replaceModelLine(ctx: DraftContext, pick: ModelLinePick, shapes: DraftShape[]): void {
  runAsOneUndoStep(() => {
    hideLine(ctx.viewId, pick.globalId, { start: pick.a, end: pick.b });
    editDrafts({ add: shapes.map((shape) => newDraft(ctx.viewId, ctx.layerId, shape, {})) });
  });
}

export function editModelLine(ctx: DraftContext, id: 'trim' | 'extend', pick: ModelLinePick, at: Pt): void {
  const line: DraftShape = { type: 'line', a: pick.a, b: pick.b };
  // The line itself is among the generated lines near it: it is not its own boundary.
  const boundaries = boundariesFor(ctx, { id: null, shape: line }, id === 'trim' ? 0.01 : 1000).filter(
    (s) => !(s.type === 'line' && isGeometry(s) && ((near(s.a, pick.a) && near(s.b, pick.b)) || (near(s.a, pick.b) && near(s.b, pick.a)))),
  );
  if (id === 'trim') {
    const pieces = trimShape(line, boundaries, at);
    if (!pieces) ctx.say('drafting.msg.nothingToTrim');
    else replaceModelLine(ctx, pick, pieces);
    return;
  }
  const extended = extendShape(line, boundaries, at);
  if (!extended) ctx.say('drafting.msg.noBoundary');
  else replaceModelLine(ctx, pick, [extended]);
}

/** One side of a FILLET: a drafted line, or a line of the generated drawing; `at` is where it was clicked. */
export interface FilletSide {
  shape: LineShape;
  at: Pt;
  entity?: DraftEntity;
  model?: ModelLinePick;
}

export const modelFilletSide = (pick: ModelLinePick, at: Pt): FilletSide => ({ shape: { type: 'line', a: pick.a, b: pick.b }, at, model: pick });

/** The same line picked twice (a model line has no id to compare). */
export const sameSide = (p: FilletSide, q: FilletSide): boolean =>
  p.entity && q.entity ? p.entity.id === q.entity.id : !!p.model && !!q.model && near(p.model.a, q.model.a) && near(p.model.b, q.model.b);

/**
 * FILLET where a side is a model line (#189): each model line is hidden in the view and its shortened line is drafted in its place,
 * a drafted side is updated in place, the arc is drafted. One undo step. False when the lines cannot be rounded.
 */
export function filletSides(ctx: DraftContext, first: FilletSide, second: FilletSide, radius: number): boolean {
  const result = filletLines(first.shape, first.at, second.shape, second.at, radius);
  if (!result) return false;
  const update = new Map<string, DraftShape>();
  const add: DraftEntity[] = [];
  runAsOneUndoStep(() => {
    for (const [side, shape] of [[first, result.first], [second, result.second]] as const) {
      if (side.entity) update.set(side.entity.id, shape);
      else if (side.model) {
        hideLine(ctx.viewId, side.model.globalId, { start: side.model.a, end: side.model.b });
        add.push(newDraft(ctx.viewId, ctx.layerId, shape, {}));
      }
    }
    if (result.arc) add.push(newDraft(ctx.viewId, first.entity?.layerId ?? ctx.layerId, result.arc, { ...first.entity?.params }));
    editDrafts({ update, add });
  });
  return true;
}

/** OFFSET of a model line: a copy at a distance, so the model's line stays and nothing is hidden. */
export function offsetModelLine(ctx: DraftContext, pick: ModelLinePick, distance: number, side: Pt): void {
  const shape = offsetShape({ type: 'line', a: pick.a, b: pick.b }, distance, side);
  if (shape) editDrafts({ add: [newDraft(ctx.viewId, ctx.layerId, shape, {})] });
}
