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
import { isGeometry, type DraftShape, type Pt } from '../types';
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
